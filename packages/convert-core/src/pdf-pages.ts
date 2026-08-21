import fs from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

/** Returns page count, or null if the PDF cannot be parsed. */
export async function countPdfPages(filePath: string): Promise<number | null> {
  try {
    const bytes = await fs.readFile(filePath);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const n = doc.getPageCount();
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
