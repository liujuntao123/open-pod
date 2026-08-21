import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  FISH_VOICE_TEST_TEXT,
  MIMO_PRESET_VOICES,
  MIMO_VOICE_TEST_TEXT,
  defaultMimoVoiceConfig,
  fishEffectiveParams,
  isMimoPresetVoiceId,
  mimoEffectiveParams,
  mimoPresetLabel,
  formatScriptDraft,
  parseScriptImport,
  type JobDto,
  type TtsProviderKind,
  type VoiceDto,
  type WorkCharacterDto,
  type WorkDto,
  type ChapterDto,
} from "@open-pod/shared";
import type { Db } from "./db.js";
import { listChapterLines } from "./domain/lines.js";
import {
  assertPresetAvailable,
  clampBgmIntroSeconds,
  clampBgmVolume,
  listPresetTracks,
} from "./bgm/presets.js";
import {
  defaultBaseUrlFor,
  ensureBuiltinFishConnection,
  ensureBuiltinMimoConnection,
  ensureBuiltinProviderConnection,
  ensureBuiltinProviderConnections,
  getFishApiKey,
  getMimoApiKey,
  setFishApiKey,
  setFishBaseUrl,
  setMimoApiKey,
  setMimoBaseUrl,
} from "./provider-settings.js";
import { fishSynthesize } from "./providers/fish.js";
import { listFishModels, previewFishModel } from "./providers/fish-models.js";
import { mimoSynthesize } from "./providers/mimo.js";
import { streamScriptWithLlm } from "./script-llm.js";
import {
  getProviderApiKey,
  getScriptLlmApiKey,
  setScriptLlmApiKey,
} from "./secrets.js";
import { id, nowIso, parseJsonObject, truncateError } from "./util.js";
import { buildLineSnapshot, type JobWorker, type StudioPaths } from "./worker.js";

type Vars = {
  db: Db;
  paths: StudioPaths & { dataDir: string; tmpDir: string };
  worker: JobWorker;
};

