import type {
  ChapterDto,
  JobDto,
  LineDto,
  PresetTrackDto,
  VoiceDto,
  WorkCharacterDto,
  WorkDto,
} from "@open-pod/shared";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type FishStatus = {
  provider: "fish";
  name: string;
  baseUrl: string;
  defaultBaseUrl: string;
  isCustomBaseUrl: boolean;
  hasApiKey: boolean;
};

export type MimoStatus = {
  provider: "mimo";
  name: string;
  baseUrl: string;
  defaultBaseUrl: string;
  isCustomBaseUrl: boolean;
  hasApiKey: boolean;
};

export type MimoPreset = {
  id: string;
  name: string;
  language: string;
  gender: string;
};

export type ScriptLlmStatus = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
};

export type FishRemoteModel = {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  languages: string[];
  tags: string[];
  authorName: string;
  authorId?: string;
  likeCount: number;
  taskCount: number;
  liked: boolean;
  marked: boolean;
  previewUrl: string | null;
  defaultText?: string;
};

export type FishModelListResult = {
  total: number;
  pageNumber: number;
  pageSize: number;
  hasMore: boolean;
  items: FishRemoteModel[];
};

export type GenerateScriptResult = {
  chapter: ChapterDto;
  script: string;
  previewCount: number;
};

/**
 * Stream script generation via SSE (`delta` / `done` / `error` events).
 * Falls back to JSON if the server responds with application/json.
 */
async function streamGenerateScript(
  chapterId: string,
  body: { instruction?: string; sourceText?: string },
  handlers?: {
    onDelta?: (delta: string) => void;
    signal?: AbortSignal;
  },
): Promise<GenerateScriptResult> {
  const res = await fetch(`/api/chapters/${chapterId}/generate-script`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify(body),
    signal: handlers?.signal,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) message = errBody.error;
    } catch {
      try {
        const text = await res.text();
        if (text.trim()) message = text.trim();
      } catch {
        /* ignore */
      }
    }
    throw new Error(message);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as GenerateScriptResult;
  }

  if (!res.body) {
    throw new Error("服务器未返回流式响应");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateScriptResult | null = null;
  let streamError: string | null = null;
  let currentEvent = "";

  const handleBlock = (block: string) => {
    const lines = block.split("\n");
    let event = currentEvent;
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        // Keep trailing spaces; only strip the optional single space after "data:".
        const raw = line.slice(5);
        dataLines.push(raw.startsWith(" ") ? raw.slice(1) : raw);
      }
    }
    currentEvent = "";
    if (!dataLines.length) return;
    const data = dataLines.join("\n");

    if (event === "delta") {
      handlers?.onDelta?.(data);
      return;
    }
    if (event === "done") {
      result = JSON.parse(data) as GenerateScriptResult;
      return;
    }
    if (event === "error") {
      streamError = data;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        if (block.trim()) handleBlock(block);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) handleBlock(buffer);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("剧本生成未完成");
  return result;
}

