export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type JobKind = "line_synthesis" | "chapter_export";

export type JsonMap = Record<string, unknown>;

export interface ProviderConnectionDto {
  id: string;
  provider: "fish" | "mimo";
  name: string;
  baseUrl: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceDto {
  id: string;
  providerConnectionId: string;
  provider: "fish" | "mimo";
  name: string;
  /** Provider-specific identity + defaults (schema-driven). */
  config: JsonMap;
  createdAt: string;
  updatedAt: string;
}

export interface WorkDto {
  id: string;
  title: string;
  /** Work-level TTS provider kind (fish | mimo). */
  provider: "fish" | "mimo";
  createdAt: string;
  updatedAt: string;
}

export interface ChapterDto {
  id: string;
  workId: string;
  title: string;
  position: number;
  /** Raw script draft text before structured production (step 1). */
  scriptDraft: string;
  /** Step-1 creation instruction (persisted for resume). */
  scriptInstruction: string;
  /** Step-1 reference material text (persisted for resume). */
  scriptSourceText: string;
  /** Whether the chapter has entered structured production (step 2). */
  productionStarted: boolean;
  /** Studio preset track id, or null for no BGM burn-in. */
  bgmPresetId: string | null;
  /** Relative BGM volume 0–100; ignored when bgmPresetId is null. */
  bgmVolume: number;
  /**
   * BGM-only lead-in seconds before speech in chapter burn-in.
   * Default 3; range 0–30. Ignored when bgmPresetId is null.
   */
  bgmIntroSeconds: number;
  createdAt: string;
  updatedAt: string;
}

/** Built-in studio preset BGM track (read-only catalog entry). */
export interface PresetTrackDto {
  id: string;
  name: string;
  /** Optional short description for UI. */
  description?: string;
}

/** BGM portion of a composition snapshot (also stored on chapter). */
export interface ChapterBgmSetting {
  presetId: string | null;
  volume: number;
  /** BGM-only lead-in seconds before speech. */
  introSeconds: number;
}

export interface WorkCharacterDto {
  id: string;
  workId: string;
  name: string;
  isNarrator: boolean;
  voiceId: string | null;
  paramOverride: JsonMap;
  createdAt: string;
  updatedAt: string;
}

export interface LineDto {
  id: string;
  chapterId: string;
  workCharacterId: string;
  text: string;
  position: number;
  paramOverride: JsonMap;
  audioPath: string | null;
  audioFingerprint: string | null;
  /** Relative to current editor state. */
  audioState: "none" | "fresh" | "stale";
  createdAt: string;
  updatedAt: string;
}

export interface JobDto {
  id: string;
  kind: JobKind;
  status: JobStatus;
  workId: string | null;
  chapterId: string | null;
  lineId: string | null;
  error: string | null;
  /** Absolute path of chapter export WAV when kind=chapter_export and succeeded. */
  exportPath: string | null;
  /**
   * Absolute path of chapter export SRT (dialogue-only) written alongside the WAV
   * when kind=chapter_export and succeeded. Null for legacy exports before SRT support.
   */
  exportSrtPath: string | null;
  /**
   * BGM setting frozen into a chapter_export job snapshot (when present).
   * Used to detect stale chapter audio vs current chapter BGM setting.
   */
  compositionBgm: ChapterBgmSetting | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface SynthesisSnapshot {
  lineId: string;
  text: string;
  voiceId: string;
  provider: "fish" | "mimo";
  providerConnectionId: string;
  /** Canonical identity fields used in fingerprint. */
  voiceIdentity: JsonMap;
  effectiveParams: JsonMap;
}

export interface ExportReadiness {
  ok: boolean;
  missingLineIds: string[];
  staleLineIds: string[];
}
