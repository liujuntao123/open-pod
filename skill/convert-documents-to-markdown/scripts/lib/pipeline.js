import fs from "node:fs/promises";
import path from "node:path";
import { convertEpub } from "./epub.js";
import { MineruClient, segmentDataId } from "./mineru.js";
import { countPdfPages } from "./pdf-pages.js";
import { writeOutputTree, zipDirectory } from "./package-zip.js";
import { splitMarkdownByChunks, splitMarkdownByHeadings, toManifestParts, } from "./split-markdown.js";
import { stitchSegments } from "./stitch.js";
import { DEFAULTS, buildPageSegments, formatPageRanges, } from "./types.js";
import { nowIso, truncateError } from "./util.js";
function assertNotCancelled(hooks) {
    if (hooks.isCancelled?.() || hooks.signal?.aborted) {
        const e = new Error("任务已取消");
        e.name = "AbortError";
        throw e;
    }
}
export async function runPdfPipeline(input, hooks = {}) {
    const warnings = [];
    const maxPer = input.options.maxPagesPerRequest ?? DEFAULTS.maxPagesPerRequest;
    const pageSegSize = input.options.pageSegmentSize ?? DEFAULTS.pageSegmentSize;
    const assetBudget = input.options.assetBudgetBytes ?? DEFAULTS.assetBudgetBytes;
    const assetsMode = input.options.assets ?? "localize";
    hooks.onProgress?.({ phase: "counting_pages", message: "正在读取 PDF 页数…" });
    assertNotCancelled(hooks);
    let pageCount = await countPdfPages(input.sourcePath);
    if (pageCount == null) {
        warnings.push("本地无法读取页数，将尝试整本提交");
    }
    const ranges = pageCount != null && pageCount > maxPer
        ? buildPageSegments(pageCount, maxPer)
        : pageCount != null
            ? [{ start: 1, end: pageCount }]
            : [{ start: 1, end: maxPer }]; // placeholder; may fail and surface error
    // For unknown page count, single segment without page_ranges
    const usePageRanges = pageCount != null;
    const segments = ranges.map((r, index) => ({
        index,
        pageRanges: formatPageRanges(r.start, r.end),
        start: r.start,
        end: r.end,
        state: "pending",
    }));
    if (!input.mineruToken) {
        throw new Error("未配置 MinerU Token，无法解析 PDF");
    }
    const client = new MineruClient({
        token: input.mineruToken,
        proxyEnabled: input.proxyEnabled,
        proxyUrl: input.proxyUrl,
    });
    const images = new Map();
    let assetBytes = 0;
    let assetCapped = false;
    for (const seg of segments) {
        assertNotCancelled(hooks);
        seg.state = "running";
        hooks.onProgress?.({
            phase: "extracting",
            message: `解析页段 ${seg.pageRanges}…`,
            segmentsDone: segments.filter((s) => s.state === "done").length,
            segmentsTotal: segments.length,
        });
        const dataId = segmentDataId(input.jobId, seg.index);
        seg.dataId = dataId;
        try {
            const result = await client.extractLocalPdf({
                filePath: input.sourcePath,
                fileName: path.basename(input.sourcePath),
                dataId,
                pageRanges: usePageRanges ? seg.pageRanges : undefined,
                isOcr: input.options.isOcr,
                modelVersion: input.options.modelVersion,
                language: input.options.language ?? "ch",
                signal: hooks.signal,
                onProgress: (info) => {
                    hooks.onProgress?.({
                        phase: "extracting",
                        message: `页段 ${seg.pageRanges}: ${info.state}`,
                        segmentsDone: segments.filter((s) => s.state === "done").length,
                        segmentsTotal: segments.length,
                    });
                },
            });
            seg.fullMd = result.fullMd;
            seg.state = "done";
            if (assetsMode === "localize") {
                for (const [name, buf] of result.images) {
                    if (assetCapped)
                        break;
                    if (assetBytes + buf.length > assetBudget) {
                        assetCapped = true;
                        warnings.push("图片体积超过资产上限，已停止继续收录图片");
                        break;
                    }
                    const key = images.has(name)
                        ? `s${seg.index}_${name}`
                        : name;
                    images.set(key, buf);
                    assetBytes += buf.length;
                }
            }
        }
        catch (err) {
            if (err.name === "AbortError")
                throw err;
            seg.state = "failed";
            seg.errMsg = truncateError(err);
            warnings.push(`页段 ${seg.pageRanges} 失败: ${seg.errMsg}`);
        }
    }
    hooks.onProgress?.({ phase: "stitching", message: "拼接 Markdown…" });
    const stitched = stitchSegments(segments);
    warnings.push(...stitched.warnings);
    hooks.onProgress?.({ phase: "splitting", message: "切分交付分片…" });
    let split = splitMarkdownByHeadings(stitched.fullMd);
    warnings.push(...split.warnings);
    if (split.strategy === "single" && pageCount != null && pageCount > pageSegSize) {
        const chunkCount = Math.ceil(pageCount / pageSegSize);
        split = splitMarkdownByChunks(stitched.fullMd, chunkCount);
        warnings.push(...split.warnings);
    }
    const missing = stitched.missingRanges;
    const anyDone = segments.some((s) => s.state === "done");
    const allDone = segments.every((s) => s.state === "done");
    let status = "failed";
    if (allDone)
        status = "succeeded";
    else if (anyDone)
        status = "partial";
    else
        status = "failed";
    if (!anyDone) {
        throw new Error(segments.map((s) => s.errMsg).filter(Boolean).join("; ") || "PDF 解析失败");
    }
    const outDir = path.join(input.workDir, "output");
    const finishedAt = nowIso();
    const manifest = {
        jobId: input.jobId,
        sourceType: "pdf",
        sourceName: input.options.sourceName,
        status,
        outputMode: "parts",
        createdAt: input.createdAt,
        finishedAt,
        warnings,
        missingRanges: missing,
        segments: segments.map((s) => ({
            index: s.index,
            pageRanges: s.pageRanges,
            state: s.state,
            errMsg: s.errMsg,
        })),
        parts: toManifestParts(split.parts),
        assetStats: {
            imageCount: images.size,
            bytes: assetBytes,
            capped: assetCapped,
        },
        splitStrategy: split.strategy,
        pageCount: pageCount ?? undefined,
        modelVersion: input.options.modelVersion ?? "pipeline",
        isOcr: input.options.isOcr ?? false,
        language: input.options.language ?? "ch",
    };
    hooks.onProgress?.({ phase: "packaging", message: "打包 zip…" });
    await fs.rm(outDir, { recursive: true, force: true });
    await writeOutputTree({
        outDir,
        fullMd: stitched.fullMd,
        parts: split.parts,
        images,
        manifest,
    });
    const zipPath = path.join(input.workDir, "result.zip");
    await zipDirectory(outDir, zipPath);
    hooks.onProgress?.({ phase: "done", message: status === "partial" ? "部分成功" : "完成" });
    return { status, manifest, zipPath, outDir, segments };
}
export async function runEpubPipeline(input, hooks = {}) {
    const warnings = [];
    const mode = input.options.outputMode ?? "split";
    const assetsMode = input.options.assets ?? "localize";
    const assetBudget = input.options.assetBudgetBytes ?? DEFAULTS.assetBudgetBytes;
    hooks.onProgress?.({ phase: "epub_convert", message: "正在转换 EPUB…" });
    assertNotCancelled(hooks);
    const result = await convertEpub({
        sourcePath: input.sourcePath,
        workDir: input.workDir,
        outputMode: mode,
        localize: assetsMode === "localize",
        assetBudgetBytes: assetBudget,
        signal: hooks.signal,
    });
    warnings.push(...result.warnings);
    const outDir = path.join(input.workDir, "output");
    const finishedAt = nowIso();
    const status = "succeeded";
    const manifest = {
        jobId: input.jobId,
        sourceType: "epub",
        sourceName: input.options.sourceName,
        status,
        outputMode: mode,
        createdAt: input.createdAt,
        finishedAt,
        warnings,
        missingRanges: [],
        segments: [],
        parts: result.parts.map((p) => ({
            path: `markdown/parts/${p.filename}`,
            title: p.title,
            order: p.order,
        })),
        assetStats: {
            imageCount: result.images.size,
            bytes: [...result.images.values()].reduce((a, b) => a + b.length, 0),
            capped: warnings.some((w) => w.includes("资产上限")),
        },
        splitStrategy: result.strategy,
    };
    hooks.onProgress?.({ phase: "packaging", message: "打包 zip…" });
    await fs.rm(outDir, { recursive: true, force: true });
    await writeOutputTree({
        outDir,
        fullMd: result.fullMd,
        parts: result.parts,
        images: result.images,
        manifest,
    });
    const zipPath = path.join(input.workDir, "result.zip");
    await zipDirectory(outDir, zipPath);
    hooks.onProgress?.({ phase: "done", message: "完成" });
    return { status, manifest, zipPath, outDir, segments: [] };
}
/**
 * Retry only failed PDF segments; re-stitch, re-split, re-zip.
 */
