import { ProxyAgent, fetch as undiciFetch } from "undici";

const LOCAL_FALLBACK = "http://127.0.0.1:7897";
const PRECHECK_URL = "https://mineru.net/";

/**
 * Select network route before any MinerU submit.
 * 1. OPEN_POD_CONVERT_SKILL_PROXY_URL
 * 2. HTTPS_PROXY / HTTP_PROXY
 * 3. direct precheck (no side effects)
 * 4. if direct fails, try http://127.0.0.1:7897
 *
 * Once chosen for a job, callers must pin it (no mid-job switch).
 */
export async function selectProxyRoute(env = process.env, opts = {}) {
  const skillProxy = env.OPEN_POD_CONVERT_SKILL_PROXY_URL?.trim();
  if (skillProxy) {
    return { proxyEnabled: true, proxyUrl: skillProxy, source: "OPEN_POD_CONVERT_SKILL_PROXY_URL" };
  }
  const envProxy =
    env.HTTPS_PROXY?.trim() ||
    env.HTTP_PROXY?.trim() ||
    env.https_proxy?.trim() ||
    env.http_proxy?.trim();
  if (envProxy) {
    return { proxyEnabled: true, proxyUrl: envProxy, source: "HTTP(S)_PROXY" };
  }

  const timeoutMs = opts.precheckTimeoutMs ?? 5000;
  const directOk = await probe(null, timeoutMs);
  if (directOk) {
    return { proxyEnabled: false, proxyUrl: undefined, source: "direct" };
  }

  const localOk = await probe(LOCAL_FALLBACK, timeoutMs);
  if (localOk) {
    return {
      proxyEnabled: true,
      proxyUrl: LOCAL_FALLBACK,
      source: "local-fallback-7897",
    };
  }

  // Fall back to direct and let real requests surface the error
  return {
    proxyEnabled: false,
    proxyUrl: undefined,
    source: "direct-after-failed-precheck",
    warning: "Direct and local proxy prechecks failed; will attempt direct anyway",
  };
}

async function probe(proxyUrl, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    await undiciFetch(PRECHECK_URL, {
      method: "HEAD",
      signal: ac.signal,
      ...(dispatcher ? { dispatcher } : {}),
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
