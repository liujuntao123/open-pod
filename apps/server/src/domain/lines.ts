import {
  computeAudioFingerprint,
  fishEffectiveParams,
  fishVoiceIdentity,
  mergeEffectiveParams,
  mimoEffectiveParams,
  mimoVoiceIdentity,
  type JsonMap,
  type LineDto,
  type TtsProviderKind,
} from "@open-pod/shared";
import type { Db } from "../db.js";
import { parseJsonObject } from "../util.js";

type LineRow = {
  id: string;
  chapter_id: string;
  work_character_id: string;
  text: string;
  position: number;
  param_override_json: string;
  audio_path: string | null;
  audio_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

type ResolveRow = {
  line_id: string;
  line_text: string;
  line_override: string;
  character_id: string;
  character_override: string;
  voice_id: string | null;
  voice_config: string | null;
  provider: string | null;
  connection_id: string | null;
  work_provider: string | null;
};

export function mapLineDto(row: LineRow, audioState: LineDto["audioState"]): LineDto {
  return {
    id: row.id,
    chapterId: row.chapter_id,
    workCharacterId: row.work_character_id,
    text: row.text,
    position: row.position,
    paramOverride: parseJsonObject(row.param_override_json),
    audioPath: row.audio_path,
    audioFingerprint: row.audio_fingerprint,
    audioState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function resolveLineSynthesis(db: Db, lineId: string): {
  text: string;
  voiceId: string;
  provider: TtsProviderKind;
  providerConnectionId: string;
  voiceConfig: JsonMap;
  voiceIdentity: JsonMap;
  effectiveParams: JsonMap;
  fingerprint: string;
} {
  const row = db
    .prepare(
      `SELECT
        l.id as line_id,
        l.text as line_text,
        l.param_override_json as line_override,
        c.id as character_id,
        c.param_override_json as character_override,
        c.voice_id as voice_id,
        v.config_json as voice_config,
        pc.provider as provider,
        pc.id as connection_id,
        w.provider as work_provider
      FROM lines l
      JOIN work_characters c ON c.id = l.work_character_id
      JOIN chapters ch ON ch.id = l.chapter_id
      JOIN works w ON w.id = ch.work_id
      LEFT JOIN voices v ON v.id = c.voice_id
      LEFT JOIN provider_connections pc ON pc.id = v.provider_connection_id
      WHERE l.id = ?`,
    )
    .get(lineId) as ResolveRow | undefined;

  if (!row) throw new Error("台词行不存在");
  if (!row.line_text.trim()) throw new Error("台词为空");
  if (!row.voice_id || !row.voice_config || !row.connection_id || !row.provider) {
    throw new Error("作品角色未绑定可用音色");
  }

  const workProvider = (row.work_provider === "mimo" ? "mimo" : "fish") as TtsProviderKind;
  if (row.provider !== workProvider) {
    throw new Error(`音色 Provider（${row.provider}）与作品 Provider（${workProvider}）不一致`);
  }
  if (row.provider !== "fish" && row.provider !== "mimo") {
    throw new Error(`不支持的 Provider: ${row.provider}`);
  }
  const provider = row.provider as TtsProviderKind;

  const voiceConfig = parseJsonObject(row.voice_config);
  const characterOverride = parseJsonObject(row.character_override);
  const lineOverride = parseJsonObject(row.line_override);

  const voiceDefaults =
    provider === "mimo" ? mimoEffectiveParams(voiceConfig) : fishEffectiveParams(voiceConfig);
  const effectiveParams = mergeEffectiveParams(voiceDefaults, characterOverride, lineOverride);
  const voiceIdentity =
    provider === "mimo" ? mimoVoiceIdentity(voiceConfig) : fishVoiceIdentity(voiceConfig);
  const fingerprint = computeAudioFingerprint({
    text: row.line_text,
    voiceIdentity,
    effectiveParams,
  });

  return {
    text: row.line_text,
    voiceId: row.voice_id,
    provider,
    providerConnectionId: row.connection_id,
    voiceConfig,
    voiceIdentity,
    effectiveParams,
    fingerprint,
  };
}

export function lineAudioState(db: Db, row: LineRow): LineDto["audioState"] {
  if (!row.audio_path || !row.audio_fingerprint) return "none";
  try {
    const current = resolveLineSynthesis(db, row.id).fingerprint;
    return current === row.audio_fingerprint ? "fresh" : "stale";
  } catch {
    return "stale";
  }
}

export function listChapterLines(db: Db, chapterId: string): LineDto[] {
  const rows = db
    .prepare(
      `SELECT * FROM lines WHERE chapter_id = ? ORDER BY position ASC, created_at ASC`,
    )
    .all(chapterId) as LineRow[];
  return rows.map((r) => mapLineDto(r, lineAudioState(db, r)));
}
