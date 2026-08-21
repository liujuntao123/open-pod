import fs from "node:fs";
import path from "node:path";
import { computeAudioFingerprint, type SynthesisSnapshot } from "@open-pod/shared";
import { concatWavFiles, DEFAULT_LINE_GAP_MS } from "./audio/concat.js";
import { mixVoiceWithBgm } from "./audio/mix-bgm.js";
import {
  buildDialogueCues,
  chapterSrtPathFromWav,
  writeSrtFile,
} from "./audio/srt.js";
import { assertPresetAvailable, clampBgmIntroSeconds, clampBgmVolume } from "./bgm/presets.js";
import type { Db } from "./db.js";
import { resolveLineSynthesis } from "./domain/lines.js";
import { chapterExportPath, lineAudioPath } from "./paths.js";
import { fishSynthesize } from "./providers/fish.js";
import { mimoSynthesize } from "./providers/mimo.js";
import { getProviderApiKey } from "./secrets.js";
import { nowIso, parseJsonObject, truncateError } from "./util.js";

type JobRow = {
  id: string;
  kind: string;
  status: string;
  work_id: string | null;
  chapter_id: string | null;
  line_id: string | null;
  snapshot_json: string | null;
};

export type StudioPaths = {
  secretsPath: string;
  audioDir: string;
  exportDir: string;
};

export class JobWorker {
  private running = 0;
  private timer: NodeJS.Timeout | null = null;
  private aborts = new Map<string, AbortController>();

  constructor(
    private db: Db,
    private paths: StudioPaths,
  ) {}

