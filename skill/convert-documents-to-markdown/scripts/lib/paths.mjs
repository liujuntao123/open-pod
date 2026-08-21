import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function resolveDataDir(env = process.env) {
  const fromEnv = env.OPEN_POD_CONVERT_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), ".open-pod-convert");
}

export function skillJobsDir(dataDir = resolveDataDir()) {
  return path.join(dataDir, "skill-jobs");
}

/** Web service owns this; skill must not manage it. */
export function serviceJobsDir(dataDir = resolveDataDir()) {
  return path.join(dataDir, "jobs");
}

export function newJobId() {
  return randomUUID();
}

export function jobPaths(jobId, dataDir = resolveDataDir()) {
  const jobRoot = path.join(skillJobsDir(dataDir), jobId);
  return {
    dataDir,
    jobId,
    jobRoot,
    inputDir: path.join(jobRoot, "input"),
    workDir: path.join(jobRoot, "work"),
    outputDir: path.join(jobRoot, "output"),
    resultZip: path.join(jobRoot, "result.zip"),
    statePath: path.join(jobRoot, "work", "state.json"),
    logPath: path.join(jobRoot, "work", "job.log"),
  };
}

export function ensureSkillDataLayout(dataDir = resolveDataDir()) {
  const skillJobs = skillJobsDir(dataDir);
  fs.mkdirSync(skillJobs, { recursive: true });
  // Never create or touch jobs/ (web service)
  return { dataDir, skillJobs };
}

export function assertNotServiceJobsPath(targetPath, dataDir = resolveDataDir()) {
  const service = path.resolve(serviceJobsDir(dataDir));
  const resolved = path.resolve(targetPath);
  if (resolved === service || resolved.startsWith(service + path.sep)) {
    throw new Error(`Skill must not write under service jobs dir: ${service}`);
  }
}