export const api = {
  listWorks: () => request<WorkDto[]>("/api/works"),
  getWork: (id: string) => request<WorkDto>(`/api/works/${id}`),
  createWork: (title?: string, provider?: "fish" | "mimo") =>
    request<WorkDto>("/api/works", {
      method: "POST",
      body: JSON.stringify({ title, provider }),
    }),
  updateWork: (id: string, patch: { title?: string; provider?: "fish" | "mimo" }) =>
    request<WorkDto>(`/api/works/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteWork: (id: string) => request<{ ok: true }>(`/api/works/${id}`, { method: "DELETE" }),

  listChapters: (workId: string) => request<ChapterDto[]>(`/api/works/${workId}/chapters`),
  createChapter: (
    workId: string,
    opts?: {
      title?: string;
      scriptDraft?: string;
      scriptInstruction?: string;
      scriptSourceText?: string;
    },
  ) =>
    request<ChapterDto>(`/api/works/${workId}/chapters`, {
      method: "POST",
      body: JSON.stringify(opts ?? {}),
    }),
  updateChapter: (
    id: string,
    patch: {
      title?: string;
      position?: number;
      scriptDraft?: string;
      scriptInstruction?: string;
      scriptSourceText?: string;
      bgmPresetId?: string | null;
      bgmVolume?: number;
      bgmIntroSeconds?: number;
    },
  ) =>
    request<ChapterDto>(`/api/chapters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteChapter: (id: string) =>
    request<{ ok: true }>(`/api/chapters/${id}`, { method: "DELETE" }),

  listBgmPresets: () => request<PresetTrackDto[]>("/api/bgm-presets"),


  listCharacters: (workId: string) =>
    request<WorkCharacterDto[]>(`/api/works/${workId}/characters`),
  createCharacter: (workId: string, name: string, voiceId?: string | null) =>
    request<WorkCharacterDto>(`/api/works/${workId}/characters`, {
      method: "POST",
      body: JSON.stringify({ name, voiceId }),
    }),
  updateCharacter: (
    id: string,
    patch: { name?: string; voiceId?: string | null; paramOverride?: Record<string, unknown> },
  ) =>
    request<WorkCharacterDto>(`/api/characters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteCharacter: (id: string) =>
    request<{ ok: true }>(`/api/characters/${id}`, { method: "DELETE" }),


  listLines: (chapterId: string) => request<LineDto[]>(`/api/chapters/${chapterId}/lines`),
  createLine: (
    chapterId: string,
    body: { text?: string; workCharacterId?: string; afterPosition?: number },
  ) =>
    request<LineDto>(`/api/chapters/${chapterId}/lines`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateLine: (
    id: string,
    patch: {
      text?: string;
      workCharacterId?: string;
      paramOverride?: Record<string, unknown>;
      position?: number;
    },
  ) =>
    request<LineDto>(`/api/lines/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteLine: (id: string) => request<{ ok: true }>(`/api/lines/${id}`, { method: "DELETE" }),
  reorderLines: (chapterId: string, lineIds: string[]) =>
    request<LineDto[]>(`/api/chapters/${chapterId}/lines/reorder`, {
      method: "PUT",
      body: JSON.stringify({ lineIds }),
    }),
  importScript: (
    chapterId: string,
    body: { text: string; mode?: "append" | "replace" },
  ) =>
    request<{
      lines: LineDto[];
      createdCharacters: WorkCharacterDto[];
      importedCount: number;
      mode: "append" | "replace";
    }>(`/api/chapters/${chapterId}/import`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generateScript: (
    chapterId: string,
    body: { instruction?: string; sourceText?: string },
    handlers?: {
      onDelta?: (delta: string) => void;
      signal?: AbortSignal;
    },
  ) =>
    streamGenerateScript(chapterId, body, handlers),
  startProduction: (chapterId: string, body?: { text?: string }) =>
    request<{
      chapter: ChapterDto;
      lines: LineDto[];
      createdCharacters: WorkCharacterDto[];
      importedCount: number;
    }>(`/api/chapters/${chapterId}/start-production`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  resetProduction: (chapterId: string) =>
    request<{
      chapter: ChapterDto;
      lines: LineDto[];
    }>(`/api/chapters/${chapterId}/reset-production`, {
      method: "POST",
      body: "{}",
    }),


  getFish: () => request<FishStatus>("/api/fish"),
  setFishApiKey: (apiKey: string | null) =>
    request<FishStatus>("/api/fish/api-key", {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }),
  setFishBaseUrl: (baseUrl: string | null) =>
    request<FishStatus>("/api/fish/base-url", {
      method: "PUT",
      body: JSON.stringify({ baseUrl }),
    }),
  getMimo: () => request<MimoStatus>("/api/mimo"),
  setMimoApiKey: (apiKey: string | null) =>
    request<MimoStatus>("/api/mimo/api-key", {
      method: "PUT",
      body: JSON.stringify({ apiKey }),
    }),
  setMimoBaseUrl: (baseUrl: string | null) =>
    request<MimoStatus>("/api/mimo/base-url", {
      method: "PUT",
      body: JSON.stringify({ baseUrl }),
    }),
  listMimoPresets: () => request<MimoPreset[]>("/api/mimo/presets"),
  ensureMimoVoice: (voice: string) =>
    request<VoiceDto>("/api/mimo/voices/ensure", {
      method: "POST",
      body: JSON.stringify({ voice }),
    }),

  listVoices: () => request<VoiceDto[]>("/api/voices"),
  deleteVoice: (id: string) => request<{ ok: true }>(`/api/voices/${id}`, { method: "DELETE" }),
  testVoice: (id: string) =>
    request<{ ok: boolean; url?: string; error?: string }>(`/api/voices/${id}/test`, {
      method: "POST",
      body: "{}",
    }),

  listFishModels: (query?: {
    pageNumber?: number;
    pageSize?: number;
    title?: string;
    self?: boolean;
    language?: string;
    titleLanguage?: string;
    sortBy?: "score" | "task_count" | "created_at";
    tab?: "explore" | "favorites";
  }) => {
    const qs = new URLSearchParams();
    if (query?.pageNumber) qs.set("pageNumber", String(query.pageNumber));
    if (query?.pageSize) qs.set("pageSize", String(query.pageSize));
    if (query?.title) qs.set("title", query.title);
    if (query?.self) qs.set("self", "true");
    if (query?.language) qs.set("language", query.language);
    if (query?.titleLanguage) qs.set("titleLanguage", query.titleLanguage);
    if (query?.sortBy) qs.set("sortBy", query.sortBy);
    if (query?.tab) qs.set("tab", query.tab);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<FishModelListResult>(`/api/fish/models${suffix}`);
  },
  previewFishModel: (modelId: string) =>
    request<{ kind: "url" | "file"; url: string }>(
      `/api/fish/models/${encodeURIComponent(modelId)}/preview`,
    ),
  importFishModel: (body: { referenceId: string; title?: string; model?: string }) =>
    request<VoiceDto>("/api/fish/models/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  synthesize: (lineIds: string[]) =>
    request<{ jobs: JobDto[]; skipped: { lineId: string; reason: string }[] }>(
      "/api/synthesize",
      {
        method: "POST",
        body: JSON.stringify({ lineIds }),
      },
    ),
  listJobs: (chapterId?: string) =>
    request<JobDto[]>(chapterId ? `/api/jobs?chapterId=${chapterId}` : "/api/jobs"),
  cancelJob: (id: string) =>
    request<JobDto>(`/api/jobs/${id}/cancel`, { method: "POST", body: "{}" }),

  exportChapter: (
    chapterId: string,
    opts: { confirmStale?: boolean; lineIds?: string[] } = {},
  ) =>
    request<JobDto>(`/api/chapters/${chapterId}/export`, {
      method: "POST",
      body: JSON.stringify({
        confirmStale: opts.confirmStale ?? false,
        lineIds: opts.lineIds,
      }),
    }),

  settings: () =>
    request<{ dataDir: string; ttsConcurrency: number; scriptLlm: ScriptLlmStatus }>(
      "/api/settings",
    ),
  updateSettings: (ttsConcurrency: number) =>
    request<{ ok: true }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ ttsConcurrency }),
    }),
  getScriptLlm: () => request<ScriptLlmStatus>("/api/script-llm"),
  setScriptLlm: (body: { baseUrl?: string; model?: string; apiKey?: string | null }) =>
    request<ScriptLlmStatus>("/api/script-llm", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

export function lineAudioUrl(lineId: string): string {
  return `/api/lines/${lineId}/audio?t=${Date.now()}`;
}

/** Serve a studio data-dir file (export WAV etc.) via the files API. */
export function studioFileUrl(filePath: string): string {
  return `/api/files?path=${encodeURIComponent(filePath)}&t=${Date.now()}`;
}

/** Stream a built-in studio preset BGM track (original loop material, not mixed). */
export function bgmPresetAudioUrl(presetId: string): string {
  return `/api/bgm-presets/${encodeURIComponent(presetId)}/audio?t=${Date.now()}`;
}

export function fishCoverUrl(coverImage: string | undefined): string | null {
  if (!coverImage) return null;
  if (coverImage.startsWith("http")) return coverImage;
  return `https://public-platform.r2.fish.audio/${coverImage.replace(/^\//, "")}`;
}
