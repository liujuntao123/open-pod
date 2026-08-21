import { formatHttpErrorBody } from "./util.js";
import {
  buildScriptGenerateUserPrompt,
  normalizeGeneratedScript,
  scriptGenerateSystemPrompt,
  type ScriptProviderKind,
} from "@open-pod/shared";
import { externalFetch } from "./http.js";

export type ScriptLlmSettings = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
};

export type ScriptLlmConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

function buildChatBody(
  config: ScriptLlmConfig,
  input: { instruction: string; sourceText?: string; provider?: ScriptProviderKind },
  stream: boolean,
) {
  const provider = input.provider ?? "fish";
  return {
    model: config.model,
    temperature: 0.7,
    stream,
    messages: [
      { role: "system", content: scriptGenerateSystemPrompt(provider) },
      {
        role: "user",
        content: buildScriptGenerateUserPrompt({
          instruction: input.instruction,
          sourceText: input.sourceText,
          provider,
        }),
      },
    ],
  };
}

function finalizeScript(raw: string): { script: string; raw: string } {
  if (!String(raw).trim()) {
    throw new Error("模型未返回剧本文本");
  }
  const script = normalizeGeneratedScript(String(raw));
  if (!script) {
    throw new Error("模型返回内容无法解析为剧本");
  }
  return { script, raw: String(raw) };
}

export async function generateScriptWithLlm(
  config: ScriptLlmConfig,
  input: { instruction: string; sourceText?: string; provider?: ScriptProviderKind },
  signal?: AbortSignal,
): Promise<{ script: string; raw: string }> {
  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;

  const res = await externalFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildChatBody(config, input, false)),
    signal,
  });

  if (!res.ok) {
    const textErr = await res.text().catch(() => "");
    const detail = formatHttpErrorBody(textErr);
    throw new Error(
      detail ? `剧本 LLM ${res.status}: ${detail}` : `剧本 LLM ${res.status}: (empty body)`,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  return finalizeScript(String(raw));
}

/**
 * Stream OpenAI-compatible chat completions. Invokes onDelta for each content chunk.
 * Returns the normalized final script after the upstream stream ends.
 */
export async function streamScriptWithLlm(
  config: ScriptLlmConfig,
  input: { instruction: string; sourceText?: string; provider?: ScriptProviderKind },
  onDelta: (delta: string) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<{ script: string; raw: string }> {
  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;

  const res = await externalFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(buildChatBody(config, input, true)),
    signal,
  });

  if (!res.ok) {
    const textErr = await res.text().catch(() => "");
    const detail = formatHttpErrorBody(textErr);
    throw new Error(
      detail ? `剧本 LLM ${res.status}: ${detail}` : `剧本 LLM ${res.status}: (empty body)`,
    );
  }

  if (!res.body) {
    throw new Error("剧本 LLM 未返回流式响应体");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";

  try {
    while (true) {
      if (signal?.aborted) {
        const e = new Error("请求已取消");
        e.name = "AbortError";
        throw e;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Normalize newlines; process complete SSE blocks / lines.
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);

        const trimmed = line.trimEnd();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trimStart();
        if (!payload || payload === "[DONE]") continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(payload);
        } catch {
          // Partial / non-JSON data line — skip.
          continue;
        }

        const delta = extractStreamDelta(parsed);
        if (!delta) continue;
        raw += delta;
        await onDelta(delta);
      }
    }

    // Flush any trailing decoder bytes (usually empty for SSE).
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const line of buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
        const trimmed = line.trimEnd();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trimStart();
        if (!payload || payload === "[DONE]") continue;
        try {
          const delta = extractStreamDelta(JSON.parse(payload));
          if (delta) {
            raw += delta;
            await onDelta(delta);
          }
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return finalizeScript(raw);
}

function extractStreamDelta(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return "";
  if (!("choices" in parsed) || !Array.isArray(parsed.choices) || !parsed.choices.length) {
    return "";
  }
  const first = parsed.choices[0];
  if (!first || typeof first !== "object") return "";

  if ("delta" in first && first.delta && typeof first.delta === "object" && "content" in first.delta) {
    const content = first.delta.content;
    if (content != null) return String(content);
  }

  // Some gateways still send full message chunks in stream mode.
  if (
    "message" in first &&
    first.message &&
    typeof first.message === "object" &&
    "content" in first.message
  ) {
    const content = first.message.content;
    if (content != null) return String(content);
  }

  // Rare: plain text field
  if ("text" in first && first.text != null) return String(first.text);

  return "";
}
