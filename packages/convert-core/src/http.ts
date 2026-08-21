import { ProxyAgent, fetch as undiciFetch } from "undici";
import type { ExternalFetch } from "./types.js";

export type ProxySettings = {
  enabled: boolean;
  /** Explicit proxy URL when enabled; falls back to env when empty. */
  url?: string;
};

function resolveProxyUrl(settings: ProxySettings): string | null {
  if (!settings.enabled) return null;
  const explicit = settings.url?.trim();
  if (explicit) return explicit;
  const fromEnv =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  return fromEnv?.trim() || null;
}

export function createExternalFetch(settings: ProxySettings): ExternalFetch {
  const proxyUrl = resolveProxyUrl(settings);
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  return async (url: string, init: RequestInit = {}): Promise<Response> => {
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
          typeof init.body === "string" ||
          init.body instanceof Uint8Array ||
          init.body == null
            ? (init.body ?? undefined)
            : Buffer.from(await new Response(init.body).arrayBuffer()),
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
      throw new Error(`网络请求失败 (${url})`, { cause: err });
    }
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    const e = new Error("请求已取消");
    e.name = "AbortError";
    reject(e);
    return promise;
  }
  const t = setTimeout(resolve, ms);
  const onAbort = () => {
    clearTimeout(t);
    const e = new Error("请求已取消");
    e.name = "AbortError";
    reject(e);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  return promise;
}
