import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { createExternalFetch, sleep } from "./http.js";
import { DEFAULTS, formatPageRanges } from "./types.js";
import { truncateError } from "./util.js";
const BASE = "https://mineru.net";
function authHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "*/*",
    };
}
export class MineruClient {
    token;
    fetch;
    pollInitialMs;
    pollMaxMs;
    constructor(opts) {
        this.token = opts.token;
        this.fetch =
            opts.fetch ??
                createExternalFetch({
                    enabled: opts.proxyEnabled ?? false,
                    url: opts.proxyUrl,
                });
        this.pollInitialMs = opts.pollInitialMs ?? DEFAULTS.pollInitialMs;
        this.pollMaxMs = opts.pollMaxMs ?? DEFAULTS.pollMaxMs;
    }
    /**
     * Local file upload path: apply upload URLs → PUT file → poll batch results.
     * One logical segment at a time for simpler mapping (still respects batch API).
     */
    async extractLocalPdf(params) {
        const model_version = params.modelVersion ?? "pipeline";
        const body = {
            files: [
                {
                    name: params.fileName,
                    data_id: params.dataId,
                    ...(params.pageRanges ? { page_ranges: params.pageRanges } : {}),
                    ...(params.isOcr ? { is_ocr: true } : {}),
                },
            ],
            model_version,
            ...(params.language ? { language: params.language } : {}),
            enable_formula: true,
            enable_table: true,
        };
        const applyRes = await this.fetch(`${BASE}/api/v4/file-urls/batch`, {
            method: "POST",
            headers: authHeaders(this.token),
            body: JSON.stringify(body),
            signal: params.signal,
        });
        const applyJson = (await applyRes.json());
        if (!applyRes.ok || applyJson.code !== 0 || !applyJson.data?.batch_id) {
            throw new Error(`MinerU 申请上传失败: ${applyJson.msg || applyRes.status} (${JSON.stringify(applyJson).slice(0, 300)})`);
        }
        const batchId = applyJson.data.batch_id;
        const uploadUrl = applyJson.data.file_urls?.[0];
        if (!uploadUrl)
            throw new Error("MinerU 未返回上传 URL");
        const fileBuf = await fs.readFile(params.filePath);
        const putRes = await this.fetch(uploadUrl, {
            method: "PUT",
            body: fileBuf,
            signal: params.signal,
            // no Content-Type per docs
            headers: {},
        });
        if (!putRes.ok) {
            throw new Error(`MinerU 文件上传失败: HTTP ${putRes.status}`);
        }
        const item = await this.pollBatchItem({
            batchId,
            dataId: params.dataId,
            signal: params.signal,
            onProgress: params.onProgress,
        });
        if (item.state === "failed") {
            throw new Error(item.err_msg || "MinerU 解析失败");
        }
        if (!item.full_zip_url) {
            throw new Error("MinerU 完成但未返回结果包");
        }
        return this.downloadAndExtractZip(item.full_zip_url, params.signal);
    }
    async pollBatchItem(params) {
        let delay = this.pollInitialMs;
        for (;;) {
            if (params.signal?.aborted) {
                const e = new Error("请求已取消");
                e.name = "AbortError";
                throw e;
            }
            const res = await this.fetch(`${BASE}/api/v4/extract-results/batch/${params.batchId}`, {
                method: "GET",
                headers: authHeaders(this.token),
                signal: params.signal,
            });
            const json = (await res.json());
            if (!res.ok || json.code !== 0) {
                throw new Error(`MinerU 查询失败: ${json.msg || res.status}`);
            }
            const list = json.data?.extract_result ?? [];
            const item = list.find((x) => x.data_id === params.dataId) ??
                list[0];
            if (!item) {
                await sleep(delay, params.signal);
                delay = Math.min(delay + 3000, this.pollMaxMs);
                continue;
            }
            params.onProgress?.({
                state: item.state,
                extractedPages: item.extract_progress?.extracted_pages,
                totalPages: item.extract_progress?.total_pages,
            });
            if (item.state === "done" ||
                item.state === "failed") {
                return item;
            }
            // waiting-file | pending | running | converting
            await sleep(delay, params.signal);
            delay = Math.min(Math.floor(delay * 1.5), this.pollMaxMs);
        }
    }
    async downloadAndExtractZip(zipUrl, signal) {
        const res = await this.fetch(zipUrl, { method: "GET", signal });
        if (!res.ok)
            throw new Error(`下载 MinerU 结果失败: HTTP ${res.status}`);
        const ab = await res.arrayBuffer();
        const zip = await JSZip.loadAsync(ab);
        let fullMd = "";
        const images = new Map();
        const names = Object.keys(zip.files);
        const mdName = names.find((n) => n === "full.md" || n.endsWith("/full.md")) ??
            names.find((n) => n.endsWith(".md"));
        if (!mdName)
            throw new Error("结果包中未找到 full.md");
        fullMd = await zip.files[mdName].async("string");
        for (const name of names) {
            const f = zip.files[name];
            if (f.dir)
                continue;
            const base = path.posix.basename(name);
            const lower = name.toLowerCase();
            if (lower.includes("image") ||
                /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(base)) {
                const buf = Buffer.from(await f.async("uint8array"));
                images.set(base, buf);
            }
        }
        // rewrite image paths to images/<basename>
        fullMd = fullMd.replace(/!\[([^\]]*)\]\((?!https?:)([^)]+)\)/g, (_m, alt, p) => {
            const base = path.posix.basename(String(p).split("?")[0]);
            return `![${alt}](images/${base})`;
        });
        return { fullMd, zipUrl, images };
    }
}
export function segmentDataId(jobId, index) {
    // [A-Za-z0-9_.-] max 128
    return `job_${jobId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}_s${index}`;
}
export function describeMineruError(err) {
    return truncateError(err);
}
export { formatPageRanges };
//# sourceMappingURL=mineru.js.map