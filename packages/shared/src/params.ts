import type { JsonMap } from "./types.js";

/** Later layers win on key conflict. Only plain own keys. */
export function mergeEffectiveParams(
  voiceDefaults: JsonMap,
  characterOverride: JsonMap = {},
  lineOverride: JsonMap = {},
): JsonMap {
  const out: JsonMap = {};
  for (const src of [voiceDefaults, characterOverride, lineOverride]) {
    for (const [k, v] of Object.entries(src)) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

/** Stable JSON for fingerprints: sorted keys, no undefined. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortValue);
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined) out[k] = sortValue(v);
  }
  return out;
}
