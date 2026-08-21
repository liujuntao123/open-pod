import { randomUUID } from "node:crypto";
import path from "node:path";

export function id(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function safeFilename(name: string, max = 80): string {
  const base = path.basename(name);
  return base.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, max) || "file";
}

export function slugTitle(title: string, max = 40): string {
  const s = title
    .trim()
    .replace(/[#*_`[\](){}]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fff.-]+/g, "")
    .slice(0, max);
  return s || "part";
}

export function truncateError(err: unknown, max = 500): string {
  if (err instanceof Error) {
    const parts = [err.message];
    let c: unknown = err.cause;
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
