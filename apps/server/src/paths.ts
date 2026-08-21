import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveDataDir(): string {
  const fromEnv = process.env.OPEN_POD_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), ".open-pod");
}

export function ensureDataLayout(dataDir: string): {
  dataDir: string;
  dbPath: string;
  secretsPath: string;
  audioDir: string;
  exportDir: string;
  tmpDir: string;
} {
  const dbPath = path.join(dataDir, "studio.sqlite");
  const secretsPath = path.join(dataDir, "secrets.json");
  const audioDir = path.join(dataDir, "audio");
  const exportDir = path.join(dataDir, "exports");
  const tmpDir = path.join(dataDir, "tmp");
  for (const p of [dataDir, audioDir, exportDir, tmpDir]) {
    fs.mkdirSync(p, { recursive: true });
  }
  return { dataDir, dbPath, secretsPath, audioDir, exportDir, tmpDir };
}

export function lineAudioPath(audioDir: string, lineId: string): string {
  return path.join(audioDir, "lines", `${lineId}.wav`);
}

export function chapterExportPath(
  exportDir: string,
  workTitle: string,
  chapterPosition: number,
  chapterTitle: string,
): string {
  const safe = (s: string) => s.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 80) || "untitled";
  return path.join(
    exportDir,
    `${safe(workTitle)}_${String(chapterPosition).padStart(3, "0")}_${safe(chapterTitle)}.wav`,
  );
}
