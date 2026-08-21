import fs from "node:fs/promises";

/**
 * Lightweight PDF text-layer probe (not a full text extractor).
 * Returns recommendation for MinerU isOcr.
 *
 * - hasText true + high confidence → isOcr=false
 * - hasText false + high confidence → isOcr=true
 * - gray zone → uncertain (agent should ask user)
 */
export async function detectPdfTextLayer(filePath, opts = {}) {
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const buf = await fs.readFile(filePath);
  const sample = buf.subarray(0, Math.min(buf.length, maxBytes)).toString("latin1");

  const btCount = (sample.match(/\bBT\b/g) || []).length;
  const tjCount = (sample.match(/Tj\b|TJ\b/g) || []).length;
  const fontCount = (sample.match(/\/Font\b/g) || []).length;
  const imageCount = (sample.match(/\/Image\b|\/XObject\b/g) || []).length;

  const textScore = btCount * 2 + tjCount + fontCount;
  const imageScore = imageCount;

  let recommendation; // true = use OCR, false = no OCR, null = uncertain
  let confidence; // high | medium | low
  let hasText;

  if (textScore >= 8 && textScore > imageScore * 0.3) {
    hasText = true;
    recommendation = false;
    confidence = textScore >= 20 ? "high" : "medium";
  } else if (textScore <= 1 && imageScore >= 3) {
    hasText = false;
    recommendation = true;
    confidence = "high";
  } else if (textScore <= 2 && imageScore <= 1) {
    hasText = false;
    recommendation = true;
    confidence = "medium";
  } else {
    hasText = textScore >= 3;
    recommendation = null;
    confidence = "low";
  }

  return {
    hasText,
    confidence,
    recommendation,
    signals: { btCount, tjCount, fontCount, imageCount, textScore, imageScore },
  };
}

/**
 * Resolve final isOcr given user override and detection.
 * If userOverride is boolean, use it.
 * If detection is uncertain, returns { needsUserInput: true }.
 */
export function resolveOcrChoice(userOverride, detection) {
  if (typeof userOverride === "boolean") {
    return {
      isOcr: userOverride,
      source: "user",
      detection,
      needsUserInput: false,
    };
  }
  if (detection.recommendation === null || detection.confidence === "low") {
    return {
      isOcr: undefined,
      source: "uncertain",
      detection,
      needsUserInput: true,
    };
  }
  return {
    isOcr: detection.recommendation,
    source: "auto",
    detection,
    needsUserInput: false,
  };
}
