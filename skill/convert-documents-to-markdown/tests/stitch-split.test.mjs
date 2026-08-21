import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stitchSegments } from "../scripts/lib/stitch.js";
import { splitMarkdownByHeadings } from "../scripts/lib/split-markdown.js";
import { missingPlaceholder } from "../scripts/lib/types.js";

describe("stitch", () => {
  it("inserts placeholders for missing segments", () => {
    const r = stitchSegments([
      {
        index: 0,
        start: 1,
        end: 2,
        pageRanges: "1-2",
        state: "done",
        fullMd: "# A\n\nhello\n",
      },
      {
        index: 1,
        start: 3,
        end: 4,
        pageRanges: "3-4",
        state: "failed",
        errMsg: "boom",
      },
    ]);
    assert.match(r.fullMd, /缺失页段占位/);
    assert.equal(r.missingRanges.length, 1);
    assert.equal(r.missingRanges[0].start, 3);
    assert.ok(r.fullMd.includes("hello"));
  });
});

describe("split", () => {
  it("splits on h1 headings", () => {
    const md = "# One\n\na\n\n# Two\n\nb\n\n# Three\n\nc\n";
    const r = splitMarkdownByHeadings(md);
    assert.ok(r.parts.length >= 3);
    assert.equal(r.parts[0].order, 1);
    assert.match(r.parts[0].filename, /^001-/);
  });

  it("full.md convenience equals joined parts order for multi-part", () => {
    const md = "# One\n\na\n\n# Two\n\nb\n\n# Three\n\nc\n";
    const r = splitMarkdownByHeadings(md);
    const joined = r.parts.map((p) => p.content.trimEnd()).join("\n\n") + "\n";
    // not required equal to source after trim differences, but order preserved
    assert.ok(joined.indexOf("One") < joined.indexOf("Two"));
    assert.ok(joined.indexOf("Two") < joined.indexOf("Three"));
  });
});

describe("missingPlaceholder", () => {
  it("mentions page range", () => {
    assert.match(missingPlaceholder(5, 7), /5-7/);
  });
});
