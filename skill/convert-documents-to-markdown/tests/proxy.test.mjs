import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { selectProxyRoute } from "../scripts/lib/proxy.mjs";

describe("proxy selection", () => {
  it("prefers OPEN_POD_CONVERT_SKILL_PROXY_URL", async () => {
    const r = await selectProxyRoute({
      OPEN_POD_CONVERT_SKILL_PROXY_URL: "http://127.0.0.1:9999",
      HTTPS_PROXY: "http://127.0.0.1:8888",
    });
    assert.equal(r.proxyEnabled, true);
    assert.equal(r.proxyUrl, "http://127.0.0.1:9999");
    assert.equal(r.source, "OPEN_POD_CONVERT_SKILL_PROXY_URL");
  });

  it("uses HTTPS_PROXY when skill proxy unset", async () => {
    const r = await selectProxyRoute({
      HTTPS_PROXY: "http://127.0.0.1:8888",
    });
    assert.equal(r.proxyUrl, "http://127.0.0.1:8888");
    assert.equal(r.source, "HTTP(S)_PROXY");
  });
});
