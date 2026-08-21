export interface ImportedLine {
  characterName: string;
  text: string;
}

/**
 * v1: only full-width colon `：` is a role separator.
 * Lines without prefix become character「旁白」(ordinary character name).
 */
export function parseScriptImport(source: string): ImportedLine[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ImportedLine[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const idx = line.indexOf("：");
    if (idx <= 0) {
      out.push({ characterName: "旁白", text: line });
      continue;
    }

    const characterName = line.slice(0, idx).trim();
    const text = line.slice(idx + 1).trim();
    if (!characterName || !text) {
      out.push({ characterName: "旁白", text: line });
      continue;
    }

    // Treat narrator/旁白 as ordinary display names (same character resolution path).
    const normalized =
      characterName.toLowerCase() === "narrator" ? "旁白" : characterName;
    out.push({
      characterName: normalized,
      text,
    });
  }

  return out;
}

/**
 * Serialize structured lines back to step-1 draft text (inverse of parseScriptImport).
 * Always uses full-width colon so re-import is stable.
 */
export function formatScriptDraft(lines: ImportedLine[]): string {
  return lines
    .map((line) => {
      const name = line.characterName.trim() || "旁白";
      // One physical line per dialogue so parseScriptImport round-trips cleanly.
      const text = line.text.replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
      return `${name}：${text}`;
    })
    .join("\n");
}
