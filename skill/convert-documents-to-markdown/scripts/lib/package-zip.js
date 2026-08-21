import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
export async function writeOutputTree(params) {
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
    await fs.writeFile(path.join(params.outDir, "manifest.json"), JSON.stringify(params.manifest, null, 2), "utf8");
}
export async function zipDirectory(dir, zipPath) {
    const zip = new JSZip();
    async function addDir(current, prefix) {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const e of entries) {
            const abs = path.join(current, e.name);
            const rel = prefix ? `${prefix}/${e.name}` : e.name;
            if (e.isDirectory())
                await addDir(abs, rel);
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
//# sourceMappingURL=package-zip.js.map