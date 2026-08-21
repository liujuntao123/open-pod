import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveMineruToken, redactSecrets } from "../scripts/lib/credentials.mjs";

describe("credentials", () => {
  it("prefers SKILL token over shared env and secrets", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tok-"));
    fs.writeFileSync(
      path.join(dir, "secrets.json"),
      JSON.stringify({ mineruApiToken: "from-file" }),
    );
    const r = resolveMineruToken(
      {
        OPEN_POD_CONVERT_SKILL_MINERU_TOKEN: "skill-tok",
        OPEN_POD_CONVERT_MINERU_TOKEN: "shared-tok",
      },
      dir,
    );
    assert.equal(r.token, "skill-tok");
    assert.equal(r.source, "OPEN_POD_CONVERT_SKILL_MINERU_TOKEN");
  });

  it("falls back to shared env then secrets.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tok-"));
    fs.writeFileSync(
      path.join(dir, "secrets.json"),
      JSON.stringify({ mineruApiToken: "from-file" }),
    );
    assert.equal(
      resolveMineruToken({ OPEN_POD_CONVERT_MINERU_TOKEN: "shared" }, dir).token,
      "shared",
    );
    assert.equal(resolveMineruToken({}, dir).token, "from-file");
  });

  it("redacts token from text", () => {
    assert.equal(redactSecrets("Bearer SECRET123 ok", "SECRET123"), "Bearer [REDACTED_TOKEN] ok");
  });
});
