export const DEFAULTS = {
    assetBudgetBytes: 500 * 1024 * 1024,
    pageSegmentSize: 20,
    maxPagesPerRequest: 200,
    jobTimeoutMs: 30 * 60 * 1000,
    pollInitialMs: 2000,
    pollMaxMs: 15000,
    retentionDays: 7,
    host: "127.0.0.1",
    port: 8790,
    maxUploadBatch: 50,
};
export function detectSourceType(filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".pdf"))
        return "pdf";
    if (lower.endsWith(".epub"))
        return "epub";
    return null;
}
export function formatPageRanges(start, end) {
    return start === end ? `${start}` : `${start}-${end}`;
}
export function buildPageSegments(totalPages, maxPerRequest = DEFAULTS.maxPagesPerRequest) {
    if (totalPages <= 0)
        return [];
    const ranges = [];
    for (let start = 1; start <= totalPages; start += maxPerRequest) {
        const end = Math.min(start + maxPerRequest - 1, totalPages);
        ranges.push({ start, end });
    }
    return ranges;
}
export function missingPlaceholder(start, end) {
    const label = start === end ? `第 ${start} 页` : `第 ${start}-${end} 页`;
    return [
        ``,
        `<!-- missing pages ${start}-${end} -->`,
        ``,
        `## ⚠️ 缺失页段占位（${label}）`,
        ``,
        `该页段解析失败或尚未完成，已用占位标记。可在转换任务中重试失败页段。`,
        ``,
    ].join("\n");
}
//# sourceMappingURL=types.js.map