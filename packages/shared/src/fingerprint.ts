import { canonicalJson } from "./params.js";
import type { JsonMap } from "./types.js";

/** Bump when adapter result semantics change. */
export const AUDIO_RESULT_VERSION = "wav-v1";

export interface FingerprintInput {
  text: string;
  voiceIdentity: JsonMap;
  effectiveParams: JsonMap;
  resultVersion?: string;
}

export function normalizeLineText(text: string): string {
  return text.replace(/\r\n/g, "\n").trimEnd();
}

export function computeAudioFingerprint(input: FingerprintInput): string {
  const payload = {
    text: normalizeLineText(input.text),
    voiceIdentity: input.voiceIdentity,
    effectiveParams: input.effectiveParams,
    resultVersion: input.resultVersion ?? AUDIO_RESULT_VERSION,
  };
  return canonicalJson(payload);
}

export function isFingerprintMatch(
  stored: string | null | undefined,
  current: string,
): boolean {
  if (!stored) return false;
  return stored === current;
}
