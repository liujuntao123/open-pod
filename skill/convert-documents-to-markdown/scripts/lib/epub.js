import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { safeFilename, truncateError } from "./util.js";
const require = createRequire(import.meta.url);
function resolveEpub2mdBin() {
    try {
        const main = require.resolve("epub2md");
        let dir = path.dirname(main);
        for (let i = 0; i < 8; i++) {
            const cli = path.join(dir, "lib/bin/cli.cjs");
            try {
                require("node:fs").accessSync(cli);
                return cli;
            }
            catch {
                // continue
            }
            const parent = path.dirname(dir);
            if (parent === dir)
                break;
            dir = parent;
        }
        return main;
    }
    catch {
        return "epub2md";
    }
}
function runCmd(cmd, args, cwd, signal) {
    const { promise, resolve, reject } = Promise.withResolvers();
    if (signal?.aborted) {
        const e = new Error("请求已取消");
        e.name = "AbortError";
        reject(e);
        return promise;
    }
    const child = spawn(cmd, args, {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
        stdout += String(d);
    });
    child.stderr.on("data", (d) => {
        stderr += String(d);
    });
    const onAbort = () => {
        child.kill("SIGTERM");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (err) => {
        signal?.removeEventListener("abort", onAbort);
        reject(err);
    });
    child.on("close", (code) => {
        signal?.removeEventListener("abort", onAbort);
        resolve({ stdout, stderr, code: code ?? 1 });
    });
    return promise;
}
async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
async function collectMarkdownFiles(dir) {
    if (!(await pathExists(dir)))
        return [];
    const out = [];
    async function walk(d) {
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory())
                await walk(p);
            else if (e.name.toLowerCase().endsWith(".md"))
                out.push(p);
        }
    }
    await walk(dir);
    return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
async function collectImages(root, budgetBytes) {
    const images = new Map();
    let bytes = 0;
    let capped = false;
    const warnings = [];
    async function walk(d) {
        if (!(await pathExists(d)))
            return;
        const entries = await fs.readdir(d, { withFileTypes: true });
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
                await walk(p);
                continue;
            }
            if (!/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(e.name))
                continue;
            if (capped)
                continue;
            const buf = await fs.readFile(p);
            if (bytes + buf.length > budgetBytes) {
                capped = true;
                warnings.push("图片体积超过资产上限，已停止继续收录图片");
                continue;
            }
            // unique basename
            let name = e.name;
            if (images.has(name)) {
                name = `${path.basename(e.name, path.extname(e.name))}_${images.size}${path.extname(e.name)}`;
            }
            images.set(name, buf);
            bytes += buf.length;
        }
    }
    await walk(root);
    return { images, bytes, capped, warnings };
}
/**
 * Convert EPUB using local epub2md package binary.
 * Always stages a safe basename to avoid glob-like filename quirks.
 */
export async function convertEpub(params) {
    const warnings = [];
    const bin = resolveEpub2mdBin();
    const stageDir = path.join(params.workDir, "epub-stage");
    const outDir = path.join(params.workDir, "epub-out");
    await fs.mkdir(stageDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });
    const staged = path.join(stageDir, "book.epub");
    await fs.copyFile(params.sourcePath, staged);
    const argsBase = ["book.epub"];
    if (params.localize)
        argsBase.unshift("--localize");
    const mode = params.outputMode;
    const runModes = mode === "both" ? ["split", "merge"] : mode === "merge" ? ["merge"] : ["split"];
    for (const m of runModes) {
        const cwd = stageDir;
        const args = m === "merge"
            ? [...(params.localize ? ["--localize"] : []), `--merge=book-merged.md`, "book.epub"]
            : [...(params.localize ? ["--localize"] : []), "book.epub"];
        // epub2md writes next to cwd into book/ for some modes; run from stageDir
        const cmd = bin.endsWith(".cjs") || bin.endsWith(".js") ? process.execPath : bin;
        const cmdArgs = bin.endsWith(".cjs") || bin.endsWith(".js") ? [bin, ...args] : args;
        const result = await runCmd(cmd, cmdArgs, cwd, params.signal);
        if (result.code !== 0) {
            throw new Error(`epub2md ${m} 失败 (code ${result.code}): ${result.stderr || result.stdout}`.slice(0, 800));
        }
    }
    let fullMd = "";
    const parts = [];
    // Prefer merge file if present
    const mergeCandidates = [
        path.join(stageDir, "book", "book-merged.md"),
        path.join(stageDir, "book-merged.md"),
        path.join(stageDir, "book", "book.md"),
    ];
    for (const p of mergeCandidates) {
        if (await pathExists(p)) {
            fullMd = await fs.readFile(p, "utf8");
            break;
        }
    }
    // Chapter files: any numbered md under book/
    const bookDir = path.join(stageDir, "book");
    const mdFiles = await collectMarkdownFiles(bookDir);
    const chapterFiles = mdFiles.filter((f) => {
        const base = path.basename(f).toLowerCase();
        return base !== "book-merged.md" && !base.endsWith("-merged.md");
    });
    if (chapterFiles.length > 0 && (mode === "split" || mode === "both")) {
        let order = 0;
        for (const f of chapterFiles) {
            order += 1;
            const content = await fs.readFile(f, "utf8");
            const base = path.basename(f);
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch?.[1]?.trim() || base.replace(/\.md$/i, "");
            const filename = /^\d{3}-/.test(base)
                ? safeFilename(base)
                : `${String(order).padStart(3, "0")}-${safeFilename(base)}`;
            parts.push({ filename, title, content, order });
            if (!fullMd) {
                // accumulate for full if no merge
            }
        }
        if (!fullMd) {
            fullMd = parts.map((p) => p.content.trimEnd()).join("\n\n") + "\n";
        }
    }
    if (!fullMd) {
        // last resort: any md
        if (mdFiles[0]) {
            fullMd = await fs.readFile(mdFiles[0], "utf8");
        }
        else {
            throw new Error("epub2md 未产出 Markdown 文件");
        }
    }
    if (parts.length === 0) {
        // deliver full as single part when split requested but only merge exists
        parts.push({
            filename: "001-full.md",
            title: "全文",
            content: fullMd.endsWith("\n") ? fullMd : fullMd + "\n",
            order: 1,
        });
        if (mode === "split") {
            warnings.push("未得到多章节文件，已将 merge/全文作为单分片交付");
        }
    }
    const imgRoot = (await pathExists(bookDir)) ? bookDir : stageDir;
    const { images, capped, warnings: imgWarn } = await collectImages(imgRoot, params.assetBudgetBytes);
    warnings.push(...imgWarn);
    if (capped) {
        // already warned
    }
    // rewrite relative image paths in md to images/
    const rewrite = (md) => md.replace(/!\[([^\]]*)\]\((?!https?:)([^)]+)\)/g, (_m, alt, p) => {
        const base = path.posix.basename(String(p).split("?")[0]);
        return `![${alt}](images/${base})`;
    });
    fullMd = rewrite(fullMd);
    for (const p of parts)
        p.content = rewrite(p.content);
    return {
        fullMd,
        parts,
        images,
        warnings,
        strategy: mode === "merge" ? "epub-merge" : mode === "both" ? "epub-both" : "epub-split",
    };
}
// silence unused import in some bundlers
void fileURLToPath;
void truncateError;
//# sourceMappingURL=epub.js.map