export function createApp(ctx: Vars): Hono {
  const app = new Hono();
  const { db, paths, worker } = ctx;
  ensureBuiltinProviderConnections(db);


  app.use("/*", cors());

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/settings", (c) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'tts_concurrency'`).get() as
      | { value: string }
      | undefined;
    const llm = getScriptLlmSettings(db, paths.secretsPath);
    return c.json({
      dataDir: paths.dataDir,
      ttsConcurrency: Number(row?.value ?? 1),
      scriptLlm: llm,
    });
  });

  app.patch("/api/settings", async (c) => {
    const body = await c.req.json<{ ttsConcurrency?: number }>();
    if (body.ttsConcurrency != null) {
      const n = Math.min(4, Math.max(1, Math.floor(Number(body.ttsConcurrency))));
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('tts_concurrency', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(n));
    }
    return c.json({ ok: true });
  });

  // --- Script LLM (OpenAI-compatible) ---
  app.get("/api/script-llm", (c) => {
    return c.json(getScriptLlmSettings(db, paths.secretsPath));
  });

  app.put("/api/script-llm", async (c) => {
    const body = await c.req.json<{
      baseUrl?: string;
      model?: string;
      apiKey?: string | null;
    }>();
    const t = nowIso();
    if (body.baseUrl !== undefined) {
      const baseUrl = body.baseUrl.trim().replace(/\/$/, "");
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('script_llm_base_url', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(baseUrl);
    }
    if (body.model !== undefined) {
      db.prepare(
        `INSERT INTO settings (key, value) VALUES ('script_llm_model', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(body.model.trim());
    }
    if (body.apiKey !== undefined) {
      setScriptLlmApiKey(paths.secretsPath, body.apiKey);
    }
    // touch updated marker (optional)
    db.prepare(
      `INSERT INTO settings (key, value) VALUES ('script_llm_updated_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(t);
    return c.json(getScriptLlmSettings(db, paths.secretsPath));
  });

  /**
   * Generate a default MiMo character style_instruction from a preset template
   * via the same OpenAI-compatible script LLM. Result is not persisted — client
   * fills the textarea for optional edit + save on the character.
   */

  // --- Builtin Fish settings ---
  app.get("/api/fish", (c) => {
    const conn = ensureBuiltinFishConnection(db);
    return c.json(fishStatus(db, paths.secretsPath, conn));
  });

  app.put("/api/fish/api-key", async (c) => {
    const body = await c.req.json<{ apiKey?: string | null }>();
    const conn = setFishApiKey(db, paths.secretsPath, body.apiKey?.trim() || null);
    return c.json(fishStatus(db, paths.secretsPath, conn));
  });

  app.put("/api/fish/base-url", async (c) => {
    const body = await c.req.json<{ baseUrl?: string | null }>();
    const conn = setFishBaseUrl(db, body.baseUrl);
    return c.json(fishStatus(db, paths.secretsPath, conn));
  });

  // --- Builtin MiMo settings ---
  app.get("/api/mimo", (c) => {
    const conn = ensureBuiltinMimoConnection(db);
    return c.json(mimoStatus(db, paths.secretsPath, conn));
  });

  app.put("/api/mimo/api-key", async (c) => {
    const body = await c.req.json<{ apiKey?: string | null }>();
    const conn = setMimoApiKey(db, paths.secretsPath, body.apiKey?.trim() || null);
    return c.json(mimoStatus(db, paths.secretsPath, conn));
  });

  app.put("/api/mimo/base-url", async (c) => {
    const body = await c.req.json<{ baseUrl?: string | null }>();
    const conn = setMimoBaseUrl(db, body.baseUrl);
    return c.json(mimoStatus(db, paths.secretsPath, conn));
  });

  app.get("/api/mimo/presets", (c) => {
    ensureBuiltinMimoConnection(db);
    return c.json(
      MIMO_PRESET_VOICES.map((v) => ({
        id: v.id,
        name: v.name,
        language: v.language,
        gender: v.gender,
      })),
    );
  });

  app.post("/api/mimo/voices/ensure", async (c) => {
    const conn = ensureBuiltinMimoConnection(db);
    const body = await c.req.json<{ voice?: string }>();
    const voiceId = body.voice?.trim() ?? "";
    if (!voiceId) return c.json({ error: "缺少 voice" }, 400);
    if (!isMimoPresetVoiceId(voiceId)) return c.json({ error: "未知的 MiMo 预置音色" }, 400);

    const existing = db
      .prepare(`SELECT id, config_json FROM voices WHERE provider_connection_id = ?`)
      .all(conn.id) as { id: string; config_json: string }[];
    const found = existing.find((v) => parseJsonObject(v.config_json).voice === voiceId);
    const t = nowIso();
    const config = defaultMimoVoiceConfig(voiceId);
    const name = mimoPresetLabel(voiceId);
    if (found) {
      db.prepare(`UPDATE voices SET name = ?, config_json = ?, updated_at = ? WHERE id = ?`).run(
        name,
        JSON.stringify({ ...parseJsonObject(found.config_json), ...config }),
        t,
        found.id,
      );
      const row = db
        .prepare(
          `SELECT v.*, pc.provider FROM voices v
           JOIN provider_connections pc ON pc.id = v.provider_connection_id WHERE v.id = ?`,
        )
        .get(found.id) as VoiceRow;
      return c.json(mapVoice(row));
    }
    const newId = id();
    db.prepare(
      `INSERT INTO voices (id, provider_connection_id, name, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(newId, conn.id, name, JSON.stringify(config), t, t);
    const row = db
      .prepare(
        `SELECT v.*, pc.provider FROM voices v
         JOIN provider_connections pc ON pc.id = v.provider_connection_id WHERE v.id = ?`,
      )
      .get(newId) as VoiceRow;
    return c.json(mapVoice(row), 201);
  });

  // --- Voices (imported from official Fish library) ---
  app.get("/api/voices", (c) => {
    ensureBuiltinFishConnection(db);
    const rows = db
      .prepare(
        `SELECT v.*, pc.provider FROM voices v
         JOIN provider_connections pc ON pc.id = v.provider_connection_id
         ORDER BY v.created_at ASC`,
      )
      .all() as VoiceRow[];
    return c.json(rows.map(mapVoice));
  });

  app.delete("/api/voices/:id", (c) => {
    const voiceId = c.req.param("id");
    const used = db
      .prepare(`SELECT COUNT(*) as n FROM work_characters WHERE voice_id = ?`)
      .get(voiceId) as { n: number };
    if (used.n > 0) return c.json({ error: "仍有作品角色引用该音色，无法删除" }, 409);
    db.prepare(`DELETE FROM voices WHERE id = ?`).run(voiceId);
    return c.json({ ok: true });
  });

  app.post("/api/voices/:id/test", async (c) => {
    const voiceId = c.req.param("id");
    const row = db
      .prepare(
        `SELECT v.*, pc.provider, pc.base_url, pc.id as connection_id FROM voices v
         JOIN provider_connections pc ON pc.id = v.provider_connection_id WHERE v.id = ?`,
      )
      .get(voiceId) as
      | (VoiceRow & { base_url: string; connection_id: string })
      | undefined;
    if (!row) return c.json({ error: "音色不存在" }, 404);
    if (row.provider !== "fish" && row.provider !== "mimo") {
      return c.json({ error: "不支持的 Provider" }, 400);
    }
    const apiKey = getProviderApiKey(paths.secretsPath, row.connection_id);
    if (!apiKey) return c.json({ error: "API Key 未配置" }, 400);
    const config = parseJsonObject(row.config_json);
    try {
      const audio =
        row.provider === "mimo"
          ? await mimoSynthesize({
              baseUrl: row.base_url,
              apiKey,
              text: MIMO_VOICE_TEST_TEXT,
              config,
              effectiveParams: mimoEffectiveParams(config),
            })
          : await fishSynthesize({
              baseUrl: row.base_url,
              apiKey,
              text: FISH_VOICE_TEST_TEXT,
              config,
              effectiveParams: fishEffectiveParams(config),
            });
      const tmp = path.join(paths.tmpDir, `voice-test-${voiceId}.wav`);
      fs.writeFileSync(tmp, audio);
      return c.json({ ok: true, path: tmp, url: `/api/files?path=${encodeURIComponent(tmp)}` });
    } catch (err) {
      return c.json({ error: truncateError(err) }, 502);
    }
  });

  app.get("/api/fish/models", async (c) => {
    const conn = ensureBuiltinFishConnection(db);
    const apiKey = getFishApiKey(db, paths.secretsPath);
    if (!apiKey) return c.json({ error: "请先配置 Fish API Key" }, 400);
    try {
      const pageNumber = Number(c.req.query("pageNumber") ?? 1);
      const pageSize = Number(c.req.query("pageSize") ?? 24);
      const tab = c.req.query("tab") ?? "explore";
      const result = await listFishModels({
        baseUrl: conn.base_url,
        apiKey,
        pageNumber,
        pageSize,
        title: c.req.query("title") ?? undefined,
        self: c.req.query("self") === "true",
        language: c.req.query("language") ?? undefined,
        titleLanguage: c.req.query("titleLanguage") ?? undefined,
        sortBy: (c.req.query("sortBy") as "score" | "task_count" | "created_at" | null) || "score",
        onlyOfficialFavorite: tab === "favorites",
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: truncateError(err) }, 502);
    }
  });

  app.get("/api/fish/models/:id/preview", async (c) => {
    const conn = ensureBuiltinFishConnection(db);
    const apiKey = getFishApiKey(db, paths.secretsPath);
    if (!apiKey) return c.json({ error: "请先配置 Fish API Key" }, 400);
    const modelId = c.req.param("id");
    try {
      const detail = await previewFishModel({
        baseUrl: conn.base_url,
        apiKey,
        modelId,
      });
      if (detail.previewUrl) {
        return c.json({ kind: "url" as const, url: detail.previewUrl });
      }
      // Fallback: synthesize a short phrase with this reference_id
      const text = detail.defaultText?.trim() || "你好，这是一段音色试听。";
      const audio = await fishSynthesize({
        baseUrl: conn.base_url,
        apiKey,
        text: text.slice(0, 80),
        config: {
          model: "s2.1-pro-free",
          reference_id: modelId,
        },
      });
      const tmp = path.join(paths.tmpDir, `preview-${modelId}.wav`);
      fs.writeFileSync(tmp, audio);
      return c.json({
        kind: "file" as const,
        url: `/api/files?path=${encodeURIComponent(tmp)}`,
      });
    } catch (err) {
      return c.json({ error: truncateError(err) }, 502);
    }
  });

  app.post("/api/fish/models/import", async (c) => {
    const conn = ensureBuiltinFishConnection(db);
    const body = await c.req.json<{
      referenceId?: string;
      title?: string;
      model?: string;
    }>();
    if (!body.referenceId?.trim()) return c.json({ error: "缺少 referenceId" }, 400);
    const existing = db
      .prepare(`SELECT id, config_json FROM voices WHERE provider_connection_id = ?`)
      .all(conn.id) as { id: string; config_json: string }[];
    const found = existing.find(
      (v) => parseJsonObject(v.config_json).reference_id === body.referenceId!.trim(),
    );
    const t = nowIso();
    const config = {
      model: body.model?.trim() || "s2.1-pro-free",
      reference_id: body.referenceId.trim(),
      speed: 1,
      volume: 0,
      temperature: 0.7,
      top_p: 0.7,
      latency: "normal",
    };
    if (found) {
      db.prepare(`UPDATE voices SET name = ?, config_json = ?, updated_at = ? WHERE id = ?`).run(
        body.title?.trim() || body.referenceId.trim(),
        JSON.stringify(config),
        t,
        found.id,
      );
      const row = db
        .prepare(
          `SELECT v.*, pc.provider FROM voices v
           JOIN provider_connections pc ON pc.id = v.provider_connection_id WHERE v.id = ?`,
        )
        .get(found.id) as VoiceRow;
      return c.json(mapVoice(row));
    }
    const voiceId = id();
    db.prepare(
      `INSERT INTO voices (id, provider_connection_id, name, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      voiceId,
      conn.id,
      body.title?.trim() || body.referenceId.trim(),
      JSON.stringify(config),
      t,
      t,
    );
    const row = db
      .prepare(
        `SELECT v.*, pc.provider FROM voices v
         JOIN provider_connections pc ON pc.id = v.provider_connection_id WHERE v.id = ?`,
      )
      .get(voiceId) as VoiceRow;
    return c.json(mapVoice(row), 201);
  });
  // --- Studio preset BGM tracks (read-only catalog) ---
  app.get("/api/bgm-presets", (c) => {
    return c.json(listPresetTracks());
  });

  app.get("/api/bgm-presets/:id/audio", (c) => {
    const avail = assertPresetAvailable(c.req.param("id"));
    if (!avail.ok) return c.json({ error: avail.error }, 404);
    const buf = fs.readFileSync(avail.path);
    return new Response(buf, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  });


  // --- Works ---
  app.get("/api/works", (c) => {
    const rows = db.prepare(`SELECT * FROM works ORDER BY updated_at DESC`).all() as WorkRow[];
    return c.json(rows.map(mapWork));
  });

  app.post("/api/works", async (c) => {
    const body = await c.req.json<{ title?: string; provider?: string }>();
    const workId = id();
    const t = nowIso();
    const title = body.title?.trim() || "未命名作品";
    const provider: TtsProviderKind = body.provider === "mimo" ? "mimo" : "fish";
    ensureBuiltinProviderConnection(db, provider);
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO works (id, title, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(workId, title, provider, t, t);
      const chapterId = id();
      db.prepare(
        `INSERT INTO chapters (id, work_id, title, position, script_draft, production_started, bgm_preset_id, bgm_volume, bgm_intro_seconds, created_at, updated_at)
         VALUES (?, ?, ?, 0, '', 0, NULL, 45, 3, ?, ?)`,
      ).run(chapterId, workId, "第一章", t, t);
      // Optional starter character named 旁白 — ordinary character, not a special type.
      const starterId = id();
      db.prepare(
        `INSERT INTO work_characters (id, work_id, name, is_narrator, voice_id, param_override_json, created_at, updated_at)
         VALUES (?, ?, '旁白', 0, NULL, '{}', ?, ?)`,
      ).run(starterId, workId, t, t);
    });
    tx();
    const row = db.prepare(`SELECT * FROM works WHERE id = ?`).get(workId) as WorkRow;
    return c.json(mapWork(row), 201);
  });

  app.get("/api/works/:id", (c) => {
    const row = db.prepare(`SELECT * FROM works WHERE id = ?`).get(c.req.param("id")) as
      | WorkRow
      | undefined;
    if (!row) return c.json({ error: "作品不存在" }, 404);
    return c.json(mapWork(row));
  });

  app.patch("/api/works/:id", async (c) => {
    const workId = c.req.param("id");
    const existing = db.prepare(`SELECT * FROM works WHERE id = ?`).get(workId) as WorkRow | undefined;
    if (!existing) return c.json({ error: "作品不存在" }, 404);
    const body = await c.req.json<{ title?: string; provider?: string }>();
    const t = nowIso();
    const nextTitle = body.title?.trim() || existing.title;
    const currentProvider: TtsProviderKind = existing.provider === "mimo" ? "mimo" : "fish";
    let nextProvider = currentProvider;
    if (body.provider !== undefined) {
      if (body.provider !== "fish" && body.provider !== "mimo") {
        return c.json({ error: "provider 必须是 fish 或 mimo" }, 400);
      }
      nextProvider = body.provider;
    }

    if (nextProvider !== currentProvider) {
      ensureBuiltinProviderConnection(db, nextProvider);
      const tx = db.transaction(() => {
        // Unbind mismatched character voices; clear character + line overrides; mark fingerprints stale.
        const chars = db
          .prepare(
            `SELECT c.id as char_id, c.voice_id, pc.provider as voice_provider
             FROM work_characters c
             LEFT JOIN voices v ON v.id = c.voice_id
             LEFT JOIN provider_connections pc ON pc.id = v.provider_connection_id
             WHERE c.work_id = ?`,
          )
          .all(workId) as {
          char_id: string;
          voice_id: string | null;
          voice_provider: string | null;
        }[];
        for (const ch of chars) {
          const mismatch = ch.voice_id && ch.voice_provider && ch.voice_provider !== nextProvider;
          if (mismatch || ch.voice_id) {
            // Always clear overrides on provider rebind; unbind only mismatched voices.
          }
          if (mismatch) {
            db.prepare(
              `UPDATE work_characters SET voice_id = NULL, param_override_json = '{}', updated_at = ? WHERE id = ?`,
            ).run(t, ch.char_id);
          } else {
            db.prepare(
              `UPDATE work_characters SET param_override_json = '{}', updated_at = ? WHERE id = ?`,
            ).run(t, ch.char_id);
          }
        }
        const lines = db
          .prepare(
            `SELECT l.id FROM lines l
             JOIN chapters ch ON ch.id = l.chapter_id
             WHERE ch.work_id = ?`,
          )
          .all(workId) as { id: string }[];
        for (const line of lines) {
          db.prepare(
            `UPDATE lines SET param_override_json = '{}', audio_fingerprint = CASE
               WHEN audio_path IS NOT NULL THEN 'stale-rebind'
               ELSE audio_fingerprint END, updated_at = ? WHERE id = ?`,
          ).run(t, line.id);
        }
        db.prepare(`UPDATE works SET title = ?, provider = ?, updated_at = ? WHERE id = ?`).run(
          nextTitle,
          nextProvider,
          t,
          workId,
        );
      });
      tx();
    } else {
      db.prepare(`UPDATE works SET title = ?, updated_at = ? WHERE id = ?`).run(nextTitle, t, workId);
    }

    const row = db.prepare(`SELECT * FROM works WHERE id = ?`).get(workId) as WorkRow;
    return c.json(mapWork(row));
  });

  app.delete("/api/works/:id", (c) => {
    const workId = c.req.param("id");
    const chapters = db.prepare(`SELECT id FROM chapters WHERE work_id = ?`).all(workId) as {
      id: string;
    }[];
    for (const ch of chapters) deleteChapterAudio(db, paths.audioDir, ch.id);
    db.prepare(`DELETE FROM works WHERE id = ?`).run(workId);
    return c.json({ ok: true });
  });

  // --- Chapters ---
  app.get("/api/works/:workId/chapters", (c) => {
    const rows = db
      .prepare(`SELECT * FROM chapters WHERE work_id = ? ORDER BY position ASC`)
      .all(c.req.param("workId")) as ChapterRow[];
    return c.json(rows.map(mapChapter));
  });

  app.post("/api/works/:workId/chapters", async (c) => {
    const workId = c.req.param("workId");
    const work = db.prepare(`SELECT id FROM works WHERE id = ?`).get(workId);
    if (!work) return c.json({ error: "作品不存在" }, 404);
    const body = await c.req.json<{
      title?: string;
      scriptDraft?: string;
      scriptInstruction?: string;
      scriptSourceText?: string;
    }>();
    const max = db
      .prepare(`SELECT COALESCE(MAX(position), -1) as m FROM chapters WHERE work_id = ?`)
      .get(workId) as { m: number };
    const chapterId = id();
    const t = nowIso();
    const scriptDraft = body.scriptDraft !== undefined ? String(body.scriptDraft) : "";
    const scriptInstruction =
      body.scriptInstruction !== undefined ? String(body.scriptInstruction) : "";
    const scriptSourceText =
      body.scriptSourceText !== undefined ? String(body.scriptSourceText) : "";
    db.prepare(
      `INSERT INTO chapters (
         id, work_id, title, position, script_draft, script_instruction, script_source_text,
         production_started, bgm_preset_id, bgm_volume, bgm_intro_seconds, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 45, 3, ?, ?)`,
    ).run(
      chapterId,
      workId,
      body.title?.trim() || `第${max.m + 2}章`,
      max.m + 1,
      scriptDraft,
      scriptInstruction,
      scriptSourceText,
      t,
      t,
    );
    db.prepare(`UPDATE works SET updated_at = ? WHERE id = ?`).run(t, workId);
    const row = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as ChapterRow;
    return c.json(mapChapter(row), 201);
  });

  app.patch("/api/chapters/:id", async (c) => {
    const chapterId = c.req.param("id");
    const existing = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
      | ChapterRow
      | undefined;
    if (!existing) return c.json({ error: "章节不存在" }, 404);
    const body = await c.req.json<{
      title?: string;
      position?: number;
      scriptDraft?: string;
      scriptInstruction?: string;
      scriptSourceText?: string;
      bgmPresetId?: string | null;
      bgmVolume?: number;
      bgmIntroSeconds?: number;
    }>();
    const t = nowIso();
    const title = body.title !== undefined ? body.title.trim() || existing.title : existing.title;
    const position = body.position ?? existing.position;
    const scriptDraft =
      body.scriptDraft !== undefined ? String(body.scriptDraft) : existing.script_draft ?? "";
    const scriptInstruction =
      body.scriptInstruction !== undefined
        ? String(body.scriptInstruction)
        : existing.script_instruction ?? "";
    const scriptSourceText =
      body.scriptSourceText !== undefined
        ? String(body.scriptSourceText)
        : existing.script_source_text ?? "";

    let bgmPresetId =
      existing.bgm_preset_id === undefined || existing.bgm_preset_id === ""
        ? null
        : existing.bgm_preset_id;
    if (body.bgmPresetId !== undefined) {
      if (body.bgmPresetId === null || body.bgmPresetId === "") {
        bgmPresetId = null;
      } else {
        const avail = assertPresetAvailable(body.bgmPresetId);
        if (!avail.ok) return c.json({ error: avail.error }, 400);
        bgmPresetId = body.bgmPresetId;
      }
    }
    const bgmVolume =
      body.bgmVolume !== undefined
        ? clampBgmVolume(body.bgmVolume, existing.bgm_volume ?? 45)
        : clampBgmVolume(existing.bgm_volume ?? 45);
    const bgmIntroSeconds =
      body.bgmIntroSeconds !== undefined
        ? clampBgmIntroSeconds(body.bgmIntroSeconds, existing.bgm_intro_seconds ?? 3)
        : clampBgmIntroSeconds(existing.bgm_intro_seconds ?? 3);

    db.prepare(
      `UPDATE chapters SET title = ?, position = ?, script_draft = ?, script_instruction = ?, script_source_text = ?, bgm_preset_id = ?, bgm_volume = ?, bgm_intro_seconds = ?, updated_at = ? WHERE id = ?`,
    ).run(
      title,
      position,
      scriptDraft,
      scriptInstruction,
      scriptSourceText,
      bgmPresetId,
      bgmVolume,
      bgmIntroSeconds,
      t,
      chapterId,
    );
    db.prepare(`UPDATE works SET updated_at = ? WHERE id = ?`).run(t, existing.work_id);
    const row = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as ChapterRow;
    return c.json(mapChapter(row));
  });

  app.delete("/api/chapters/:id", (c) => {
    const chapterId = c.req.param("id");
    deleteChapterAudio(db, paths.audioDir, chapterId);
    db.prepare(`DELETE FROM chapters WHERE id = ?`).run(chapterId);
    return c.json({ ok: true });
  });

  // --- Characters ---
  app.get("/api/works/:workId/characters", (c) => {
    const rows = db
      .prepare(`SELECT * FROM work_characters WHERE work_id = ? ORDER BY name ASC`)
      .all(c.req.param("workId")) as CharRow[];
    return c.json(rows.map(mapChar));
  });

  app.post("/api/works/:workId/characters", async (c) => {
    const workId = c.req.param("workId");
    const work = db.prepare(`SELECT * FROM works WHERE id = ?`).get(workId) as WorkRow | undefined;
    if (!work) return c.json({ error: "作品不存在" }, 404);
    const body = await c.req.json<{ name?: string; voiceId?: string | null }>();
    const name = body.name?.trim();
    if (!name) return c.json({ error: "角色名必填" }, 400);
    const workProvider: TtsProviderKind = work.provider === "mimo" ? "mimo" : "fish";
    if (body.voiceId) {
      const v = db
        .prepare(
          `SELECT pc.provider FROM voices v
           JOIN provider_connections pc ON pc.id = v.provider_connection_id WHERE v.id = ?`,
        )
        .get(body.voiceId) as { provider: string } | undefined;
      if (!v) return c.json({ error: "音色不存在" }, 400);
      if (v.provider !== workProvider) {
        return c.json({ error: `音色 Provider 必须与作品一致（${workProvider}）` }, 400);
      }
    }
    const charId = id();
    const t = nowIso();
    try {
      db.prepare(
        `INSERT INTO work_characters (id, work_id, name, is_narrator, voice_id, param_override_json, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, '{}', ?, ?)`,
      ).run(charId, workId, name, body.voiceId ?? null, t, t);
    } catch {
      return c.json({ error: "角色名已存在" }, 409);
    }
    const row = db.prepare(`SELECT * FROM work_characters WHERE id = ?`).get(charId) as CharRow;
    return c.json(mapChar(row), 201);
  });

  app.patch("/api/characters/:id", async (c) => {
    const charId = c.req.param("id");
    const existing = db.prepare(`SELECT * FROM work_characters WHERE id = ?`).get(charId) as
      | CharRow
      | undefined;
    if (!existing) return c.json({ error: "角色不存在" }, 404);
    const work = db.prepare(`SELECT * FROM works WHERE id = ?`).get(existing.work_id) as
      | WorkRow
      | undefined;
    if (!work) return c.json({ error: "作品不存在" }, 404);
    const workProvider: TtsProviderKind = work.provider === "mimo" ? "mimo" : "fish";
    const body = await c.req.json<{
      name?: string;
      voiceId?: string | null;
      paramOverride?: Record<string, unknown>;
    }>();
    const nextVoiceId = body.voiceId === undefined ? existing.voice_id : body.voiceId;
    if (nextVoiceId) {
      const v = db
        .prepare(
          `SELECT pc.provider FROM voices v
           JOIN provider_connections pc ON pc.id = v.provider_connection_id WHERE v.id = ?`,
        )
        .get(nextVoiceId) as { provider: string } | undefined;
      if (!v) return c.json({ error: "音色不存在" }, 400);
      if (v.provider !== workProvider) {
        return c.json({ error: `音色 Provider 必须与作品一致（${workProvider}）` }, 400);
      }
    }
    const t = nowIso();
    try {
      db.prepare(
        `UPDATE work_characters SET name = ?, voice_id = ?, param_override_json = ?, updated_at = ? WHERE id = ?`,
      ).run(
        body.name?.trim() || existing.name,
        nextVoiceId,
        JSON.stringify(body.paramOverride ?? parseJsonObject(existing.param_override_json)),
        t,
        charId,
      );
    } catch {
      return c.json({ error: "角色名已存在" }, 409);
    }
    const row = db.prepare(`SELECT * FROM work_characters WHERE id = ?`).get(charId) as CharRow;
    return c.json(mapChar(row));
  });

  app.delete("/api/characters/:id", (c) => {
    const charId = c.req.param("id");
    const existing = db.prepare(`SELECT * FROM work_characters WHERE id = ?`).get(charId) as
      | CharRow
      | undefined;
    if (!existing) return c.json({ error: "角色不存在" }, 404);
    const used = db
      .prepare(`SELECT COUNT(*) as n FROM lines WHERE work_character_id = ?`)
      .get(charId) as { n: number };
    if (used.n > 0) return c.json({ error: "仍有台词行引用该角色，无法删除" }, 409);
    db.prepare(`DELETE FROM work_characters WHERE id = ?`).run(charId);
    return c.json({ ok: true });
  });

  // --- Lines ---
  app.get("/api/chapters/:chapterId/lines", (c) => {
    return c.json(listChapterLines(db, c.req.param("chapterId")));
  });

  app.post("/api/chapters/:chapterId/lines", async (c) => {
    const chapterId = c.req.param("chapterId");
    const chapter = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
      | ChapterRow
      | undefined;
    if (!chapter) return c.json({ error: "章节不存在" }, 404);
    const body = await c.req.json<{
      text?: string;
      workCharacterId?: string;
      afterPosition?: number;
    }>();

    let characterId = body.workCharacterId;
    if (!characterId) {
      // Prefer last used character in this chapter; else first work character; else create 旁白.
      const lastLine = db
        .prepare(
          `SELECT work_character_id FROM lines WHERE chapter_id = ? ORDER BY position DESC LIMIT 1`,
        )
        .get(chapterId) as { work_character_id: string } | undefined;
      if (lastLine?.work_character_id) {
        characterId = lastLine.work_character_id;
      } else {
        const anyChar = db
          .prepare(
            `SELECT id FROM work_characters WHERE work_id = ? ORDER BY name ASC LIMIT 1`,
          )
          .get(chapter.work_id) as { id: string } | undefined;
        if (anyChar) {
          characterId = anyChar.id;
        } else {
          const t0 = nowIso();
          const charId = id();
          db.prepare(
            `INSERT INTO work_characters (id, work_id, name, is_narrator, voice_id, param_override_json, created_at, updated_at)
             VALUES (?, ?, '旁白', 0, NULL, '{}', ?, ?)`,
          ).run(charId, chapter.work_id, t0, t0);
          characterId = charId;
        }
      }
    }

    const max = db
      .prepare(`SELECT COALESCE(MAX(position), -1) as m FROM lines WHERE chapter_id = ?`)
      .get(chapterId) as { m: number };
    let position = max.m + 1;
    if (body.afterPosition != null) {
      position = body.afterPosition + 1;
      db.prepare(
        `UPDATE lines SET position = position + 1 WHERE chapter_id = ? AND position >= ?`,
      ).run(chapterId, position);
    }
    const lineId = id();
    const t = nowIso();
    db.prepare(
      `INSERT INTO lines (id, chapter_id, work_character_id, text, position, param_override_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
    ).run(lineId, chapterId, characterId, body.text ?? "", position, t, t);
    db.prepare(
      `UPDATE chapters SET production_started = 1, updated_at = ? WHERE id = ?`,
    ).run(t, chapterId);
    db.prepare(`UPDATE works SET updated_at = ? WHERE id = ?`).run(t, chapter.work_id);
    const lines = listChapterLines(db, chapterId);
    return c.json(lines.find((l) => l.id === lineId), 201);
  });

  app.patch("/api/lines/:id", async (c) => {
    const lineId = c.req.param("id");
    const existing = db.prepare(`SELECT * FROM lines WHERE id = ?`).get(lineId) as LineRow | undefined;
    if (!existing) return c.json({ error: "行不存在" }, 404);
    const body = await c.req.json<{
      text?: string;
      workCharacterId?: string;
      paramOverride?: Record<string, unknown>;
      position?: number;
    }>();
    const t = nowIso();
    db.prepare(
      `UPDATE lines SET text = ?, work_character_id = ?, param_override_json = ?, position = ?, updated_at = ? WHERE id = ?`,
    ).run(
      body.text ?? existing.text,
      body.workCharacterId ?? existing.work_character_id,
      JSON.stringify(body.paramOverride ?? parseJsonObject(existing.param_override_json)),
      body.position ?? existing.position,
      t,
      lineId,
    );
    const lines = listChapterLines(db, existing.chapter_id);
    return c.json(lines.find((l) => l.id === lineId));
  });

  app.put("/api/chapters/:chapterId/lines/reorder", async (c) => {
    const chapterId = c.req.param("chapterId");
    const body = await c.req.json<{ lineIds?: string[] }>();
    if (!body.lineIds?.length) return c.json({ error: "缺少 lineIds" }, 400);
    const t = nowIso();
    const tx = db.transaction(() => {
      body.lineIds!.forEach((lineId, index) => {
        db.prepare(
          `UPDATE lines SET position = ?, updated_at = ? WHERE id = ? AND chapter_id = ?`,
        ).run(index, t, lineId, chapterId);
      });
    });
    tx();
    return c.json(listChapterLines(db, chapterId));
  });

  app.post("/api/chapters/:chapterId/import", async (c) => {
    const chapterId = c.req.param("chapterId");
    const chapter = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
      | ChapterRow
      | undefined;
    if (!chapter) return c.json({ error: "章节不存在" }, 404);

    const body = await c.req.json<{ text?: string; mode?: "append" | "replace" }>();
    const source = body.text ?? "";
    const mode = body.mode === "replace" ? "replace" : "append";
    const imported = parseScriptImport(source);
    if (!imported.length) return c.json({ error: "没有可导入的台词行" }, 400);

    const t = nowIso();
    const createdCharacters: WorkCharacterDto[] = [];

    const resolveCharacterId = (name: string): string => {
      const existing = db
        .prepare(`SELECT id FROM work_characters WHERE work_id = ? AND name = ? LIMIT 1`)
        .get(chapter.work_id, name) as { id: string } | undefined;
      if (existing) return existing.id;

      const charId = id();
      db.prepare(
        `INSERT INTO work_characters (id, work_id, name, is_narrator, voice_id, param_override_json, created_at, updated_at)
         VALUES (?, ?, ?, 0, NULL, '{}', ?, ?)`,
      ).run(charId, chapter.work_id, name, t, t);
      const row = db.prepare(`SELECT * FROM work_characters WHERE id = ?`).get(charId) as CharRow;
      createdCharacters.push(mapChar(row));
      return charId;
    };

    const tx = db.transaction(() => {
      if (mode === "replace") {
        const oldLines = db
          .prepare(`SELECT id, audio_path FROM lines WHERE chapter_id = ?`)
          .all(chapterId) as { id: string; audio_path: string | null }[];
        for (const line of oldLines) {
          if (line.audio_path && fs.existsSync(line.audio_path)) {
            try {
              fs.unlinkSync(line.audio_path);
            } catch {
              /* ignore */
            }
          }
        }
        db.prepare(`DELETE FROM lines WHERE chapter_id = ?`).run(chapterId);
      }

      const max = db
        .prepare(`SELECT COALESCE(MAX(position), -1) as m FROM lines WHERE chapter_id = ?`)
        .get(chapterId) as { m: number };
      let position = max.m + 1;

      for (const item of imported) {
        const characterId = resolveCharacterId(item.characterName);
        const lineId = id();
        db.prepare(
          `INSERT INTO lines (id, chapter_id, work_character_id, text, position, param_override_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
        ).run(lineId, chapterId, characterId, item.text, position, t, t);
        position += 1;
      }
      db.prepare(
        `UPDATE chapters SET production_started = 1, script_draft = ?, updated_at = ? WHERE id = ?`,
      ).run(source, t, chapterId);
      db.prepare(`UPDATE works SET updated_at = ? WHERE id = ?`).run(t, chapter.work_id);
    });

    try {
      tx();
    } catch (err) {
      return c.json({ error: truncateError(err) }, 500);
    }

    return c.json({
      lines: listChapterLines(db, chapterId),
      createdCharacters,
      importedCount: imported.length,
      mode,
    });
  });

  app.post("/api/chapters/:chapterId/generate-script", async (c) => {
    const chapterId = c.req.param("chapterId");
    const chapter = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
      | ChapterRow
      | undefined;
    if (!chapter) return c.json({ error: "章节不存在" }, 404);
    if (chapter.production_started) {
      return c.json({ error: "本章已进入结构化生产，请先返回剧本生成并清空第二步数据" }, 409);
    }

    const body = await c.req.json<{ instruction?: string; sourceText?: string }>();
    const instruction = body.instruction?.trim() ?? "";
    const sourceText = body.sourceText?.trim() ?? "";
    if (!instruction && !sourceText) {
      return c.json({ error: "请填写创作指令或上传/粘贴参考文本" }, 400);
    }

    const llm = getScriptLlmSettings(db, paths.secretsPath);
    const apiKey = getScriptLlmApiKey(paths.secretsPath);
    if (!apiKey) return c.json({ error: "请先在设置中配置剧本 LLM API Key" }, 400);
    if (!llm.baseUrl) return c.json({ error: "请先在设置中配置剧本 LLM Base URL" }, 400);
    if (!llm.model) return c.json({ error: "请先在设置中配置剧本 LLM Model ID" }, 400);

    const signal = c.req.raw.signal;
    const work = db.prepare(`SELECT provider FROM works WHERE id = ?`).get(chapter.work_id) as
      | { provider?: string | null }
      | undefined;
    const scriptProvider = work?.provider === "mimo" ? "mimo" : "fish";

    return streamSSE(c, async (stream) => {
      try {
        const result = await streamScriptWithLlm(
          { baseUrl: llm.baseUrl, model: llm.model, apiKey },
          { instruction, sourceText, provider: scriptProvider },
          async (delta) => {
            await stream.writeSSE({ event: "delta", data: delta });
          },
          signal,
        );

        const t = nowIso();
        db.prepare(
          `UPDATE chapters SET script_draft = ?, script_instruction = ?, script_source_text = ?, updated_at = ? WHERE id = ?`,
        ).run(result.script, instruction, sourceText, t, chapterId);
        db.prepare(`UPDATE works SET updated_at = ? WHERE id = ?`).run(t, chapter.work_id);
        const row = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as ChapterRow;

        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({
            chapter: mapChapter(row),
            script: result.script,
            previewCount: parseScriptImport(result.script).length,
          }),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        await stream.writeSSE({
          event: "error",
          data: truncateError(err),
        });
      }
    });
  });

  app.post("/api/chapters/:chapterId/start-production", async (c) => {
    const chapterId = c.req.param("chapterId");
    const chapter = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
      | ChapterRow
      | undefined;
    if (!chapter) return c.json({ error: "章节不存在" }, 404);
    if (chapter.production_started) {
      return c.json({ error: "本章已进入结构化生产" }, 409);
    }

    const body = await c.req.json<{ text?: string }>().catch(() => ({} as { text?: string }));
    const source = (body.text ?? chapter.script_draft ?? "").trim();
    if (!source) return c.json({ error: "剧本草稿为空，请先生成或粘贴剧本" }, 400);

    const imported = parseScriptImport(source);
    if (!imported.length) return c.json({ error: "没有可导入的台词行" }, 400);

    const t = nowIso();
    const createdCharacters: WorkCharacterDto[] = [];

    const resolveCharacterId = (name: string): string => {
      const existing = db
        .prepare(`SELECT id FROM work_characters WHERE work_id = ? AND name = ? LIMIT 1`)
        .get(chapter.work_id, name) as { id: string } | undefined;
      if (existing) return existing.id;

      const charId = id();
      db.prepare(
        `INSERT INTO work_characters (id, work_id, name, is_narrator, voice_id, param_override_json, created_at, updated_at)
         VALUES (?, ?, ?, 0, NULL, '{}', ?, ?)`,
      ).run(charId, chapter.work_id, name, t, t);
      const row = db.prepare(`SELECT * FROM work_characters WHERE id = ?`).get(charId) as CharRow;
      createdCharacters.push(mapChar(row));
      return charId;
    };

    const tx = db.transaction(() => {
      const oldLines = db
        .prepare(`SELECT id, audio_path FROM lines WHERE chapter_id = ?`)
        .all(chapterId) as { id: string; audio_path: string | null }[];
      for (const line of oldLines) {
        if (line.audio_path && fs.existsSync(line.audio_path)) {
          try {
            fs.unlinkSync(line.audio_path);
          } catch {
            /* ignore */
          }
        }
      }
      db.prepare(`DELETE FROM lines WHERE chapter_id = ?`).run(chapterId);

      let position = 0;
      for (const item of imported) {
        const characterId = resolveCharacterId(item.characterName);
        const lineId = id();
        db.prepare(
          `INSERT INTO lines (id, chapter_id, work_character_id, text, position, param_override_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`,
        ).run(lineId, chapterId, characterId, item.text, position, t, t);
        position += 1;
      }

      db.prepare(
        `UPDATE chapters SET production_started = 1, script_draft = ?, updated_at = ? WHERE id = ?`,
      ).run(source, t, chapterId);
      db.prepare(`UPDATE works SET updated_at = ? WHERE id = ?`).run(t, chapter.work_id);
    });

    try {
      tx();
    } catch (err) {
      return c.json({ error: truncateError(err) }, 500);
    }

    const row = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as ChapterRow;
    return c.json({
      chapter: mapChapter(row),
      lines: listChapterLines(db, chapterId),
      createdCharacters,
      importedCount: imported.length,
    });
  });

  app.post("/api/chapters/:chapterId/reset-production", async (c) => {
    const chapterId = c.req.param("chapterId");
    const chapter = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
      | ChapterRow
      | undefined;
    if (!chapter) return c.json({ error: "章节不存在" }, 404);

    // Sync step-2 structured lines back into step-1 draft so the round-trip is
    // reversible (same dialect as batch import: 角色名：台词).
    const structured = listChapterLines(db, chapterId);
    const nameById = new Map<string, string>();
    const charRows = db
      .prepare(`SELECT id, name FROM work_characters WHERE work_id = ?`)
      .all(chapter.work_id) as { id: string; name: string }[];
    for (const row of charRows) nameById.set(row.id, row.name);
    const draftFromLines = formatScriptDraft(
      structured.map((line) => ({
        characterName: nameById.get(line.workCharacterId) ?? "旁白",
        text: line.text,
      })),
    );
    // Prefer live lines when present; fall back to existing draft if step 2 is empty.
    const nextDraft = structured.length > 0 ? draftFromLines : (chapter.script_draft ?? "");

    const t = nowIso();
    const tx = db.transaction(() => {
      // Cancel active jobs for this chapter
      db.prepare(
        `UPDATE jobs SET status = 'cancelled', updated_at = ?, finished_at = ?
         WHERE chapter_id = ? AND status IN ('queued', 'running')`,
      ).run(t, t, chapterId);

      const oldLines = db
        .prepare(`SELECT id, audio_path FROM lines WHERE chapter_id = ?`)
        .all(chapterId) as { id: string; audio_path: string | null }[];
      for (const line of oldLines) {
        if (line.audio_path && fs.existsSync(line.audio_path)) {
          try {
            fs.unlinkSync(line.audio_path);
          } catch {
            /* ignore */
          }
        }
      }
      db.prepare(`DELETE FROM lines WHERE chapter_id = ?`).run(chapterId);

      // Drop chapter export audio files under audio/export dirs
      deleteChapterAudio(db, paths.audioDir, chapterId);

      // Write synced draft + clear production flag so step 1 can resume.
      db.prepare(
        `UPDATE chapters SET production_started = 0, script_draft = ?, updated_at = ? WHERE id = ?`,
      ).run(nextDraft, t, chapterId);
      db.prepare(`UPDATE works SET updated_at = ? WHERE id = ?`).run(t, chapter.work_id);
    });

    try {
      tx();
    } catch (err) {
      return c.json({ error: truncateError(err) }, 500);
    }

    const row = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as ChapterRow;
    return c.json({
      chapter: mapChapter(row),
      lines: listChapterLines(db, chapterId),
    });
  });

  app.delete("/api/lines/:id", (c) => {
    const lineId = c.req.param("id");
    const existing = db.prepare(`SELECT * FROM lines WHERE id = ?`).get(lineId) as LineRow | undefined;
    if (!existing) return c.json({ error: "行不存在" }, 404);
    if (existing.audio_path && fs.existsSync(existing.audio_path)) {
      try {
        fs.unlinkSync(existing.audio_path);
      } catch {
        /* ignore */
      }
    }
    db.prepare(`DELETE FROM lines WHERE id = ?`).run(lineId);
    return c.json({ ok: true });
  });

  // --- Synthesis / jobs ---
  app.post("/api/synthesize", async (c) => {
    const body = await c.req.json<{ lineIds?: string[] }>();
    const lineIds = body.lineIds ?? [];
    if (!lineIds.length) return c.json({ error: "缺少 lineIds" }, 400);

    const created: JobDto[] = [];
    const skipped: { lineId: string; reason: string }[] = [];

    for (const lineId of lineIds) {
      const line = db.prepare(`SELECT * FROM lines WHERE id = ?`).get(lineId) as LineRow | undefined;
      if (!line) {
        skipped.push({ lineId, reason: "行不存在" });
        continue;
      }
      if (!line.text.trim()) {
        skipped.push({ lineId, reason: "空文本" });
        continue;
      }
      const active = db
        .prepare(
          `SELECT id FROM jobs WHERE line_id = ? AND status IN ('queued', 'running') AND kind = 'line_synthesis' LIMIT 1`,
        )
        .get(lineId) as { id: string } | undefined;
      if (active) {
        skipped.push({ lineId, reason: "已在队列中" });
        continue;
      }
      try {
        const snapshot = buildLineSnapshot(db, lineId);
        const jobId = id();
        const t = nowIso();
        const chapter = db.prepare(`SELECT work_id FROM chapters WHERE id = ?`).get(line.chapter_id) as {
          work_id: string;
        };
        db.prepare(
          `INSERT INTO jobs (id, kind, status, work_id, chapter_id, line_id, snapshot_json, error, created_at, updated_at)
           VALUES (?, 'line_synthesis', 'queued', ?, ?, ?, ?, NULL, ?, ?)`,
        ).run(
          jobId,
          chapter.work_id,
          line.chapter_id,
          lineId,
          JSON.stringify(snapshot),
          t,
          t,
        );
        created.push(mapJob(db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as JobRow));
      } catch (err) {
        skipped.push({ lineId, reason: truncateError(err) });
      }
    }

    return c.json({ jobs: created, skipped });
  });

  app.get("/api/jobs", (c) => {
    const chapterId = c.req.query("chapterId");
    const rows = chapterId
      ? (db
          .prepare(
            `SELECT * FROM jobs WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 100`,
          )
          .all(chapterId) as JobRow[])
      : (db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100`).all() as JobRow[]);
    return c.json(rows.map(mapJob));
  });

  app.get("/api/jobs/:id", (c) => {
    const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(c.req.param("id")) as
      | JobRow
      | undefined;
    if (!row) return c.json({ error: "任务不存在" }, 404);
    return c.json(mapJob(row));
  });

  app.post("/api/jobs/:id/cancel", (c) => {
    const ok = worker.cancelJob(c.req.param("id"));
    if (!ok) return c.json({ error: "无法取消" }, 400);
    const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(c.req.param("id")) as JobRow;
    return c.json(mapJob(row));
  });

  app.post("/api/chapters/:chapterId/export", async (c) => {
    const chapterId = c.req.param("chapterId");
    const chapter = db.prepare(`SELECT * FROM chapters WHERE id = ?`).get(chapterId) as
      | ChapterRow
      | undefined;
    if (!chapter) return c.json({ error: "章节不存在" }, 404);
    const body = await c.req.json<{ confirmStale?: boolean; lineIds?: string[] }>().catch(
      () => ({} as { confirmStale?: boolean; lineIds?: string[] }),
    );
    const allLines = listChapterLines(db, chapterId);
    const requestedSet =
      Array.isArray(body.lineIds) && body.lineIds.length > 0 ? new Set(body.lineIds) : null;
    const lines = requestedSet ? allLines.filter((l) => requestedSet.has(l.id)) : allLines;
    if (lines.length === 0) {
      return c.json({ error: "没有可合成的行" }, 400);
    }
    const withAudio = lines.filter((l) => l.audioState !== "none");
    const missing = lines.filter((l) => l.audioState === "none");
    const stale = lines.filter((l) => l.audioState === "stale");
    if (withAudio.length === 0) {
      return c.json(
        {
          error: requestedSet
            ? "选中行没有可合成的音频，请先生成"
            : "没有可合成的行音频，请先生成至少一行",
          missingLineIds: missing.map((l) => l.id),
          staleLineIds: stale.map((l) => l.id),
        },
        409,
      );
    }
    // Missing lines are skipped during assembly; only zero-audio is a hard block.
    if (stale.length > 0 && !body.confirmStale) {
      return c.json(
        {
          error:
            missing.length > 0
              ? `存在过期行音频，且将跳过 ${missing.length} 行无音频`
              : "存在过期行音频，确认后可继续合成",
          missingLineIds: missing.map((l) => l.id),
          staleLineIds: stale.map((l) => l.id),
        },
        409,
      );
    }

    const bgmPresetId =
      chapter.bgm_preset_id === undefined || chapter.bgm_preset_id === ""
        ? null
        : chapter.bgm_preset_id;
    const bgmVolume = clampBgmVolume(chapter.bgm_volume ?? 45);
    const bgmIntroSeconds = clampBgmIntroSeconds(chapter.bgm_intro_seconds ?? 3);
    if (bgmPresetId) {
      const avail = assertPresetAvailable(bgmPresetId);
      if (!avail.ok) {
        return c.json({ error: avail.error, bgmUnavailable: true }, 409);
      }
    }

    const jobId = id();
    const t = nowIso();
    const snapshot = JSON.stringify({
      ...(requestedSet != null ? { lineIds: lines.map((l) => l.id) } : {}),
      bgm: { presetId: bgmPresetId, volume: bgmVolume, introSeconds: bgmIntroSeconds },
    });
    db.prepare(
      `INSERT INTO jobs (id, kind, status, work_id, chapter_id, line_id, snapshot_json, error, created_at, updated_at)
       VALUES (?, 'chapter_export', 'queued', ?, ?, NULL, ?, NULL, ?, ?)`,
    ).run(jobId, chapter.work_id, chapterId, snapshot, t, t);
    return c.json(
      {
        ...mapJob(db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as JobRow),
        includedCount: withAudio.length,
        skippedMissingCount: missing.length,
      },
      201,
    );
  });

  app.get("/api/files", (c) => {
    const p = c.req.query("path");
    if (!p) return c.json({ error: "缺少 path" }, 400);
    const resolved = path.resolve(p);
    const allowed =
      resolved.startsWith(path.resolve(paths.audioDir)) ||
      resolved.startsWith(path.resolve(paths.exportDir)) ||
      resolved.startsWith(path.resolve(paths.tmpDir));
    if (!allowed || !fs.existsSync(resolved)) return c.json({ error: "文件不可用" }, 404);
    const buf = fs.readFileSync(resolved);
    const contentType = contentTypeForStudioFile(resolved);
    const filename = path.basename(resolved);
    return new Response(buf, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  });

  app.get("/api/lines/:id/audio", (c) => {
    const line = db.prepare(`SELECT audio_path FROM lines WHERE id = ?`).get(c.req.param("id")) as
      | { audio_path: string | null }
      | undefined;
    if (!line?.audio_path || !fs.existsSync(line.audio_path)) {
      return c.json({ error: "无音频" }, 404);
    }
    const buf = fs.readFileSync(line.audio_path);
    return new Response(buf, {
      headers: { "Content-Type": "audio/wav", "Content-Length": String(buf.length) },
    });
  });

  return app;
}

type WorkRow = {
  id: string;
  title: string;
  provider?: string | null;
  created_at: string;
  updated_at: string;
};

type ChapterRow = {
  id: string;
  work_id: string;
  title: string;
  position: number;
  script_draft: string;
  script_instruction: string;
  script_source_text: string;
  production_started: number;
  bgm_preset_id: string | null;
  bgm_volume: number;
  bgm_intro_seconds: number;
  created_at: string;
  updated_at: string;
};

type CharRow = {
  id: string;
  work_id: string;
  name: string;
  is_narrator: number;
  voice_id: string | null;
  param_override_json: string;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  chapter_id: string;
  work_character_id: string;
  text: string;
  position: number;
  param_override_json: string;
  audio_path: string | null;
  audio_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

type JobRow = {
  id: string;
  kind: "line_synthesis" | "chapter_export";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  work_id: string | null;
  chapter_id: string | null;
  line_id: string | null;
  snapshot_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type VoiceRow = {
  id: string;
  provider_connection_id: string;
  provider: "fish" | "mimo";
  name: string;
  config_json: string;
  created_at: string;
  updated_at: string;
};

function mapVoice(row: VoiceRow): VoiceDto {
  return {
    id: row.id,
    providerConnectionId: row.provider_connection_id,
    provider: row.provider,
    name: row.name,
    config: parseJsonObject(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWork(row: WorkRow): WorkDto {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider === "mimo" ? "mimo" : "fish",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChapter(row: ChapterRow): ChapterDto {
  return {
    id: row.id,
    workId: row.work_id,
    title: row.title,
    position: row.position,
    scriptDraft: row.script_draft ?? "",
    scriptInstruction: row.script_instruction ?? "",
    scriptSourceText: row.script_source_text ?? "",
    productionStarted: Boolean(row.production_started),
    bgmPresetId: row.bgm_preset_id ?? null,
    bgmVolume: clampBgmVolume(row.bgm_volume ?? 45),
    bgmIntroSeconds: clampBgmIntroSeconds(row.bgm_intro_seconds ?? 3),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChar(row: CharRow): WorkCharacterDto {
  return {
    id: row.id,
    workId: row.work_id,
    name: row.name,
    // Legacy column retained; no longer special-cased in product rules.
    isNarrator: false,
    voiceId: row.voice_id,
    paramOverride: parseJsonObject(row.param_override_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapJob(row: JobRow): JobDto {
  let exportPath: string | null = null;
  let exportSrtPath: string | null = null;
  let compositionBgm: JobDto["compositionBgm"] = null;
  if (row.kind === "chapter_export" && row.snapshot_json) {
    try {
      const snap = JSON.parse(row.snapshot_json) as {
        exportPath?: unknown;
        exportSrtPath?: unknown;
        bgm?: { presetId?: unknown; volume?: unknown; introSeconds?: unknown };
      };
      if (typeof snap.exportPath === "string" && snap.exportPath) {
        exportPath = snap.exportPath;
      }
      if (typeof snap.exportSrtPath === "string" && snap.exportSrtPath) {
        exportSrtPath = snap.exportSrtPath;
      } else if (exportPath) {
        // Legacy: SRT sibling may exist after re-compose on a newer build, or
        // derive path for clients that only know the WAV path.
        const sibling = exportPath.replace(/\.wav$/i, ".srt");
        if (fs.existsSync(sibling)) exportSrtPath = sibling;
      }
      if (snap.bgm && typeof snap.bgm === "object") {
        const presetId =
          snap.bgm.presetId === null ||
          snap.bgm.presetId === undefined ||
          snap.bgm.presetId === ""
            ? null
            : typeof snap.bgm.presetId === "string"
              ? snap.bgm.presetId
              : null;
        compositionBgm = {
          presetId,
          volume: clampBgmVolume(snap.bgm.volume ?? 45),
          introSeconds: clampBgmIntroSeconds(snap.bgm.introSeconds ?? 3),
        };
      }
    } catch {
      /* ignore malformed snapshot */
    }
  }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    workId: row.work_id,
    chapterId: row.chapter_id,
    lineId: row.line_id,
    error: row.error,
    exportPath,
    exportSrtPath,
    compositionBgm,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function contentTypeForStudioFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".srt") return "application/x-subrip; charset=utf-8";
  if (ext === ".vtt") return "text/vtt; charset=utf-8";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".txt" || ext === ".md") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function deleteChapterAudio(db: Db, audioDir: string, chapterId: string): void {
  const lines = db
    .prepare(`SELECT audio_path FROM lines WHERE chapter_id = ?`)
    .all(chapterId) as { audio_path: string | null }[];
  for (const l of lines) {
    if (l.audio_path && fs.existsSync(l.audio_path)) {
      try {
        fs.unlinkSync(l.audio_path);
      } catch {
        /* ignore */
      }
    }
  }
  void audioDir;
}

function settingValue(db: Db, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function getScriptLlmSettings(db: Db, secretsPath: string) {
  return {
    baseUrl: (settingValue(db, "script_llm_base_url") ?? "").replace(/\/$/, ""),
    model: settingValue(db, "script_llm_model") ?? "",
    hasApiKey: Boolean(getScriptLlmApiKey(secretsPath)),
  };
}

function fishStatus(
  db: Db,
  secretsPath: string,
  conn: { name: string; base_url: string },
) {
  const defaultBaseUrl = defaultBaseUrlFor("fish");
  return {
    provider: "fish" as const,
    name: conn.name,
    baseUrl: conn.base_url,
    defaultBaseUrl,
    isCustomBaseUrl: conn.base_url !== defaultBaseUrl,
    hasApiKey: Boolean(getFishApiKey(db, secretsPath)),
  };
}

function mimoStatus(
  db: Db,
  secretsPath: string,
  conn: { name: string; base_url: string },
) {
  const defaultBaseUrl = defaultBaseUrlFor("mimo");
  return {
    provider: "mimo" as const,
    name: conn.name,
    baseUrl: conn.base_url,
    defaultBaseUrl,
    isCustomBaseUrl: conn.base_url !== defaultBaseUrl,
    hasApiKey: Boolean(getMimoApiKey(db, secretsPath)),
  };
}
