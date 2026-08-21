import {
  FISH_DEFAULT_BASE_URL,
  fishApplyEmotionText,
  fishEffectiveParams,
  fishVoiceIdentity,
  type JsonMap,
} from "@open-pod/shared";
import { externalFetch } from "../http.js";
import { formatHttpErrorBody } from "../util.js";

export interface FishSynthesizeInput {
  baseUrl: string;
  apiKey: string;
  text: string;
  config: JsonMap;
  /** Already-merged effective speech params when provided. */
  effectiveParams?: JsonMap;
  signal?: AbortSignal;
}

export async function fishSynthesize(input: FishSynthesizeInput): Promise<Buffer> {
  const base = (input.baseUrl || FISH_DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = String(input.config.model ?? "s2.1-pro-free");
  const referenceId = String(input.config.reference_id ?? "");
  if (!referenceId) throw new Error("Fish 音色缺少 reference_id");

  const params = input.effectiveParams ?? fishEffectiveParams(input.config);
  const text = fishApplyEmotionText(input.text, params.emotion);

  const body: Record<string, unknown> = {
    text,
    reference_id: referenceId,
    format: "wav",
    temperature: Number(params.temperature ?? 0.7),
    top_p: Number(params.top_p ?? 0.7),
    repetition_penalty: Number(params.repetition_penalty ?? 1.2),
    chunk_length: Number(params.chunk_length ?? 200),
    normalize: params.normalize === undefined ? true : Boolean(params.normalize),
    latency: String(params.latency ?? "normal"),
    prosody: {
      speed: Number(params.speed ?? 1),
      volume: Number(params.volume ?? 0),
    },
  };

  const res = await externalFetch(`${base}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      model,
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  if (!res.ok) {
    const textErr = await res.text().catch(() => "");
    const detail = formatHttpErrorBody(textErr);
    throw new Error(
      detail ? `Fish TTS ${res.status}: ${detail}` : `Fish TTS ${res.status}: (empty body)`,
    );
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export { fishVoiceIdentity, fishEffectiveParams };
