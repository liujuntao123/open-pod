import fs from "node:fs";

export type ConvertSecrets = {
  mineruApiToken?: string;
};

export function loadSecrets(secretsPath: string): ConvertSecrets {
  try {
    const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8")) as ConvertSecrets;
    return { mineruApiToken: raw.mineruApiToken };
  } catch {
    return {};
  }
}

export function saveSecrets(secretsPath: string, secrets: ConvertSecrets): void {
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
}

/** env OPEN_POD_CONVERT_MINERU_TOKEN overrides disk */
export function resolveMineruToken(secretsPath: string): string | undefined {
  const fromEnv = process.env.OPEN_POD_CONVERT_MINERU_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return loadSecrets(secretsPath).mineruApiToken?.trim() || undefined;
}

export function setMineruToken(secretsPath: string, token: string | undefined): void {
  const secrets = loadSecrets(secretsPath);
  const next = token?.trim() || "";
  if (!next) delete secrets.mineruApiToken;
  else secrets.mineruApiToken = next;
  saveSecrets(secretsPath, secrets);
}
