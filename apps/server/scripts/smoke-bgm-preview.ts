import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { ensureDataLayout } from "../src/paths.js";
import { JobWorker } from "../src/worker.js";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-pod-bgm-preview-"));
const layout = ensureDataLayout(dataDir);
const db = openDb(layout.dbPath);
const worker = new JobWorker(db, {
  secretsPath: layout.secretsPath,
  audioDir: layout.audioDir,
  exportDir: layout.exportDir,
});
const app = createApp({
  db,
  paths: { ...layout, dataDir: layout.dataDir, tmpDir: layout.tmpDir },
  worker,
});

const ok = await app.request("/api/bgm-presets/canon-piano/audio");
const bad = await app.request("/api/bgm-presets/nope/audio");
const buf = Buffer.from(await ok.arrayBuffer());
const result = {
  okStatus: ok.status,
  okType: ok.headers.get("content-type"),
  okBytes: buf.length,
  wav: buf.subarray(0, 4).toString("ascii"),
  badStatus: bad.status,
};
console.log(result);
if (ok.status !== 200 || bad.status !== 404 || result.wav !== "RIFF") {
  worker.stop();
  db.close();
  process.exit(1);
}
console.log("ok");
worker.stop();
db.close();