export async function retryFailedPdfSegments(input, hooks = {}) {
    if (!input.mineruToken)
        throw new Error("未配置 MinerU Token");
    const warnings = [];
    const segments = input.previousSegments.map((s) => ({ ...s }));
    const client = new MineruClient({
        token: input.mineruToken,
        proxyEnabled: input.proxyEnabled,
        proxyUrl: input.proxyUrl,
    });
    const assetsMode = input.options.assets ?? "localize";
    const assetBudget = input.options.assetBudgetBytes ?? DEFAULTS.assetBudgetBytes;
    const images = new Map();
    let assetBytes = 0;
    let assetCapped = false;
    const pageSegSize = input.options.pageSegmentSize ?? DEFAULTS.pageSegmentSize;
    // reload images from previous output if any
    const prevImagesDir = path.join(input.workDir, "output", "images");
    try {
        const names = await fs.readdir(prevImagesDir);
        for (const n of names) {
            const buf = await fs.readFile(path.join(prevImagesDir, n));
            images.set(n, buf);
            assetBytes += buf.length;
        }
    }
    catch {
        // no previous images
    }
    for (const seg of segments) {
        if (seg.state === "done" && seg.fullMd)
            continue;
        assertNotCancelled(hooks);
        seg.state = "running";
        seg.errMsg = undefined;
        hooks.onProgress?.({
            phase: "extracting",
            message: `重试页段 ${seg.pageRanges}…`,
        });
        const dataId = segmentDataId(input.jobId, seg.index);
        seg.dataId = dataId;
        try {
            const result = await client.extractLocalPdf({
                filePath: input.sourcePath,
                fileName: path.basename(input.sourcePath),
                dataId,
                pageRanges: seg.pageRanges,
                isOcr: input.options.isOcr,
                modelVersion: input.options.modelVersion,
                language: input.options.language ?? "ch",
                signal: hooks.signal,
            });
            seg.fullMd = result.fullMd;
            seg.state = "done";
            if (assetsMode === "localize") {
                for (const [name, buf] of result.images) {
                    if (assetCapped)
                        break;
                    if (assetBytes + buf.length > assetBudget) {
                        assetCapped = true;
                        warnings.push("图片体积超过资产上限，已停止继续收录图片");
                        break;
                    }
                    const key = images.has(name) ? `s${seg.index}_${name}` : name;
                    images.set(key, buf);
                    assetBytes += buf.length;
                }
            }
        }
        catch (err) {
            if (err.name === "AbortError")
                throw err;
            seg.state = "failed";
            seg.errMsg = truncateError(err);
            warnings.push(`页段 ${seg.pageRanges} 重试失败: ${seg.errMsg}`);
        }
    }
    // recover fullMd for done segments that lost in-memory content: try output parts? We need fullMd on segment.
    // If previous run stored only zip, segments JSON should persist fullMd in job store (app responsibility).
    hooks.onProgress?.({ phase: "stitching", message: "重新拼接…" });
    const stitched = stitchSegments(segments);
    warnings.push(...stitched.warnings);
    hooks.onProgress?.({ phase: "splitting", message: "重新切分…" });
    let split = splitMarkdownByHeadings(stitched.fullMd);
    warnings.push(...split.warnings);
    const pageCount = await countPdfPages(input.sourcePath);
    if (split.strategy === "single" && pageCount != null && pageCount > pageSegSize) {
        split = splitMarkdownByChunks(stitched.fullMd, Math.ceil(pageCount / pageSegSize));
        warnings.push(...split.warnings);
    }
    const anyDone = segments.some((s) => s.state === "done");
    const allDone = segments.every((s) => s.state === "done");
    if (!anyDone)
        throw new Error("重试后仍无成功页段");
    const status = allDone ? "succeeded" : "partial";
    const outDir = path.join(input.workDir, "output");
    const finishedAt = nowIso();
    const manifest = {
        jobId: input.jobId,
        sourceType: "pdf",
        sourceName: input.options.sourceName,
        status,
        outputMode: "parts",
        createdAt: input.createdAt,
        finishedAt,
        warnings,
        missingRanges: stitched.missingRanges,
        segments: segments.map((s) => ({
            index: s.index,
            pageRanges: s.pageRanges,
            state: s.state,
            errMsg: s.errMsg,
        })),
        parts: toManifestParts(split.parts),
        assetStats: {
            imageCount: images.size,
            bytes: assetBytes,
            capped: assetCapped,
        },
        splitStrategy: split.strategy,
        pageCount: pageCount ?? undefined,
        modelVersion: input.options.modelVersion ?? "pipeline",
        isOcr: input.options.isOcr ?? false,
        language: input.options.language ?? "ch",
    };
    hooks.onProgress?.({ phase: "packaging", message: "重新打包…" });
    await fs.rm(outDir, { recursive: true, force: true });
    await writeOutputTree({
        outDir,
        fullMd: stitched.fullMd,
        parts: split.parts,
        images,
        manifest,
    });
    const zipPath = path.join(input.workDir, "result.zip");
    await zipDirectory(outDir, zipPath);
    hooks.onProgress?.({ phase: "done", message: "完成" });
    return { status, manifest, zipPath, outDir, segments };
}
//# sourceMappingURL=pipeline.js.map