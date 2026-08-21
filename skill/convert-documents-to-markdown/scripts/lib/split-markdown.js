import { slugTitle } from "./util.js";
function findHeadings(md, levels) {
    const hits = [];
    const re = /^(#{1,2})\s+(.+?)\s*$/gm;
    let m;
    while ((m = re.exec(md)) !== null) {
        const level = m[1].length;
        if (!levels.includes(level))
            continue;
        const title = m[2].replace(/#+\s*$/, "").trim();
        if (!title)
            continue;
        // skip missing-placeholder headings from becoming parts anchors preference is fine
        hits.push({
            level,
            title,
            index: m.index,
            endLineIndex: m.index + m[0].length,
        });
    }
    return hits;
}
function cutByHeadings(md, hits) {
    if (hits.length === 0)
        return [];
    const parts = [];
    // preamble before first heading
    if (hits[0].index > 0) {
        const preamble = md.slice(0, hits[0].index).trim();
        if (preamble) {
            parts.push({
                filename: "",
                title: "前言",
                content: preamble + "\n",
                order: 0,
            });
        }
    }
    for (let i = 0; i < hits.length; i++) {
        const start = hits[i].index;
        const end = i + 1 < hits.length ? hits[i + 1].index : md.length;
        const content = md.slice(start, end).trim() + "\n";
        parts.push({
            filename: "",
            title: hits[i].title,
            content,
            order: 0,
        });
    }
    // assign order + filenames
    const used = new Map();
    return parts.map((p, idx) => {
        const order = idx + 1;
        let slug = slugTitle(p.title);
        const n = (used.get(slug) ?? 0) + 1;
        used.set(slug, n);
        if (n > 1)
            slug = `${slug}-${n}`;
        const filename = `${String(order).padStart(3, "0")}-${slug}.md`;
        return { ...p, order, filename };
    });
}
/**
 * A3: prefer `#`; if fewer than 3 body parts from `#`, fall back to `#`+`##`.
 * Returns single full part when still insufficient structure.
 */
export function splitMarkdownByHeadings(md) {
    const warnings = [];
    const h1 = findHeadings(md, [1]);
    let parts = cutByHeadings(md, h1);
    let strategy = "h1";
    // "body parts" = parts that are not only preamble; require >=3 heading-based cuts
    const headingParts = parts.filter((p) => p.title !== "前言" || parts.length === 1);
    if (h1.length < 3 || headingParts.length < 3) {
        const h12 = findHeadings(md, [1, 2]);
        const alt = cutByHeadings(md, h12);
        if (h12.length >= 3 && alt.length >= 3) {
            parts = alt;
            strategy = "h1+h2";
            warnings.push("一级标题过少，已降级使用一/二级标题切分");
        }
    }
    if (parts.length < 2) {
        warnings.push("标题结构不足以切分，将整份保留为单文件");
        return {
            parts: [
                {
                    filename: "001-full.md",
                    title: "全文",
                    content: md.endsWith("\n") ? md : md + "\n",
                    order: 1,
                },
            ],
            strategy: "single",
            warnings,
        };
    }
    return { parts, strategy, warnings };
}
/** Fallback: split full markdown into N roughly equal chunks by character budget. */
export function splitMarkdownByChunks(md, chunkCount) {
    const warnings = ["标题切分失败，已按页段/块回退分片"];
    if (chunkCount <= 1 || md.length < 500) {
        return {
            parts: [
                {
                    filename: "001-full.md",
                    title: "全文",
                    content: md.endsWith("\n") ? md : md + "\n",
                    order: 1,
                },
            ],
            strategy: "single",
            warnings: ["无法分片，交付整份 full.md"],
        };
    }
    const size = Math.ceil(md.length / chunkCount);
    const parts = [];
    for (let i = 0; i < chunkCount; i++) {
        const start = i * size;
        if (start >= md.length)
            break;
        let end = Math.min(start + size, md.length);
        // try break at newline
        if (end < md.length) {
            const nl = md.indexOf("\n", end);
            if (nl !== -1 && nl - end < 400)
                end = nl + 1;
        }
        const order = parts.length + 1;
        const content = md.slice(start, end);
        parts.push({
            filename: `${String(order).padStart(3, "0")}-part.md`,
            title: `分片 ${order}`,
            content: content.endsWith("\n") ? content : content + "\n",
            order,
        });
    }
    return { parts, strategy: "chunk", warnings };
}
export function toManifestParts(parts) {
    return parts.map((p) => ({
        path: `markdown/parts/${p.filename}`,
        title: p.title,
        order: p.order,
    }));
}
//# sourceMappingURL=split-markdown.js.map