import fs from "node:fs";
import {
  runEpubPipeline,
  runPdfPipeline,
  retryFailedPdfSegments,
  type CreateJobOptions,
  type JobPhase,
  type JobStatus,
  type SegmentResult,
} from "@open-pod/convert-core";
import type { Db } from "./db.js";
import { getSetting } from "./db.js";
import { resolveMineruToken } from "./secrets.js";
import { nowIso } from "./util.js";

export type StudioPaths = {
  secretsPath: string;
  jobsDir: string;
};

type JobRow = {
  id: string;
  source_type: string;
  source_name: string;
  status: string;
  phase: string;
  progress_message: string;
  options_json: string;
  segments_json: string;
  warnings_json: string;
  error: string | null;
  manifest_json: string | null;
  source_path: string;
  work_dir: string;
  zip_path: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export class ConvertWorker {
  private db: Db;
  paths: StudioPaths;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private aborts = new Map<string, AbortController>();
  private cancelFlags = new Set<string>();

  constructor(db: Db, paths: StudioPaths) {
    this.db = db;
    this.paths = paths;
  }

  start(): void {
    // recover running
    const t = nowIso();
    this.db
      .prepare(
        `UPDATE jobs SET status = 'failed', error = '进程中断', phase = 'done', updated_at = ?, finished_at = ?
         WHERE status = 'running'`,
      )
      .run(t, t);
    this.timer = setInterval(() => {
      void this.tick();
    }, 500);
    void this.tick();
  }
  stop(): void {
    clearInterval(this.timer!);
    this.timer = null;
  }

  requestCancel(jobId: string): void {
    this.cancelFlags.add(jobId);
    this.aborts.get(jobId)?.abort();
    const row = this.db
      .prepare(`SELECT status FROM jobs WHERE id = ?`)
      .get(jobId) as { status: string } | undefined;
    if (!row) return;
    if (row.status === "queued") {
      const t = nowIso();
      this.db
        .prepare(
          `UPDATE jobs SET status = 'cancelled', phase = 'done', updated_at = ?, finished_at = ?, progress_message = '已取消' WHERE id = ?`,
        )
        .run(t, t, jobId);
    }
  }

  private isCancelled(jobId: string): boolean {
    return this.cancelFlags.has(jobId);
  }

  private updateProgress(jobId: string, phase: JobPhase, message: string): void {
    this.db
      .prepare(
        `UPDATE jobs SET phase = ?, progress_message = ?, updated_at = ? WHERE id = ?`,
      )
      .run(phase, message, nowIso(), jobId);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    const row = this.db
      .prepare(
        `SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
      )
      .get() as JobRow | undefined;
    if (!row) return;
    this.busy = true;
    try {
      await this.runJob(row);
    } finally {
      this.busy = false;
      this.cancelFlags.delete(row.id);
      this.aborts.delete(row.id);
    }
  }

  private async runJob(row: JobRow): Promise<void> {
    const ac = new AbortController();
    this.aborts.set(row.id, ac);
    const t0 = nowIso();
    this.db
      .prepare(
        `UPDATE jobs SET status = 'running', phase = 'accepted', progress_message = '开始', updated_at = ? WHERE id = ?`,
      )
      .run(t0, row.id);

    const options = JSON.parse(row.options_json) as CreateJobOptions;
    const proxyEnabled = getSetting(this.db, "proxy_enabled", "0") === "1";
    const proxyUrl = getSetting(this.db, "proxy_url", "") || undefined;
    const mineruToken = resolveMineruToken(this.paths.secretsPath);

    try {
      const input = {
        jobId: row.id,
        sourcePath: row.source_path,
        workDir: row.work_dir,
        options: {
          ...options,
          sourceType: row.source_type as CreateJobOptions["sourceType"],
          sourceName: row.source_name,
        },
        mineruToken,
        proxyEnabled,
        proxyUrl,
        createdAt: row.created_at,
      };

      const hooks = {
        signal: ac.signal,
        isCancelled: () => this.isCancelled(row.id),
        onProgress: (p: { phase: JobPhase; message: string }) => {
          this.updateProgress(row.id, p.phase, p.message);
        },
      };

      const result =
        row.source_type === "epub"
          ? await runEpubPipeline(input, hooks)
          : await runPdfPipeline(input, hooks);

      if (this.isCancelled(row.id)) {
        this.finish(row.id, "cancelled", "已取消", null, result.segments, result.manifest);
        return;
      }

      this.finish(
        row.id,
        result.status,
        result.status === "partial" ? "部分成功" : "完成",
        result.zipPath,
        result.segments,
        result.manifest,
        result.manifest.warnings,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError" || this.isCancelled(row.id)) {
        this.finish(row.id, "cancelled", "已取消", null, [], null);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.finish(row.id, "failed", msg, null, [], null, [], msg);
    }
  }

  async retryFailed(jobId: string): Promise<void> {
    const row = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as
      | JobRow
      | undefined;
    if (!row) throw new Error("任务不存在");
    if (row.source_type !== "pdf") throw new Error("仅 PDF 支持重试失败页段");
    if (row.status !== "partial" && row.status !== "failed") {
      throw new Error("当前状态不可重试失败页段");
    }
    if (this.busy) throw new Error("已有任务运行中，请稍后再试");

    const segments = JSON.parse(row.segments_json || "[]") as SegmentResult[];
    if (!segments.some((s) => s.state === "failed")) {
      throw new Error("没有失败页段可重试");
    }

    this.busy = true;
    const ac = new AbortController();
    this.aborts.set(jobId, ac);
    this.cancelFlags.delete(jobId);
    const t0 = nowIso();
    this.db
      .prepare(
        `UPDATE jobs SET status = 'running', phase = 'extracting', progress_message = '重试失败页段', updated_at = ?, finished_at = NULL, error = NULL WHERE id = ?`,
      )
      .run(t0, jobId);

    try {
      const options = JSON.parse(row.options_json) as CreateJobOptions;
      const proxyEnabled = getSetting(this.db, "proxy_enabled", "0") === "1";
      const proxyUrl = getSetting(this.db, "proxy_url", "") || undefined;
      const mineruToken = resolveMineruToken(this.paths.secretsPath);
      const result = await retryFailedPdfSegments(
        {
          jobId: row.id,
          sourcePath: row.source_path,
          workDir: row.work_dir,
          options: {
            ...options,
            sourceType: "pdf",
            sourceName: row.source_name,
          },
          mineruToken,
          proxyEnabled,
          proxyUrl,
          createdAt: row.created_at,
          previousSegments: segments,
        },
        {
          signal: ac.signal,
          isCancelled: () => this.isCancelled(jobId),
          onProgress: (p) => this.updateProgress(jobId, p.phase, p.message),
        },
      );
      this.finish(
        jobId,
        result.status,
        result.status === "partial" ? "部分成功" : "完成",
        result.zipPath,
        result.segments,
        result.manifest,
        result.manifest.warnings,
      );
    } catch (err) {
      if ((err as Error).name === "AbortError" || this.isCancelled(jobId)) {
        this.finish(jobId, "cancelled", "已取消", null, segments, null);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.finish(jobId, "failed", msg, row.zip_path, segments, null, [], msg);
      }
    } finally {
      this.busy = false;
      this.aborts.delete(jobId);
      this.cancelFlags.delete(jobId);
    }
  }

  private finish(
    jobId: string,
    status: JobStatus,
    progressMessage: string,
    zipPath: string | null,
    segments: SegmentResult[],
    manifest: unknown,
    warnings: string[] = [],
    error?: string,
  ): void {
    const t = nowIso();
    // strip huge fullMd from segments for optional lean storage? keep for retry
    const leanSegments = segments.map((s) => ({
      ...s,
      // keep fullMd for retry
    }));
    this.db
      .prepare(
        `UPDATE jobs SET
          status = ?,
          phase = 'done',
          progress_message = ?,
          zip_path = ?,
          segments_json = ?,
          warnings_json = ?,
          manifest_json = ?,
          error = ?,
          updated_at = ?,
          finished_at = ?
        WHERE id = ?`,
      )
      .run(
        status,
        progressMessage,
        zipPath,
        JSON.stringify(leanSegments),
        JSON.stringify(warnings),
        manifest ? JSON.stringify(manifest) : null,
        error ?? null,
        t,
        t,
        jobId,
      );
  }

  purgeExpired(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT id, work_dir FROM jobs
         WHERE finished_at IS NOT NULL AND finished_at < ?
           AND status IN ('succeeded','partial','failed','cancelled')`,
      )
      .all(cutoff) as Array<{ id: string; work_dir: string }>;
    let n = 0;
    for (const r of rows) {
      try {
        fs.rmSync(r.work_dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      this.db.prepare(`DELETE FROM jobs WHERE id = ?`).run(r.id);
      n++;
    }
    return n;
  }
}
