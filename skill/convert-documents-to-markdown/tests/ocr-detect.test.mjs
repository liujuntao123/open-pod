import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { detectPdfTextLayer, resolveOcrChoice } from "../scripts/lib/ocr-detect.mjs";

describe("ocr detect", () => {
  it("user override wins", () => {
    const r = resolveOcrChoice(true, {
      recommendation: false,
      confidence: "high",
      hasText: true,
    });
    assert.equal(r.isOcr, true);
    assert.equal(r.source, "user");
    assert.equal(r.needsUserInput, false);
  });

  it("uncertain detection needs user input", () => {
    const r = resolveOcrChoice(undefined, {
      recommendation: null,
      confidence: "low",
      hasText: false,
    });
    assert.equal(r.needsUserInput, true);
  });

  it("runs on a real small pdf without throwing", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Hello text layer", { x: 50, y: 500, size: 12, font });
    const bytes = await doc.save();
    const p = path.join(os.tmpdir(), `ocr-test-${Date.now()}.pdf`);
    fs.writeFileSync(p, bytes);
    const d = await detectPdfTextLayer(p);
    assert.equal(typeof d.hasText, "boolean");
    assert.ok(["high", "medium", "low"].includes(d.confidence));
  });
});
