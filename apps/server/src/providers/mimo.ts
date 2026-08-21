import {
  MIMO_DEFAULT_BASE_URL,
  MIMO_MODEL,
  mimoEffectiveParams,
  mimoVoiceIdentity,
  type JsonMap,
} from "@open-pod/shared";
import { externalFetch } from "../http.js";
import { formatHttpErrorBody } from "../util.js";

export interface MimoSynthesizeInput {
  baseUrl: string;
  apiKey: string;
  text: string;
  config: JsonMap;
  /** Already-merged effective speech params when provided. */
  effectiveParams?: JsonMap;
  signal?: AbortSignal;
}

export async function mimoSynthesize(input: MimoSynthesizeInput): Promise<Buffer> {
  const base = (input.baseUrl || MIMO_DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = String(input.config.model ?? MIMO_MODEL);
  const voice = String(input.config.voice ?? "").trim();
  if (!voice) throw new Error("MiMo 音色缺少 voice");

  const params = input.effectiveParams ?? mimoEffectiveParams(input.config);
  const style = String(params.style_instruction ?? "").trim();
  const lineText = input.text;
  if (!lineText.trim()) throw new Error("台词为空");

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  if (style) {
    messages.push({ role: "user", content: style });
  }
  // Line text may embed MiMo audio tags written in the script; adapter does not inject tags.
  messages.push({ role: "assistant", content: lineText });

  const body = {
    model,
    messages,
    audio: {
      format: "wav",
      voice,
    },
  };

  const res = await externalFetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "api-key": input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  if (!res.ok) {
    const textErr = await res.text().catch(() => "");
    const detail = formatHttpErrorBody(textErr);
    throw new Error(
      detail ? `MiMo TTS ${res.status}: ${detail}` : `MiMo TTS ${res.status}: (empty body)`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { audio?: { data?: string } } }>;
  };
  const b64 = json.choices?.[0]?.message?.audio?.data;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("MiMo TTS 响应缺少 audio.data");
  }
  return Buffer.from(b64, "base64");
}

export { mimoVoiceIdentity, mimoEffectiveParams };
