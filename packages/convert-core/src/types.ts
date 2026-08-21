export type SourceType = "pdf" | "epub";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled";

export type JobPhase =
  | "accepted"
  | "counting_pages"
  | "submitting"
  | "extracting"
  | "epub_convert"
  | "stitching"
  | "splitting"
  | "packaging"
  | "done";

export type EpubOutputMode = "split" | "merge" | "both";
export type AssetsMode = "localize" | "none";
export type MineruModelVersion = "pipeline" | "vlm";

export interface PageRange {
  start: number;
  end: number;
}

export interface SegmentResult {
  index: number;
  pageRanges: string;
  start: number;
  end: number;
  state: "pending" | "running" | "done" | "failed" | "cancelled";
  mineruTaskId?: string;
  batchId?: string;
  dataId?: string;
  fullMd?: string;
  errMsg?: string;
  extractedPages?: number;
  totalPages?: number;
}

export interface ManifestPart {
  path: string;
  title: string;
  order: number;
}

export interface AssetStats {
  imageCount: number;
  bytes: number;
  capped: boolean;
}

export interface ConvertManifest {
  jobId: string;
  sourceType: SourceType;
  sourceName: string;
  status: JobStatus;
  outputMode: string;
  createdAt: string;
  finishedAt?: string;
  warnings: string[];
  missingRanges: PageRange[];
  segments: Array<{
    index: number;
    pageRanges: string;
    state: SegmentResult["state"];
    errMsg?: string;
  }>;
  parts: ManifestPart[];
  assetStats: AssetStats;
  splitStrategy?: string;
  pageCount?: number;
  modelVersion?: string;
  isOcr?: boolean;
  language?: string;
}

export interface CreateJobOptions {
  sourceType: SourceType;
  sourceName: string;
  /** EPUB: split | merge | both. PDF ignored for delivery default (always parts). */
  outputMode?: EpubOutputMode;
  isOcr?: boolean;
  modelVersion?: MineruModelVersion;
  language?: string;
  assets?: AssetsMode;
  assetBudgetBytes?: number;
  pageSegmentSize?: number;
  maxPagesPerRequest?: number;
}

export interface ConvertProgress {
  phase: JobPhase;
  message: string;
  percent?: number;
  segmentsDone?: number;
  segmentsTotal?: number;
}

export interface ExternalFetch {
  (url: string, init?: RequestInit): Promise<Response>;
}

export interface ConvertCoreConfig {
  mineruToken?: string;
  proxyEnabled?: boolean;
  proxyUrl?: string;
  assetBudgetBytes?: number;
  pageSegmentSize?: number;
  maxPagesPerRequest?: number;
  jobTimeoutMs?: number;
  pollInitialMs?: number;
  pollMaxMs?: number;
}

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
} as const;

export function detectSourceType(filename: string): SourceType | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".epub")) return "epub";
  return null;
}

export function formatPageRanges(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

export function buildPageSegments(
  totalPages: number,
  maxPerRequest: number = DEFAULTS.maxPagesPerRequest,
): PageRange[] {
  if (totalPages <= 0) return [];
  const ranges: PageRange[] = [];
  for (let start = 1; start <= totalPages; start += maxPerRequest) {
    const end = Math.min(start + maxPerRequest - 1, totalPages);
    ranges.push({ start, end });
  }
  return ranges;
}

export function missingPlaceholder(start: number, end: number): string {
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
