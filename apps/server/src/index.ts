import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { ensureBuiltinProviderConnections } from "./provider-settings.js";
import { ensureDataLayout, resolveDataDir } from "./paths.js";
import { JobWorker } from "./worker.js";

const dataDir = resolveDataDir();
const layout = ensureDataLayout(dataDir);
const db = openDb(layout.dbPath);
ensureBuiltinProviderConnections(db);

const worker = new JobWorker(db, {
  secretsPath: layout.secretsPath,
  audioDir: layout.audioDir,
  exportDir: layout.exportDir,
});
worker.start();

const app = createApp({
  db,
  paths: {
    ...layout,
    secretsPath: layout.secretsPath,
    audioDir: layout.audioDir,
    exportDir: layout.exportDir,
  },
  worker,
});

const port = Number(process.env.OPEN_POD_PORT ?? 8787);
const hostname = process.env.OPEN_POD_HOST ?? "127.0.0.1";

console.log(`Open Pod server http://${hostname}:${port}`);
console.log(`Data dir: ${dataDir}`);

serve({ fetch: app.fetch, port, hostname });
