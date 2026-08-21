import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { DEFAULTS } from "@open-pod/convert-core";
import { createApp } from "./app.js";
import { getSetting, openDb } from "./db.js";
import { ensureDataLayout, resolveDataDir } from "./paths.js";
import { ConvertWorker } from "./worker.js";

const dataDir = resolveDataDir();
const layout = ensureDataLayout(dataDir);
const db = openDb(layout.dbPath);

const worker = new ConvertWorker(db, {
  secretsPath: layout.secretsPath,
  jobsDir: layout.jobsDir,
});
worker.start();

// periodic purge
const retention = Number(getSetting(db, "retention_days", String(DEFAULTS.retentionDays)));
worker.purgeExpired(retention);
setInterval(
  () => {
    const days = Number(getSetting(db, "retention_days", String(DEFAULTS.retentionDays)));
    worker.purgeExpired(days);
  },
  60 * 60 * 1000,
);

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../web-dist");

const app = createApp({
  db,
  paths: {
    dataDir: layout.dataDir,
    secretsPath: layout.secretsPath,
    jobsDir: layout.jobsDir,
    tmpDir: layout.tmpDir,
    webDist,
  },
  worker,
});

const port = Number(process.env.OPEN_POD_CONVERT_PORT ?? DEFAULTS.port);
const hostname = process.env.OPEN_POD_CONVERT_HOST ?? DEFAULTS.host;

console.log(`文档转 Markdown  http://${hostname}:${port}`);
console.log(`Data dir: ${dataDir}`);

serve({ fetch: app.fetch, port, hostname });
