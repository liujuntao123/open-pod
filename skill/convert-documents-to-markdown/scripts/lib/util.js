import { randomUUID } from "node:crypto";
import path from "node:path";
export function id() {
    return randomUUID();
}
export function nowIso() {
    return new Date().toISOString();
}
export function safeFilename(name, max = 80) {
    const base = path.basename(name);
    return base.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, max) || "file";
}
export function slugTitle(title, max = 40) {
    const s = title
        .trim()
        .replace(/[#*_`[\](){}]/g, "")
        .replace(/\s+/g, "-")
        .replace(/[^\w\u4e00-\u9fff.-]+/g, "")
        .slice(0, max);
    return s || "part";
}
export function truncateError(err, max = 500) {
    if (err instanceof Error) {
        const parts = [err.message];
        let c = err.cause;
        let depth = 0;
        while (c instanceof Error && depth < 3) {
            parts.push(c.message);
            c = c.cause;
            depth++;
        }
        return parts.join(" | ").slice(0, max);
    }
    return String(err).slice(0, max);
}
//# sourceMappingURL=util.js.map