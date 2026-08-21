import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkDeps, skillRootDir } from "../scripts/ensure-deps.mjs";

describe("ensure-deps", () => {
  it("reports skill root", () => {
    const root = skillRootDir();
    assert.match(root, /convert-documents-to-markdown$/);
  });

  it("checkDeps returns structure", () => {
    const s = checkDeps();
    assert.equal(typeof s.ok, "boolean");
    assert.ok(Array.isArray(s.missing));
    assert.equal(s.skillRoot, skillRootDir());
  });
});
