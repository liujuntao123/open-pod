import fs from "node:fs";

export type SecretsFile = {
  providerApiKeys: Record<string, string>;
  /** OpenAI-compatible LLM key for script generation (studio-level). */
  scriptLlmApiKey?: string;
};

export function loadSecrets(secretsPath: string): SecretsFile {
  if (!fs.existsSync(secretsPath)) {
    return { providerApiKeys: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8")) as SecretsFile;
    return {
      providerApiKeys: raw.providerApiKeys ?? {},
      scriptLlmApiKey: raw.scriptLlmApiKey,
    };
  } catch {
    return { providerApiKeys: {} };
  }
}

export function saveSecrets(secretsPath: string, secrets: SecretsFile): void {
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(secretsPath, 0o600);
  } catch {
    /* ignore on platforms without chmod */
  }
}

export function setProviderApiKey(
  secretsPath: string,
  connectionId: string,
  apiKey: string | null,
): void {
  const secrets = loadSecrets(secretsPath);
  if (!apiKey) delete secrets.providerApiKeys[connectionId];
  else secrets.providerApiKeys[connectionId] = apiKey;
  saveSecrets(secretsPath, secrets);
}

export function getProviderApiKey(secretsPath: string, connectionId: string): string | undefined {
  return loadSecrets(secretsPath).providerApiKeys[connectionId];
}

export function getScriptLlmApiKey(secretsPath: string): string | undefined {
  const key = loadSecrets(secretsPath).scriptLlmApiKey?.trim();
  return key || undefined;
}

export function setScriptLlmApiKey(secretsPath: string, apiKey: string | null): void {
  const secrets = loadSecrets(secretsPath);
  const next = apiKey?.trim() || "";
  if (!next) delete secrets.scriptLlmApiKey;
  else secrets.scriptLlmApiKey = next;
  saveSecrets(secretsPath, secrets);
}
