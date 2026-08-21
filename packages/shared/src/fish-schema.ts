export type ParamFieldType = "string" | "number" | "boolean" | "enum";

export interface ParamFieldSchema {
  key: string;
  label: string;
  type: ParamFieldType;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  description?: string;
  /** When true, field is voice identity only (not character/line override). */
  identity?: boolean;
}

export const FISH_MODELS = [
  { value: "s2.1-pro-free", label: "s2.1-pro-free" },
  { value: "s2.1-pro", label: "s2.1-pro" },
  { value: "s2-pro", label: "s2-pro" },
  { value: "s1", label: "s1" },
] as const;

/** Common emotion tags for S2-family models (text cue prefix). */
export const FISH_EMOTION_PRESETS = [
  { value: "", label: "默认（无标签）" },
  { value: "happy", label: "开心 happy" },
  { value: "sad", label: "悲伤 sad" },
  { value: "angry", label: "愤怒 angry" },
  { value: "excited", label: "兴奋 excited" },
  { value: "surprised", label: "惊讶 surprised" },
  { value: "fearful", label: "恐惧 fearful" },
  { value: "disgusted", label: "厌恶 disgusted" },
  { value: "calm", label: "平静 calm" },
  { value: "whisper", label: "低语 whisper" },
  { value: "shouting", label: "呼喊 shouting" },
  { value: "serious", label: "严肃 serious" },
  { value: "sarcastic", label: "讽刺 sarcastic" },
] as const;

/** Identity + tunable defaults for Fish voices. */
export const FISH_VOICE_SCHEMA: ParamFieldSchema[] = [
  {
    key: "model",
    label: "模型",
    type: "enum",
    default: "s2.1-pro-free",
    options: FISH_MODELS.map((m) => ({ value: m.value, label: m.label })),
    identity: true,
  },
  {
    key: "reference_id",
    label: "Reference ID",
    type: "string",
    default: "",
    description: "Fish voice model id",
    identity: true,
  },
  {
    key: "speed",
    label: "语速",
    type: "number",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.05,
    description: "prosody.speed，0.5–2.0",
  },
  {
    key: "volume",
    label: "音量 (dB)",
    type: "number",
    default: 0,
    min: -20,
    max: 20,
    step: 1,
    description: "prosody.volume，单位 dB",
  },
  {
    key: "emotion",
    label: "情绪标签",
    type: "string",
    default: "",
    description: "生成时在台词前加 [标签]；Fish S2 系列用方括号情绪/副语言控制",
  },
  {
    key: "temperature",
    label: "Temperature",
    type: "number",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
    description: "越低越稳定，越高越随机",
  },
  {
    key: "top_p",
    label: "Top P",
    type: "number",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: "repetition_penalty",
    label: "重复惩罚",
    type: "number",
    default: 1.2,
    min: 0.9,
    max: 2,
    step: 0.05,
    description: ">1 抑制重复音素/词",
  },
  {
    key: "chunk_length",
    label: "分块长度",
    type: "number",
    default: 200,
    min: 100,
    max: 300,
    step: 10,
    description: "每段生成字符数 100–300",
  },
  {
    key: "normalize",
    label: "文本规范化",
    type: "boolean",
    default: true,
    description: "展开数字/日期等以便自然朗读",
  },
  {
    key: "latency",
    label: "延迟档",
    type: "enum",
    default: "normal",
    options: [
      { value: "normal", label: "normal（质量优先）" },
      { value: "balanced", label: "balanced" },
      { value: "low", label: "low（低延迟）" },
    ],
  },
];

/** Tunable params only — character / line overrides. */
export const FISH_PARAM_OVERRIDE_SCHEMA: ParamFieldSchema[] = FISH_VOICE_SCHEMA.filter(
  (f) => !f.identity,
);

export const FISH_DEFAULT_BASE_URL = "https://api.fish.audio";
export const FISH_VOICE_TEST_TEXT = "你好，这是一段音色试听。";

export function fishVoiceIdentity(config: Record<string, unknown>): Record<string, unknown> {
  return {
    provider: "fish",
    model: String(config.model ?? "s2.1-pro-free"),
    reference_id: String(config.reference_id ?? ""),
  };
}

export function fishEffectiveParams(config: Record<string, unknown>): Record<string, unknown> {
  const emotionRaw = config.emotion;
  const emotion =
    emotionRaw === undefined || emotionRaw === null ? "" : String(emotionRaw).trim();

  return {
    speed: Number(config.speed ?? 1),
    volume: Number(config.volume ?? 0),
    temperature: Number(config.temperature ?? 0.7),
    top_p: Number(config.top_p ?? 0.7),
    repetition_penalty: Number(config.repetition_penalty ?? 1.2),
    chunk_length: Number(config.chunk_length ?? 200),
    normalize: config.normalize === undefined ? true : Boolean(config.normalize),
    latency: String(config.latency ?? "normal"),
    emotion,
  };
}

/** Prefix Fish emotion/style cue onto synthesis text. */
export function fishApplyEmotionText(text: string, emotion: unknown): string {
  const tag = String(emotion ?? "").trim();
  if (!tag) return text;
  const cue = tag.startsWith("[") ? tag : `[${tag}]`;
  const trimmed = text.trimStart();
  if (trimmed.startsWith(cue)) return text;
  return `${cue} ${text}`;
}
