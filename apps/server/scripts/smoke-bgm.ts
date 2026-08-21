import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import wavefile from "wavefile";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { ensureDataLayout } from "../src/paths.js";
import { JobWorker } from "../src/worker.js";

const WaveFile = (wavefile as { WaveFile: new () => {
  fromScratch: (ch: number, sr: number, bit: string, samples: Int16Array) => void;
  toBuffer: () => Uint8Array;
} }).WaveFile;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-pod-api-bgm-"));
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

function tone(file: string, seconds = 0.3, freq = 500, sr = 44100) {
  const n = Math.floor(sr * seconds);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 9000);
  }
  const w = new WaveFile();
  w.fromScratch(1, sr, "16", samples);
  fs.writeFileSync(file, w.toBuffer());
}

async function req(method: string, url: string, body?: unknown) {
  const res = await app.request(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text };
}

const presets = await req("GET", "/api/bgm-presets");
if (presets.status !== 200 || !Array.isArray(presets.json) || presets.json.length < 1) {
  throw new Error(`presets failed: ${presets.status} ${presets.text}`);
}
console.log(
  "presets",
  presets.json.map((p: { id: string }) => p.id),
);

const work = await req("POST", "/api/works", { title: "BGM测试" });
const workId = work.json.id as string;
const chapters = await req("GET", `/api/works/${workId}/chapters`);
const chapter = chapters.json[0] as {
  id: string;
  bgmPresetId: string | null;
  bgmVolume: number;
  bgmIntroSeconds: number;
};
console.log(
  "chapter bgm defaults",
  chapter.bgmPresetId,
  chapter.bgmVolume,
  chapter.bgmIntroSeconds,
);
if (chapter.bgmPresetId !== null) throw new Error("expected default no BGM");
if (chapter.bgmIntroSeconds !== 3) throw new Error("expected default intro 3s");

const patched = await req("PATCH", `/api/chapters/${chapter.id}`, {
  bgmPresetId: "canon-piano",
  bgmVolume: 50,
  bgmIntroSeconds: 5,
});
if (patched.status !== 200) throw new Error(`patch failed ${patched.text}`);
console.log(
  "patched",
  patched.json.bgmPresetId,
  patched.json.bgmVolume,
  patched.json.bgmIntroSeconds,
);

const chars = await req("GET", `/api/works/${workId}/characters`);
const charId = chars.json[0].id as string;
const lineId = crypto.randomUUID();
const audioPath = path.join(layout.audioDir, "lines", `${lineId}.wav`);
fs.mkdirSync(path.dirname(audioPath), { recursive: true });
tone(audioPath);
const t = new Date().toISOString();
db.prepare(`UPDATE chapters SET production_started = 1, updated_at = ? WHERE id = ?`).run(
  t,
  chapter.id,
);
db.prepare(
  `INSERT INTO lines (id, chapter_id, work_character_id, text, position, param_override_json, audio_path, audio_fingerprint, created_at, updated_at)
   VALUES (?, ?, ?, ?, 0, '{}', ?, 'fp', ?, ?)`,
).run(lineId, chapter.id, charId, "你好", audioPath, t, t);

const exportRes = await req("POST", `/api/chapters/${chapter.id}/export`, {
  confirmStale: true,
});
console.log(
  "export enqueue",
  exportRes.status,
  exportRes.json?.id,
  exportRes.json?.compositionBgm,
  exportRes.json?.error,
);
if (exportRes.status !== 201) throw new Error(`export enqueue failed ${exportRes.text}`);

worker.start();
for (let i = 0; i < 40; i++) {
  const row = db
    .prepare(`SELECT status, error FROM jobs WHERE id = ?`)
    .get(exportRes.json.id) as { status: string; error: string | null };
  if (row.status === "succeeded" || row.status === "failed") break;
  await new Promise((r) => setTimeout(r, 100));
}
const jobs = await req("GET", `/api/jobs?chapterId=${chapter.id}`);
const jobList = Array.isArray(jobs.json) ? jobs.json : [];
const job = jobList.find((j: { kind?: string }) => j.kind === "chapter_export") as
  | {
      status: string;
      exportPath: string | null;
      compositionBgm: {
        presetId: string | null;
        volume: number;
        introSeconds: number;
      } | null;
      error: string | null;
    }
  | undefined;
console.log("job", job?.status, job?.exportPath, job?.compositionBgm, job?.error);
if (job?.status !== "succeeded" || !job.exportPath || !fs.existsSync(job.exportPath)) {
  throw new Error("export job did not succeed");
}
console.log("export size", fs.statSync(job.exportPath).size);

const patched2 = await req("PATCH", `/api/chapters/${chapter.id}`, { bgmVolume: 20 });
console.log("volume now", patched2.json.bgmVolume, "snap", job.compositionBgm);
if (patched2.json.bgmVolume === job.compositionBgm.volume) {
  throw new Error("expected volume change vs snapshot");
}

const bad = await req("PATCH", `/api/chapters/${chapter.id}`, { bgmPresetId: "nope" });
console.log("bad preset", bad.status, bad.json?.error);
if (bad.status !== 400) throw new Error("expected bad preset 400");
console.log("ok");
worker.stop();
db.close();
