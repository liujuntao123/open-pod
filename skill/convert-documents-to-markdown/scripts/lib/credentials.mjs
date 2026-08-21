import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "./paths.mjs";

/**
 * MinerU token lookup (first hit wins):
 * 1. OPEN_POD_CONVERT_SKILL_MINERU_TOKEN
 * 2. OPEN_POD_CONVERT_MINERU_TOKEN
 * 3. $OPEN_POD_CONVERT_DATA_DIR/secrets.json mineruApiToken
 */
export function resolveMineruToken(env = process.env, dataDir = resolveDataDir(env)) {
  const skill = env.OPEN_POD_CONVERT_SKILL_MINERU_TOKEN?.trim();
  if (skill) return { token: skill, source: "OPEN_POD_CONVERT_SKILL_MINERU_TOKEN" };
  const shared = env.OPEN_POD_CONVERT_MINERU_TOKEN?.trim();
  if (shared) return { token: shared, source: "OPEN_POD_CONVERT_MINERU_TOKEN" };
  const secretsPath = path.join(dataDir, "secrets.json");
  try {
    const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
    const t = raw?.mineruApiToken?.trim();
    if (t) return { token: t, source: "secrets.json" };
  } catch {
    // ignore
  }
  return { token: undefined, source: null };
}

/** Redact secrets from arbitrary text for logs. */
export function redactSecrets(text, token) {
  if (!text || !token) return text;
  return String(text).split(token).join("[REDACTED_TOKEN]");
}
