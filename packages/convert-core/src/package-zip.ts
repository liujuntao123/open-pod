import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { ConvertManifest } from "./types.js";

export async function writeOutputTree(params: {
  outDir: string;
  fullMd: string;
  parts: Array<{ filename: string; content: string }>;
  images: Map<string, Buffer>;
  manifest: ConvertManifest;
}): Promise<void> {
  const mdDir = path.join(params.outDir, "markdown");
  const partsDir = path.join(mdDir, "parts");
  const imagesDir = path.join(params.outDir, "images");
  await fs.mkdir(partsDir, { recursive: true });
  await fs.mkdir(imagesDir, { recursive: true });

  await fs.writeFile(path.join(mdDir, "full.md"), params.fullMd, "utf8");
  for (const p of params.parts) {
    await fs.writeFile(path.join(partsDir, p.filename), p.content, "utf8");
  }
  for (const [name, buf] of params.images) {
    await fs.writeFile(path.join(imagesDir, name), buf);
  }
  await fs.writeFile(
    path.join(params.outDir, "manifest.json"),
    JSON.stringify(params.manifest, null, 2),
    "utf8",
  );
}

export async function zipDirectory(dir: string, zipPath: string): Promise<void> {
  const zip = new JSZip();

  async function addDir(current: string, prefix: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(current, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await addDir(abs, rel);
      else {
        const data = await fs.readFile(abs);
        zip.file(rel.replace(/\\/g, "/"), data);
      }
    }
  }

  await addDir(dir, "");
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  await fs.writeFile(zipPath, buf);
}