  start(): void {
    this.recoverInterrupted();
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop(): void {
    clearInterval(this.timer ?? undefined);
    this.timer = null;
    for (const c of this.aborts.values()) c.abort();
  }

  cancelJob(jobId: string): boolean {
    const row = this.db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(jobId) as
      | { status: string }
      | undefined;
    if (!row) return false;
    if (row.status === "queued") {
      this.db
        .prepare(
          `UPDATE jobs SET status = 'cancelled', updated_at = ?, finished_at = ? WHERE id = ? AND status = 'queued'`,
        )
        .run(nowIso(), nowIso(), jobId);
      return true;
    }
    if (row.status === "running") {
      this.aborts.get(jobId)?.abort();
      this.db
        .prepare(
          `UPDATE jobs SET status = 'cancelled', updated_at = ?, finished_at = ? WHERE id = ? AND status = 'running'`,
        )
        .run(nowIso(), nowIso(), jobId);
      return true;
    }
    return false;
  }

  cancelQueuedForChapter(chapterId: string): number {
    const r = this.db
      .prepare(
        `UPDATE jobs SET status = 'cancelled', updated_at = ?, finished_at = ?
         WHERE chapter_id = ? AND status = 'queued'`,
      )
      .run(nowIso(), nowIso(), chapterId);
    return r.changes;
  }

  private recoverInterrupted(): void {
    this.db
      .prepare(
        `UPDATE jobs SET status = 'failed', error = ?, updated_at = ?, finished_at = ?
         WHERE status = 'running'`,
      )
      .run("进程中断", nowIso(), nowIso());
  }

  private concurrency(): number {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'tts_concurrency'`).get() as
      | { value: string }
      | undefined;
    const n = Number(row?.value ?? 1);
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 4) : 1;
  }

  private tick(): void {
    const limit = this.concurrency();
    while (this.running < limit) {
      const job = this.db
        .prepare(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`)
        .get() as JobRow | undefined;
      if (!job) break;
      const claimed = this.db
        .prepare(
          `UPDATE jobs SET status = 'running', started_at = ?, updated_at = ?
           WHERE id = ? AND status = 'queued'`,
        )
        .run(nowIso(), nowIso(), job.id);
      if (claimed.changes === 0) continue;
      this.running += 1;
      void this.runJob(job).finally(() => {
        this.running -= 1;
        this.aborts.delete(job.id);
      });
    }
  }

  private async runJob(job: JobRow): Promise<void> {
    const ac = new AbortController();
    this.aborts.set(job.id, ac);
    try {
      if (job.kind === "line_synthesis") await this.runLineSynthesis(job, ac.signal);
      else if (job.kind === "chapter_export") await this.runChapterExport(job);
      else throw new Error(`未知任务类型 ${job.kind}`);

      const still = this.db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(job.id) as
        | { status: string }
        | undefined;
      if (still?.status === "running") {
        this.db
          .prepare(
            `UPDATE jobs SET status = 'succeeded', updated_at = ?, finished_at = ?, error = NULL WHERE id = ?`,
          )
          .run(nowIso(), nowIso(), job.id);
      }
    } catch (err) {
      const still = this.db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(job.id) as
        | { status: string }
        | undefined;
      if (still?.status === "cancelled") return;
      if (ac.signal.aborted) {
        this.db
          .prepare(
            `UPDATE jobs SET status = 'cancelled', updated_at = ?, finished_at = ? WHERE id = ?`,
          )
          .run(nowIso(), nowIso(), job.id);
        return;
      }
      const msg = truncateError(err);
      console.error(`[job ${job.id}] ${job.kind} failed: ${msg}`);
      this.db
        .prepare(
          `UPDATE jobs SET status = 'failed', error = ?, updated_at = ?, finished_at = ? WHERE id = ?`,
        )
        .run(msg, nowIso(), nowIso(), job.id);
    }
  }

  private async runLineSynthesis(job: JobRow, signal: AbortSignal): Promise<void> {
    if (!job.line_id) throw new Error("行生成任务缺少 line_id");
    if (!job.snapshot_json) throw new Error("缺少生成快照");
    const snapshot = JSON.parse(job.snapshot_json) as SynthesisSnapshot;

    const apiKey = getProviderApiKey(this.paths.secretsPath, snapshot.providerConnectionId);
    if (!apiKey) throw new Error("Provider API Key 未配置");

    const voiceRow = this.db
      .prepare(`SELECT config_json FROM voices WHERE id = ?`)
      .get(snapshot.voiceId) as { config_json: string } | undefined;
    if (!voiceRow) throw new Error("音色不存在");
    const voiceConfig = parseJsonObject(voiceRow.config_json);

    const conn = this.db
      .prepare(`SELECT base_url FROM provider_connections WHERE id = ?`)
      .get(snapshot.providerConnectionId) as { base_url: string } | undefined;
    if (!conn) throw new Error("Provider 连接不存在");

    const audio =
      snapshot.provider === "mimo"
        ? await mimoSynthesize({
            baseUrl: conn.base_url,
            apiKey,
            text: snapshot.text,
            config: { ...voiceConfig, ...snapshot.voiceIdentity },
            effectiveParams: snapshot.effectiveParams,
            signal,
          })
        : await fishSynthesize({
            baseUrl: conn.base_url,
            apiKey,
            text: snapshot.text,
            config: { ...voiceConfig, ...snapshot.voiceIdentity },
            effectiveParams: snapshot.effectiveParams,
            signal,
          });

    const status = this.db.prepare(`SELECT status FROM jobs WHERE id = ?`).get(job.id) as
      | { status: string }
      | undefined;
    if (status?.status === "cancelled" || signal.aborted) return;

    const out = lineAudioPath(this.paths.audioDir, job.line_id);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, audio);

    const fp = computeAudioFingerprint({
      text: snapshot.text,
      voiceIdentity: snapshot.voiceIdentity,
      effectiveParams: snapshot.effectiveParams,
    });

    this.db
      .prepare(
        `UPDATE lines SET audio_path = ?, audio_fingerprint = ?, updated_at = ? WHERE id = ?`,
      )
      .run(out, fp, nowIso(), job.line_id);
  }

  private async runChapterExport(job: JobRow): Promise<void> {
    if (!job.chapter_id) throw new Error("合成任务缺少 chapter_id");
    const chapter = this.db
      .prepare(
        `SELECT c.*, w.title as work_title FROM chapters c JOIN works w ON w.id = c.work_id WHERE c.id = ?`,
      )
      .get(job.chapter_id) as
      | {
          id: string;
          work_id: string;
          title: string;
          position: number;
          work_title: string;
          bgm_preset_id: string | null;
          bgm_volume: number;
          bgm_intro_seconds: number;
        }
      | undefined;
    if (!chapter) throw new Error("章节不存在");

    let prior: {
      lineIds?: string[];
      bgm?: { presetId?: string | null; volume?: number; introSeconds?: number };
    } = {};
    if (job.snapshot_json) {
      try {
        prior = JSON.parse(job.snapshot_json) as typeof prior;
      } catch {
        prior = {};
      }
    }

    let lines = this.db
      .prepare(
        `SELECT id, text, audio_path, position FROM lines WHERE chapter_id = ? ORDER BY position ASC`,
      )
      .all(job.chapter_id) as {
      id: string;
      text: string;
      audio_path: string | null;
      position: number;
    }[];

    if (Array.isArray(prior.lineIds) && prior.lineIds.length > 0) {
      const set = new Set(prior.lineIds);
      lines = lines.filter((l) => set.has(l.id));
    }

    const playable = lines.filter((l) => l.audio_path && fs.existsSync(l.audio_path));
    const skipped = lines.filter((l) => !l.audio_path || !fs.existsSync(l.audio_path));
    if (playable.length === 0) {
      throw new Error("没有可合成的行音频");
    }

    const bgmPresetId =
      prior.bgm && "presetId" in prior.bgm
        ? prior.bgm.presetId ?? null
        : chapter.bgm_preset_id && String(chapter.bgm_preset_id).length > 0
          ? String(chapter.bgm_preset_id)
          : null;
    const bgmVolume = clampBgmVolume(
      prior.bgm?.volume ?? chapter.bgm_volume ?? 45,
    );
    const bgmIntroSeconds = clampBgmIntroSeconds(
      prior.bgm?.introSeconds ?? chapter.bgm_intro_seconds ?? 3,
    );

    let bgmPath: string | null = null;
    if (bgmPresetId) {
      const avail = assertPresetAvailable(bgmPresetId);
      if (!avail.ok) throw new Error(avail.error);
      bgmPath = avail.path;
    }

    const out = chapterExportPath(
      this.paths.exportDir,
      chapter.work_title,
      chapter.position,
      chapter.title,
    );
    const srtOut = chapterSrtPathFromWav(out);
    const introMs = bgmPath ? bgmIntroSeconds * 1000 : 0;

    if (bgmPath) {
      const tmpVoice = path.join(
        path.dirname(out),
        `.tmp-voice-${job.id}.wav`,
      );
      try {
        concatWavFiles(
          playable.map((l) => l.audio_path!),
          tmpVoice,
        );
        mixVoiceWithBgm({
          voicePath: tmpVoice,
          bgmPath,
          outPath: out,
          volume01: bgmVolume / 100,
          introMs,
        });
      } finally {
        try {
          fs.unlinkSync(tmpVoice);
        } catch {
          /* ignore */
        }
      }
    } else {
      concatWavFiles(
        playable.map((l) => l.audio_path!),
        out,
      );
    }

    // Dialogue-only SRT aligned to the assembled timeline (intro + line durations + gaps).
    // Written every successful compose so download can optionally include it.
    const cues = buildDialogueCues({
      segments: playable.map((l) => ({
        audioPath: l.audio_path!,
        text: l.text ?? "",
      })),
      gapMs: DEFAULT_LINE_GAP_MS,
      offsetMs: introMs,
    });
    writeSrtFile(srtOut, cues);

    this.db
      .prepare(`UPDATE jobs SET snapshot_json = ? WHERE id = ?`)
      .run(
        JSON.stringify({
          ...prior,
          bgm: { presetId: bgmPresetId, volume: bgmVolume, introSeconds: bgmIntroSeconds },
          exportPath: out,
          exportSrtPath: srtOut,
          includedLineIds: playable.map((l) => l.id),
          skippedLineIds: skipped.map((l) => l.id),
        }),
        job.id,
      );
  }
}

export function buildLineSnapshot(db: Db, lineId: string): SynthesisSnapshot {
  const resolved = resolveLineSynthesis(db, lineId);
  return {
    lineId,
    text: resolved.text,
    voiceId: resolved.voiceId,
    provider: resolved.provider,
    providerConnectionId: resolved.providerConnectionId,
    voiceIdentity: resolved.voiceIdentity,
    effectiveParams: resolved.effectiveParams,
  };
}
