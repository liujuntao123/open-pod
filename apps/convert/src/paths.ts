import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveDataDir(): string {
  const fromEnv = process.env.OPEN_POD_CONVERT_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), ".open-pod-convert");
}

export function ensureDataLayout(dataDir: string) {
  const dbPath = path.join(dataDir, "convert.sqlite");
  const secretsPath = path.join(dataDir, "secrets.json");
  const jobsDir = path.join(dataDir, "jobs");
  const tmpDir = path.join(dataDir, "tmp");
  for (const p of [dataDir, jobsDir, tmpDir]) {
    fs.mkdirSync(p, { recursive: true });
  }
  return { dataDir, dbPath, secretsPath, jobsDir, tmpDir };
}

export function jobDir(jobsDir: string, jobId: string): string {
  return path.join(jobsDir, jobId);
}
