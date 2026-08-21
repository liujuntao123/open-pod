import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  DEFAULTS,
  detectSourceType,
  type CreateJobOptions,
  type EpubOutputMode,
  type MineruModelVersion,
} from "@open-pod/convert-core";
import type { Db } from "./db.js";
import { getSetting, setSetting } from "./db.js";
import { jobDir } from "./paths.js";
import { resolveMineruToken, setMineruToken } from "./secrets.js";
import { id, nowIso } from "./util.js";
import type { ConvertWorker } from "./worker.js";

export type AppPaths = {
  dataDir: string;
  secretsPath: string;
  jobsDir: string;
  tmpDir: string;
  webDist?: string;
};

function parseBool(v: string | undefined, d = false): boolean {
  if (v == null || v === "") return d;
  return v === "1" || v.toLowerCase() === "true" || v === "yes";
}

export function createApp(opts: {
  db: Db;
  paths: AppPaths;
  worker: ConvertWorker;
}) {
  const { db, paths, worker } = opts;
  const app = new Hono();
  app.use("/api/*", cors({ origin: "*" }));

  app.get("/api/health", (c) => c.json({ ok: true, service: "convert" }));

  app.get("/api/settings", (c) => {
    const token = resolveMineruToken(paths.secretsPath);
    return c.json({
      mineruTokenConfigured: Boolean(token),
      mineruTokenHint: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : null,
      retentionDays: Number(getSetting(db, "retention_days", String(DEFAULTS.retentionDays))),
      proxyEnabled: getSetting(db, "proxy_enabled", "0") === "1",
      proxyUrl: getSetting(db, "proxy_url", ""),
      assetBudgetBytes: Number(
        getSetting(db, "asset_budget_bytes", String(DEFAULTS.assetBudgetBytes)),
      ),
    });
  });

  app.put("/api/settings", async (c) => {
    const body = await c.req.json<{
      mineruToken?: string | null;
      retentionDays?: number;
      proxyEnabled?: boolean;
      proxyUrl?: string;
      assetBudgetBytes?: number;
    }>();
    if (body.mineruToken !== undefined) {
      setMineruToken(paths.secretsPath, body.mineruToken ?? undefined);
    }
    if (body.retentionDays != null && Number.isFinite(body.retentionDays)) {
      setSetting(db, "retention_days", String(Math.max(0, Math.floor(body.retentionDays))));
    }
    if (body.proxyEnabled != null) {
      setSetting(db, "proxy_enabled", body.proxyEnabled ? "1" : "0");
    }
    if (body.proxyUrl !== undefined) {
      setSetting(db, "proxy_url", body.proxyUrl.trim());
    }
    if (body.assetBudgetBytes != null && Number.isFinite(body.assetBudgetBytes)) {
      setSetting(db, "asset_budget_bytes", String(Math.max(0, Math.floor(body.assetBudgetBytes))));
    }
    const token = resolveMineruToken(paths.secretsPath);
    return c.json({
      mineruTokenConfigured: Boolean(token),
      mineruTokenHint: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : null,
      retentionDays: Number(getSetting(db, "retention_days", String(DEFAULTS.retentionDays))),
      proxyEnabled: getSetting(db, "proxy_enabled", "0") === "1",
      proxyUrl: getSetting(db, "proxy_url", ""),
      assetBudgetBytes: Number(
        getSetting(db, "asset_budget_bytes", String(DEFAULTS.assetBudgetBytes)),
      ),
    });
  });

  app.get("/api/jobs", (c) => {
    const rows = db
      .prepare(
        `SELECT id, source_type, source_name, status, phase, progress_message, error, created_at, updated_at, finished_at, zip_path
         FROM jobs ORDER BY created_at DESC LIMIT 200`,
      )
      .all();
    return c.json({ jobs: rows });
  });

  app.get("/api/jobs/:id", (c) => {
    const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(c.req.param("id"));
    if (!row) return c.json({ code: "not_found", message: "任务不存在" }, 404);
    const r = row as Record<string, unknown>;
    return c.json({
      ...r,
      options: JSON.parse(String(r.options_json || "{}")),
      segments: JSON.parse(String(r.segments_json || "[]")),
      warnings: JSON.parse(String(r.warnings_json || "[]")),
      manifest: r.manifest_json ? JSON.parse(String(r.manifest_json)) : null,
    });
  });

  app.post("/api/jobs", async (c) => {
    const body = await c.req.parseBody({ all: true });
    const file = body["file"];
    if (!file || typeof file === "string") {
      return c.json({ code: "bad_request", message: "请上传 file 字段" }, 400);
    }
    const f = file as File;
    const sourceName = f.name || "upload";
    const sourceType = detectSourceType(sourceName);
    if (!sourceType) {
      return c.json(
        { code: "unsupported", message: "仅支持 PDF 与 EPUB" },
        400,
      );
    }

    if (sourceType === "pdf" && !resolveMineruToken(paths.secretsPath)) {
      return c.json(
        { code: "mineru_token_required", message: "请先在设置中配置 MinerU Token" },
        400,
      );
    }

    const outputMode = String(body["outputMode"] || "split") as EpubOutputMode;
    const isOcr = parseBool(String(body["isOcr"] ?? ""));
    const modelVersion = String(body["modelVersion"] || "pipeline") as MineruModelVersion;
    const language = String(body["language"] || "ch");
    const assets = String(body["assets"] || "localize") === "none" ? "none" : "localize";

    const jobId = id();
    const work = jobDir(paths.jobsDir, jobId);
    fs.mkdirSync(work, { recursive: true });
    const ext = sourceType === "pdf" ? ".pdf" : ".epub";
    const sourcePath = path.join(work, `source${ext}`);
    const ab = await f.arrayBuffer();
    fs.writeFileSync(sourcePath, Buffer.from(ab));

    const options: CreateJobOptions = {
      sourceType,
      sourceName,
      outputMode: sourceType === "epub" ? outputMode : "split",
      isOcr,
      modelVersion,
      language,
      assets,
      assetBudgetBytes: Number(
        getSetting(db, "asset_budget_bytes", String(DEFAULTS.assetBudgetBytes)),
      ),
    };

    const t = nowIso();
    db.prepare(
      `INSERT INTO jobs (
        id, source_type, source_name, status, phase, progress_message,
        options_json, segments_json, warnings_json, source_path, work_dir,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'queued', 'accepted', '排队中', ?, '[]', '[]', ?, ?, ?, ?)`,
    ).run(
      jobId,
      sourceType,
      sourceName,
      JSON.stringify(options),
      sourcePath,
      work,
      t,
      t,
    );

    return c.json({ id: jobId }, 201);
  });

  app.post("/api/jobs/:id/cancel", (c) => {
    const jobId = c.req.param("id");
    const row = db.prepare(`SELECT id FROM jobs WHERE id = ?`).get(jobId);
    if (!row) return c.json({ code: "not_found", message: "任务不存在" }, 404);
    worker.requestCancel(jobId);
    return c.json({ ok: true });
  });

  app.post("/api/jobs/:id/retry-failed-segments", async (c) => {
    const jobId = c.req.param("id");
    try {
      await worker.retryFailed(jobId);
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ code: "retry_failed", message: msg }, 400);
    }
  });

  app.get("/api/jobs/:id/download", (c) => {
    const jobId = c.req.param("id");
    const del = c.req.query("delete") === "1";
    const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as
      | {
          zip_path: string | null;
          status: string;
          source_name: string;
          work_dir: string;
        }
      | undefined;
    if (!row) return c.json({ code: "not_found", message: "任务不存在" }, 404);
    if (!row.zip_path || !fs.existsSync(row.zip_path)) {
      return c.json({ code: "not_ready", message: "产物包尚未就绪" }, 404);
    }
    if (row.status !== "succeeded" && row.status !== "partial") {
      return c.json({ code: "not_ready", message: "任务未成功，无法下载" }, 400);
    }
    const buf = fs.readFileSync(row.zip_path);
    const safe = row.source_name.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 60);
    if (del) {
      try {
        fs.rmSync(row.work_dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      db.prepare(`DELETE FROM jobs WHERE id = ?`).run(jobId);
    }
    return new Response(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safe || "convert"}-${jobId.slice(0, 8)}.zip"`,
      },
    });
  });

  app.delete("/api/jobs/:id", (c) => {
    const jobId = c.req.param("id");
    const row = db.prepare(`SELECT work_dir, status FROM jobs WHERE id = ?`).get(jobId) as
      | { work_dir: string; status: string }
      | undefined;
    if (!row) return c.json({ code: "not_found", message: "任务不存在" }, 404);
    if (row.status === "running" || row.status === "queued") {
      worker.requestCancel(jobId);
    }
    try {
      fs.rmSync(row.work_dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    db.prepare(`DELETE FROM jobs WHERE id = ?`).run(jobId);
    return c.json({ ok: true });
  });

  // static UI if built
  if (paths.webDist && fs.existsSync(paths.webDist)) {
    app.use("/*", serveStatic({ root: paths.webDist }));
    app.get("*", async (c) => {
      const index = path.join(paths.webDist!, "index.html");
      if (fs.existsSync(index)) {
        return c.html(fs.readFileSync(index, "utf8"));
      }
      return c.text("UI not built", 404);
    });
  } else {
    app.get("/", (c) =>
      c.html(
        `<!doctype html><meta charset="utf-8"/><title>文档转 Markdown</title>
        <body style="font-family:sans-serif;padding:2rem">
        <h1>文档转 Markdown</h1>
        <p>API 已启动。开发 UI：在 <code>apps/convert</code> 运行 <code>pnpm dev:web</code>（端口 5174）。</p>
        <p><a href="/api/health">/api/health</a></p>
        </body>`,
      ),
    );
  }

  return app;
}
