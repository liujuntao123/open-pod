import { randomUUID } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function id(): string {
  return randomUUID();
}

export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

export function formatError(err: unknown, max = 800): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = err;

  while (cur != null && !seen.has(cur)) {
    seen.add(cur);

    if (cur instanceof Error) {
      const label =
        cur.name && cur.name !== "Error" && !cur.message.startsWith(cur.name)
          ? `${cur.name}: ${cur.message}`
          : cur.message || cur.name || String(cur);
      if (label) parts.push(label);

      const extra = cur as Error & { code?: unknown; errno?: unknown; syscall?: unknown; address?: unknown; port?: unknown };
      if (typeof extra.code === "string" || typeof extra.code === "number") {
        const code = String(extra.code);
        if (!label.includes(code)) parts.push(`code=${code}`);
      }
      if (typeof extra.syscall === "string") parts.push(`syscall=${extra.syscall}`);
      if (typeof extra.address === "string") {
        const port = extra.port != null ? `:${extra.port}` : "";
        parts.push(`${extra.address}${port}`);
      }

      cur = (cur as Error & { cause?: unknown }).cause;
      continue;
    }

    if (typeof cur === "object") {
      const o = cur as Record<string, unknown>;
      if (typeof o.message === "string" && o.message) parts.push(o.message);
      if (o.code != null && !String(o.message ?? "").includes(String(o.code))) {
        parts.push(`code=${String(o.code)}`);
      }
      cur = o.cause;
      continue;
    }

    parts.push(String(cur));
    break;
  }

  const joined = parts.filter(Boolean).join(" | ");
  if (!joined) return "未知错误";
  return joined.length > max ? `${joined.slice(0, max)}…` : joined;
}

/** Prefer structured message fields from Fish/HTTP JSON error bodies. */
export function formatHttpErrorBody(text: string, max = 600): string {
  const raw = text.trim();
  if (!raw) return "";
  try {
    const j = JSON.parse(raw) as unknown;
    if (typeof j === "string") return j.slice(0, max);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const o = j as Record<string, unknown>;
      const candidates = [o.message, o.detail, o.error, o.msg, o.title];
      for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.trim().slice(0, max);
        if (c && typeof c === "object" && !Array.isArray(c)) {
          const nested = c as Record<string, unknown>;
          for (const key of ["message", "msg", "detail", "title"] as const) {
            const v = nested[key];
            if (typeof v === "string" && v.trim()) return v.trim().slice(0, max);
          }
          const compact = JSON.stringify(c);
          if (compact && compact !== "{}") return compact.slice(0, max);
        }
      }
      const compact = JSON.stringify(o);
      if (compact && compact !== "{}") return compact.slice(0, max);
    }
  } catch {
    /* plain text body */
  }
  return raw.slice(0, max);
}

export function truncateError(err: unknown, max = 800): string {
  return formatError(err, max);
}
