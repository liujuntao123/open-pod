import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateConversionPackage } from "../scripts/lib/validate.mjs";
import {
  buildJobReport,
  buildBatchReport,
  formatReportText,
} from "../scripts/lib/report.mjs";
import { zipDirectory } from "../scripts/lib/package-zip.js";

async function makeJob({ status = "succeeded", withZip = true, parts = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "val-job-"));
  const out = path.join(root, "output");
  const partsDir = path.join(out, "markdown", "parts");
  fs.mkdirSync(partsDir, { recursive: true });
  fs.mkdirSync(path.join(out, "images"), { recursive: true });
  const partList = parts
    ? [
        { path: "markdown/parts/001-a.md", title: "A", order: 1 },
        { path: "markdown/parts/002-b.md", title: "B", order: 2 },
      ]
    : [];
  if (parts) {
    fs.writeFileSync(path.join(partsDir, "001-a.md"), "# A\n\nx\n");
    fs.writeFileSync(path.join(partsDir, "002-b.md"), "# B\n\ny\n");
  }
  fs.writeFileSync(path.join(out, "markdown", "full.md"), "# A\n\nx\n\n# B\n\ny\n");
  fs.writeFileSync(
    path.join(out, "manifest.json"),
    JSON.stringify({
      jobId: "j1",
      sourceType: "epub",
      sourceName: "t.epub",
      status,
      parts: partList,
      missingRanges: [],
      segments: [],
      warnings: [],
    }),
  );
  if (withZip) {
    await zipDirectory(out, path.join(root, "result.zip"));
  }
  return root;
}

describe("validate", () => {
  it("passes complete package", async () => {
    const root = await makeJob();
    const v = await validateConversionPackage(root);
    assert.equal(v.ok, true, v.errors.join("; "));
  });

  it("fails when result.zip missing", async () => {
    const root = await makeJob({ withZip: false });
    const v = await validateConversionPackage(root);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => e.includes("result.zip")));
  });

  it("fails when parts missing", async () => {
    const root = await makeJob({ parts: false });
    // still wrote empty parts dir and empty manifest parts
    const v = await validateConversionPackage(root);
    assert.equal(v.ok, false);
  });
});

describe("report", () => {
  it("marks partial with next steps", () => {
    const r = buildJobReport({
      jobId: "j",
      sourceName: "a.pdf",
      sourceType: "pdf",
      status: "partial",
      jobRoot: "/data/skill-jobs/j",
      partCount: 2,
      missingRanges: [{ start: 10, end: 20 }],
      failedSegments: [{ index: 1, state: "failed" }],
      warnings: ["seg failed"],
    });
    assert.equal(r.status, "partial");
    assert.ok(r.nextSteps.some((s) => s.includes("partial")));
  });

  it("batch summary counts statuses", () => {
    const b = buildBatchReport([
      { status: "succeeded" },
      { status: "failed" },
      { status: "partial" },
    ]);
    assert.deepEqual(b.summary, {
      succeeded: 1,
      partial: 1,
      failed: 1,
      cancelled: 0,
    });
    const text = formatReportText(b);
    assert.match(text, /succeeded 1/);
  });

  it("failed validation flips report", () => {
    const r = buildJobReport({
      jobId: "j",
      sourceName: "a.pdf",
      sourceType: "pdf",
      status: "succeeded",
      jobRoot: "/x",
      validation: { ok: false, errors: ["missing manifest"] },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.validationFailed, true);
  });
});
