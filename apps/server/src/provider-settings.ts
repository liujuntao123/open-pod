import {
  FISH_DEFAULT_BASE_URL,
  MIMO_DEFAULT_BASE_URL,
  type TtsProviderKind,
} from "@open-pod/shared";
import type { Db } from "./db.js";
import { getProviderApiKey, setProviderApiKey } from "./secrets.js";
import { id, nowIso } from "./util.js";

export type ProviderConn = {
  id: string;
  provider: TtsProviderKind;
  name: string;
  base_url: string;
  created_at: string;
  updated_at: string;
};

const BUILTIN: Record<
  TtsProviderKind,
  { name: string; baseUrl: string }
> = {
  fish: { name: "Fish Audio", baseUrl: FISH_DEFAULT_BASE_URL },
  mimo: { name: "MiMo TTS", baseUrl: MIMO_DEFAULT_BASE_URL },
};

export const BUILTIN_FISH_NAME = BUILTIN.fish.name;
export const BUILTIN_MIMO_NAME = BUILTIN.mimo.name;

export function defaultBaseUrlFor(provider: TtsProviderKind): string {
  return BUILTIN[provider].baseUrl;
}

export function ensureBuiltinProviderConnection(
  db: Db,
  provider: TtsProviderKind,
): ProviderConn {
  const meta = BUILTIN[provider];
  const existing = db
    .prepare(
      `SELECT * FROM provider_connections WHERE provider = ? ORDER BY created_at ASC LIMIT 1`,
    )
    .get(provider) as ProviderConn | undefined;
  if (existing) {
    // Keep user-customized base_url; only sync the display name if it drifted.
    if (existing.name !== meta.name) {
      const t = nowIso();
      db.prepare(
        `UPDATE provider_connections SET name = ?, updated_at = ? WHERE id = ?`,
      ).run(meta.name, t, existing.id);
      return {
        ...existing,
        name: meta.name,
        updated_at: t,
      };
    }
    return existing;
  }

  const connId = id();
  const t = nowIso();
  db.prepare(
    `INSERT INTO provider_connections (id, provider, name, base_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(connId, provider, meta.name, meta.baseUrl, t, t);
  return {
    id: connId,
    provider,
    name: meta.name,
    base_url: meta.baseUrl,
    created_at: t,
    updated_at: t,
  };
}

/**
 * Persist a custom base URL for the builtin provider connection.
 * Empty / null / whitespace resets to the provider's default URL.
 */
export function setProviderBaseUrl(
  db: Db,
  provider: TtsProviderKind,
  baseUrl: string | null | undefined,
): ProviderConn {
  const conn = ensureBuiltinProviderConnection(db, provider);
  const trimmed = (baseUrl ?? "").trim().replace(/\/$/, "");
  const next = trimmed || defaultBaseUrlFor(provider);
  if (conn.base_url === next) return conn;
  const t = nowIso();
  db.prepare(
    `UPDATE provider_connections SET base_url = ?, updated_at = ? WHERE id = ?`,
  ).run(next, t, conn.id);
  return { ...conn, base_url: next, updated_at: t };
}

export function setFishBaseUrl(db: Db, baseUrl: string | null | undefined): ProviderConn {
  return setProviderBaseUrl(db, "fish", baseUrl);
}

export function setMimoBaseUrl(db: Db, baseUrl: string | null | undefined): ProviderConn {
  return setProviderBaseUrl(db, "mimo", baseUrl);
}

export function ensureBuiltinFishConnection(db: Db): ProviderConn {
  return ensureBuiltinProviderConnection(db, "fish");
}

export function ensureBuiltinMimoConnection(db: Db): ProviderConn {
  return ensureBuiltinProviderConnection(db, "mimo");
}

export function ensureBuiltinProviderConnections(db: Db): void {
  ensureBuiltinFishConnection(db);
  ensureBuiltinMimoConnection(db);
}

export function getProviderKindApiKey(
  db: Db,
  secretsPath: string,
  provider: TtsProviderKind,
): string | undefined {
  const conn = ensureBuiltinProviderConnection(db, provider);
  return getProviderApiKey(secretsPath, conn.id);
}

export function setProviderKindApiKey(
  db: Db,
  secretsPath: string,
  provider: TtsProviderKind,
  apiKey: string | null,
): ProviderConn {
  const conn = ensureBuiltinProviderConnection(db, provider);
  setProviderApiKey(secretsPath, conn.id, apiKey);
  return conn;
}

export function getFishApiKey(db: Db, secretsPath: string): string | undefined {
  return getProviderKindApiKey(db, secretsPath, "fish");
}

export function setFishApiKey(
  db: Db,
  secretsPath: string,
  apiKey: string | null,
): ProviderConn {
  return setProviderKindApiKey(db, secretsPath, "fish", apiKey);
}

export function getMimoApiKey(db: Db, secretsPath: string): string | undefined {
  return getProviderKindApiKey(db, secretsPath, "mimo");
}

export function setMimoApiKey(
  db: Db,
  secretsPath: string,
  apiKey: string | null,
): ProviderConn {
  return setProviderKindApiKey(db, secretsPath, "mimo", apiKey);
}
