import { FISH_DEFAULT_BASE_URL } from "@open-pod/shared";
import { externalFetch } from "../http.js";
import { formatHttpErrorBody } from "../util.js";

export interface FishRemoteModel {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  languages: string[];
  tags: string[];
  authorName: string;
  authorId: string;
  likeCount: number;
  taskCount: number;
  liked: boolean;
  marked: boolean;
  /** Official sample audio URL when available. */
  previewUrl: string | null;
  defaultText: string;
}

export type FishModelSortBy = "score" | "task_count" | "created_at";

export interface FishModelListResult {
  total: number;
  pageNumber: number;
  pageSize: number;
  hasMore: boolean;
  items: FishRemoteModel[];
}

function firstSampleAudio(samples: unknown): string | null {
  if (!Array.isArray(samples)) return null;
  for (const s of samples) {
    if (!s || typeof s !== "object") continue;
    const audio = (s as Record<string, unknown>).audio;
    if (typeof audio === "string" && audio.startsWith("http")) return audio;
  }
  return null;
}

function mapFishModel(item: Record<string, unknown>): FishRemoteModel | null {
  const id = String(item._id ?? item.id ?? "");
  if (!id) return null;
  const author = (item.author ?? {}) as Record<string, unknown>;
  return {
    id,
    title: String(item.title ?? "未命名音色"),
    description: String(item.description ?? ""),
    coverImage: String(item.cover_image ?? ""),
    languages: Array.isArray(item.languages) ? item.languages.map(String) : [],
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    authorName: String(author.nickname ?? ""),
    authorId: String(author._id ?? ""),
    likeCount: Number(item.like_count ?? 0),
    taskCount: Number(item.task_count ?? 0),
    liked: Boolean(item.liked),
    marked: Boolean(item.marked),
    previewUrl: firstSampleAudio(item.samples),
    defaultText: String(item.default_text ?? ""),
  };
}

/**
 * Official Fish voice library:
 * GET https://api.fish.audio/model
 * Favorites are official read-only flags (`liked` / `marked`). No public write API.
 */
export async function listFishModels(input: {
  baseUrl: string;
  apiKey: string;
  pageNumber?: number;
  pageSize?: number;
  title?: string;
  self?: boolean;
  language?: string;
  titleLanguage?: string;
  sortBy?: FishModelSortBy;
  /** Client-side filter after fetch for official liked/marked favorites. */
  onlyOfficialFavorite?: boolean;
  signal?: AbortSignal;
}): Promise<FishModelListResult> {
  const base = (input.baseUrl || FISH_DEFAULT_BASE_URL).replace(/\/$/, "");
  const pageNumber = Math.max(1, input.pageNumber ?? 1);
  // When filtering favorites client-side, pull a larger page then slice.
  const requestedSize = Math.min(50, Math.max(1, input.pageSize ?? 24));
  const fetchSize = input.onlyOfficialFavorite ? 50 : requestedSize;
  const fetchPage = input.onlyOfficialFavorite ? 1 : pageNumber;

  const qs = new URLSearchParams({
    page_number: String(fetchPage),
    page_size: String(fetchSize),
  });
  if (input.title?.trim()) qs.set("title", input.title.trim());
  if (input.self) qs.set("self", "true");
  if (input.language?.trim()) qs.set("language", input.language.trim());
  if (input.titleLanguage?.trim()) qs.set("title_language", input.titleLanguage.trim());
  if (input.sortBy) qs.set("sort_by", input.sortBy);

  const res = await externalFetch(`${base}/model?${qs}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = formatHttpErrorBody(text);
    throw new Error(
      detail ? `Fish 音色列表 ${res.status}: ${detail}` : `Fish 音色列表 ${res.status}: (empty body)`,
    );
  }

  const data = (await res.json()) as {
    total?: number;
    has_more?: boolean;
    items?: Array<Record<string, unknown>>;
  };

  let items = (data.items ?? [])
    .map((item) => mapFishModel(item))
    .filter((m): m is FishRemoteModel => Boolean(m));

  if (input.onlyOfficialFavorite) {
    const all = items.filter((m) => m.liked || m.marked);
    const start = (pageNumber - 1) * requestedSize;
    const pageItems = all.slice(start, start + requestedSize);
    return {
      total: all.length,
      pageNumber,
      pageSize: requestedSize,
      hasMore: start + requestedSize < all.length,
      items: pageItems,
    };
  }

  const total = Number(data.total ?? items.length);
  const hasMore =
    typeof data.has_more === "boolean"
      ? data.has_more || pageNumber * requestedSize < total
      : pageNumber * requestedSize < total || items.length >= requestedSize;

  return {
    total,
    pageNumber,
    pageSize: requestedSize,
    hasMore,
    items,
  };
}

export async function previewFishModel(input: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  signal?: AbortSignal;
}): Promise<{ previewUrl: string | null; defaultText: string; synthesized?: boolean }> {
  const base = (input.baseUrl || FISH_DEFAULT_BASE_URL).replace(/\/$/, "");
  const res = await externalFetch(`${base}/model/${encodeURIComponent(input.modelId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.apiKey}` },
    signal: input.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = formatHttpErrorBody(text);
    throw new Error(
      detail ? `Fish 音色详情 ${res.status}: ${detail}` : `Fish 音色详情 ${res.status}: (empty body)`,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  const mapped = mapFishModel(data);
  if (!mapped) throw new Error("Fish 音色详情无效");
  if (mapped.previewUrl) {
    return { previewUrl: mapped.previewUrl, defaultText: mapped.defaultText, synthesized: false };
  }
  return { previewUrl: null, defaultText: mapped.defaultText || "你好，这是一段音色试听。", synthesized: false };
}
