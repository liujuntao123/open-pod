import { missingPlaceholder } from "./types.js";
/**
 * Concatenate successful segment markdown in page order; insert placeholders for gaps.
 */
export function stitchSegments(segments) {
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const warnings = [];
    const missingRanges = [];
    const chunks = [];
    for (const seg of sorted) {
        if (seg.state === "done" && seg.fullMd && seg.fullMd.trim()) {
            chunks.push(seg.fullMd.trimEnd() + "\n");
        }
        else {
            missingRanges.push({ start: seg.start, end: seg.end });
            chunks.push(missingPlaceholder(seg.start, seg.end));
            warnings.push(`解析页段 ${seg.start}-${seg.end} 缺失：${seg.errMsg || seg.state}`);
        }
    }
    return {
        fullMd: chunks.join("\n"),
        missingRanges,
        warnings,
    };
}
//# sourceMappingURL=stitch.js.map