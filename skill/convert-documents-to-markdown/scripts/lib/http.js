import { ProxyAgent, fetch as undiciFetch } from "undici";
function resolveProxyUrl(settings) {
    if (!settings.enabled)
        return null;
    const explicit = settings.url?.trim();
    if (explicit)
        return explicit;
    const fromEnv = process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        process.env.https_proxy ||
        process.env.http_proxy;
    return fromEnv?.trim() || null;
}
export function createExternalFetch(settings) {
    const proxyUrl = resolveProxyUrl(settings);
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    return async (url, init = {}) => {
        const headerInit = {};
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
                body: typeof init.body === "string" ||
                    init.body instanceof Uint8Array ||
                    init.body == null
                    ? (init.body ?? undefined)
                    : Buffer.from(await new Response(init.body).arrayBuffer()),
                signal: init.signal ?? undefined,
                ...(dispatcher ? { dispatcher } : {}),
            });
            return res;
        }
        catch (err) {
            if (init.signal?.aborted) {
                const e = new Error("请求已取消");
                e.name = "AbortError";
                throw e;
            }
            throw new Error(`网络请求失败 (${url})`, { cause: err });
        }
    };
}
export function sleep(ms, signal) {
    const { promise, resolve, reject } = Promise.withResolvers();
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
//# sourceMappingURL=http.js.map