import fs from "node:fs/promises";
import path from "node:path";

/**
 * Structural completion validation. Does not judge semantic chapter quality.
 */
export async function validateConversionPackage(jobRoot) {
  const errors = [];
  const warnings = [];

  const outputDir = path.join(jobRoot, "output");
  const manifestPath = path.join(outputDir, "manifest.json");
  const fullMdPath = path.join(outputDir, "markdown", "full.md");
  const partsDir = path.join(outputDir, "markdown", "parts");
  const resultZip = path.join(jobRoot, "result.zip");

  async function readable(p, label) {
    try {
      await fs.access(p);
      const st = await fs.stat(p);
      if (st.size === 0) errors.push(`${label} is empty: ${p}`);
    } catch {
      errors.push(`missing ${label}: ${p}`);
    }
  }

  await readable(manifestPath, "manifest.json");
  await readable(fullMdPath, "markdown/full.md");
  await readable(resultZip, "result.zip");

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (e) {
    errors.push(`manifest.json unreadable: ${e.message}`);
    return { ok: false, errors, warnings, manifest: null };
  }

  let partFiles = [];
  try {
    partFiles = (await fs.readdir(partsDir)).filter((n) => n.endsWith(".md")).sort();
  } catch {
    errors.push(`missing markdown/parts/: ${partsDir}`);
  }

  if (partFiles.length === 0) {
    errors.push("no markdown parts delivered");
  }

  for (const name of partFiles) {
    if (/[\\/]/.test(name) || name.includes("..")) {
      errors.push(`unsafe part filename: ${name}`);
    }
  }

  const parts = Array.isArray(manifest.parts) ? manifest.parts : [];
  if (parts.length !== partFiles.length) {
    errors.push(
      `manifest.parts length (${parts.length}) != files in parts/ (${partFiles.length})`,
    );
  }

  for (const p of parts) {
    const base = path.basename(p.path || "");
    if (!partFiles.includes(base)) {
      errors.push(`manifest part missing on disk: ${p.path}`);
    }
  }

  // Image refs in full.md that are local should exist if present under images/
  try {
    const fullMd = await fs.readFile(fullMdPath, "utf8");
    const re = /!\[[^\]]*\]\((?!https?:)([^)]+)\)/g;
    let m;
    while ((m = re.exec(fullMd)) !== null) {
      const rel = m[1].split("?")[0].replace(/^\.\//, "");
      if (rel.startsWith("images/")) {
        const imgPath = path.join(outputDir, rel);
        try {
          await fs.access(imgPath);
        } catch {
          warnings.push(`broken image ref: ${rel}`);
        }
      }
    }
  } catch {
    // already reported
  }

  if (manifest.sourceType === "pdf") {
    const missing = manifest.missingRanges || [];
    const segs = manifest.segments || [];
    const failed = segs.filter((s) => s.state === "failed");
    if (manifest.status === "partial") {
      if (missing.length === 0 && failed.length === 0) {
        warnings.push("status is partial but no missingRanges/failed segments recorded");
      }
    }
    if (manifest.status === "succeeded" && (missing.length > 0 || failed.length > 0)) {
      errors.push("status succeeded but missing/failed segments present");
    }
  }

  if (manifest.sourceType === "epub") {
    if (partFiles.length === 0 && !fullMdPath) {
      errors.push("EPUB delivered no markdown");
    }
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, manifest };
}
