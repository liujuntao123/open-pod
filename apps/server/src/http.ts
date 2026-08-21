import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * Outbound Fish calls often need the local HTTP proxy (WSL/network).
 * Priority: OPEN_POD_HTTP_PROXY → HTTPS_PROXY → HTTP_PROXY → http://127.0.0.1:7897
 * Set OPEN_POD_HTTP_PROXY=direct to force no proxy.
 */
function resolveProxyUrl(): string | null {
  const explicit = process.env.OPEN_POD_HTTP_PROXY?.trim();
  if (explicit === "direct" || explicit === "none" || explicit === "off") return null;
  if (explicit) return explicit;
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  if (fromEnv?.trim()) return fromEnv.trim();
  return "http://127.0.0.1:7897";
}

const proxyUrl = resolveProxyUrl();
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

if (proxyUrl) {
  console.log(`Outbound HTTP proxy: ${proxyUrl}`);
} else {
  console.log("Outbound HTTP proxy: direct");
}

export async function externalFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headerInit: Record<string, string> = {};
  if (init.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headerInit[key] = value;
    });
  }

  try {
    const res = await undiciFetch(url, {
      method: init.method,
      headers: headerInit,
      body:
        typeof init.body === "string" || init.body instanceof Uint8Array || init.body == null
          ? (init.body ?? undefined)
          : String(init.body),
      signal: init.signal ?? undefined,
      ...(dispatcher ? { dispatcher } : {}),
    });
    return res as unknown as Response;
  } catch (err) {
    if (init.signal?.aborted) {
      const e = new Error("请求已取消");
      e.name = "AbortError";
      throw e;
    }
    // Keep message short; truncateError/formatError walks `cause` for undici/system detail.
    throw new Error(`网络请求失败 (${url})`, { cause: err });
  }
}
