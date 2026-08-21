import type { ParamFieldSchema } from "./fish-schema.js";

export type TtsProviderKind = "fish" | "mimo";

export const MIMO_MODEL = "mimo-v2.5-tts" as const;

/** Official preset voices for mimo-v2.5-tts (docs 2026-07). */
export const MIMO_PRESET_VOICES = [
  { id: "mimo_default", name: "MiMo-默认", language: "mixed", gender: "" },
  { id: "冰糖", name: "冰糖", language: "zh", gender: "female" },
  { id: "茉莉", name: "茉莉", language: "zh", gender: "female" },
  { id: "苏打", name: "苏打", language: "zh", gender: "male" },
  { id: "白桦", name: "白桦", language: "zh", gender: "male" },
  { id: "Mia", name: "Mia", language: "en", gender: "female" },
  { id: "Chloe", name: "Chloe", language: "en", gender: "female" },
  { id: "Milo", name: "Milo", language: "en", gender: "male" },
  { id: "Dean", name: "Dean", language: "en", gender: "male" },
] as const;

export type MimoPresetVoiceId = (typeof MIMO_PRESET_VOICES)[number]["id"];

export const MIMO_VOICE_SCHEMA: ParamFieldSchema[] = [
  {
    key: "model",
    label: "模型",
    type: "enum",
    default: MIMO_MODEL,
    options: [{ value: MIMO_MODEL, label: MIMO_MODEL }],
    identity: true,
  },
  {
    key: "voice",
    label: "预置音色",
    type: "enum",
    default: "冰糖",
    options: MIMO_PRESET_VOICES.map((v) => ({ value: v.id, label: v.name })),
    identity: true,
    description: "映射 audio.voice",
  },
  {
    key: "style_instruction",
    label: "风格指令",
    type: "string",
    default: "",
    description: "自然语言表演控制 → 生成时 role:user 消息；空则不发送",
  },
];

export const MIMO_PARAM_OVERRIDE_SCHEMA: ParamFieldSchema[] = MIMO_VOICE_SCHEMA.filter(
  (f) => !f.identity,
);

export const MIMO_DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
export const MIMO_VOICE_TEST_TEXT = "你好，这是一段音色试听。";

export function isMimoPresetVoiceId(value: string): boolean {
  return MIMO_PRESET_VOICES.some((v) => v.id === value);
}

export function mimoPresetLabel(voiceId: string): string {
  return MIMO_PRESET_VOICES.find((v) => v.id === voiceId)?.name ?? voiceId;
}

export function mimoVoiceIdentity(config: Record<string, unknown>): Record<string, unknown> {
  return {
    provider: "mimo",
    model: String(config.model ?? MIMO_MODEL),
    voice: String(config.voice ?? ""),
  };
}

export function mimoEffectiveParams(config: Record<string, unknown>): Record<string, unknown> {
  const raw = config.style_instruction;
  const style_instruction =
    raw === undefined || raw === null ? "" : String(raw).trim();
  return { style_instruction };
}

export function defaultMimoVoiceConfig(voiceId: string): Record<string, unknown> {
  return {
    model: MIMO_MODEL,
    voice: voiceId,
    style_instruction: "",
  };
}
