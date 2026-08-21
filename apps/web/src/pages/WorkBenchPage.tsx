import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  ChapterDto,
  JobDto,
  LineDto,
  PresetTrackDto,
  VoiceDto,
  WorkCharacterDto,
} from "@open-pod/shared";
import {
  ArrowLeft,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Download,
  FileInput,
  FileUp,
  GripVertical,
  Library,
  ListChecks,
  Loader2,
  Mic2,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  TriangleAlert,
  UserRound,
  Waves,
} from "lucide-react";
import { api, bgmPresetAudioUrl, lineAudioUrl, studioFileUrl } from "../api";
import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CharacterParamsDialog } from "@/components/character-params-dialog";
import { MimoCharacterParamsDialog } from "@/components/mimo-character-params-dialog";
import { MimoVoicePickerDialog } from "@/components/mimo-voice-picker-dialog";
import { PromptDialog } from "@/components/prompt-dialog";
import {
  ScriptGeneratePanel,
  readScriptSourceFiles,
  type ScriptSourceFile,
} from "@/components/script-generate-panel";
import { ScriptImportDialog } from "@/components/script-import-dialog";
import { VoiceLibraryDialog } from "@/components/voice-library-dialog";

const JOB_STATUS_LABEL: Record<JobDto["status"], string> = {
  queued: "排队中",
  running: "进行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

type LineAudioUiState = LineDto["audioState"] | "synthesizing";

function AudioStateIcon({
  state,
  className,
}: {
  state: LineAudioUiState;
  className?: string;
}) {
  if (state === "synthesizing") {
    return (
      <span title="生成中：该行音频任务排队或进行中" className={cn("inline-flex text-primary", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    );
  }
  if (state === "fresh") {
    return (
      <span title="音频就绪：与当前台词一致" className={cn("inline-flex text-emerald-600", className)}>
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }
  if (state === "stale") {
    return (
      <span
        title="音频过期：台词/角色/参数已变，需重新生成"
        className={cn("inline-flex text-amber-600", className)}
      >
        <TriangleAlert className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span title="无音频：尚未生成" className={cn("inline-flex text-muted-foreground/70", className)}>
      <CircleDashed className="h-4 w-4" />
    </span>
  );
}

function MenuButton(props: {
  label: string;
  icon?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  variant?: "default" | "secondary" | "outline";
  title?: string;
  active?: boolean;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!props.open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) props.onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [props.open, props.onOpenChange]);

  return (
    <div className={cn("relative", props.open && "z-50")} ref={rootRef}>
      <Button
        variant={props.active ? "default" : props.variant ?? "outline"}
        disabled={props.disabled}
        title={props.title}
        aria-haspopup="menu"
        aria-expanded={props.open}
        onClick={() => props.onOpenChange(!props.open)}
      >
        {props.icon}
        {props.label}
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-70 transition-transform", props.open && "rotate-180")} />
      </Button>
      {props.open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[12.5rem] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem(props: {
  children: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={props.disabled}
      title={props.title}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        props.disabled
          ? "cursor-not-allowed text-muted-foreground/50"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
      onClick={() => {
        if (props.disabled) return;
        props.onSelect();
      }}
    >
      {props.children}
    </button>
  );
}

function moveLine(list: LineDto[], fromId: string, toId: string): LineDto[] {
  if (fromId === toId) return list;
  const fromIndex = list.findIndex((l) => l.id === fromId);
  const toIndex = list.findIndex((l) => l.id === toId);
  if (fromIndex < 0 || toIndex < 0) return list;
  const next = list.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function WorkBenchPage() {
  const { workId = "" } = useParams();
  const [workTitle, setWorkTitle] = useState("作品工作台");
  const [workProvider, setWorkProvider] = useState<"fish" | "mimo">("fish");
  const [renameWorkOpen, setRenameWorkOpen] = useState(false);
  const [rebindProviderOpen, setRebindProviderOpen] = useState(false);
  const [rebindTarget, setRebindTarget] = useState<"fish" | "mimo" | null>(null);
  const [renameChapter, setRenameChapter] = useState<ChapterDto | null>(null);
  const [deleteChapter, setDeleteChapter] = useState<ChapterDto | null>(null);
  const [chapters, setChapters] = useState<ChapterDto[]>([]);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<WorkCharacterDto[]>([]);
  const [voices, setVoices] = useState<VoiceDto[]>([]);
  const [lines, setLines] = useState<LineDto[]>([]);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [generateConfirmIds, setGenerateConfirmIds] = useState<string[]>([]);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exportConfirmMsg, setExportConfirmMsg] = useState("");
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [renameCharacter, setRenameCharacter] = useState<WorkCharacterDto | null>(null);
  const [deleteCharacter, setDeleteCharacter] = useState<WorkCharacterDto | null>(null);
  const [editParamsCharacter, setEditParamsCharacter] = useState<WorkCharacterDto | null>(null);
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false);
  const [mimoVoiceOpen, setMimoVoiceOpen] = useState(false);
  const [voicePickCharacterId, setVoicePickCharacterId] = useState<string | null>(null);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const [playingExport, setPlayingExport] = useState(false);
  const [playingBgmPresetId, setPlayingBgmPresetId] = useState<string | null>(null);
  const [playlistMode, setPlaylistMode] = useState<"all" | "from" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null);
  const [exportConfirmKind, setExportConfirmKind] = useState<"stale" | "partial" | null>(null);
  const [composeLineIds, setComposeLineIds] = useState<string[] | null>(null);
  const [downloadWithSrt, setDownloadWithSrt] = useState(false);
  const [playMenuOpen, setPlayMenuOpen] = useState(false);
  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const [composeMenuOpen, setComposeMenuOpen] = useState(false);
  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [scriptAdvancing, setScriptAdvancing] = useState(false);
  const [scriptStepSaving, setScriptStepSaving] = useState(false);
  const [batchImporting, setBatchImporting] = useState(false);
  /** Session override for 参考材料 after batch upload (takes precedence until chapter reloads). */
  const [chapterSourceSeed, setChapterSourceSeed] = useState<Record<string, string>>({});
  const [resetProductionOpen, setResetProductionOpen] = useState(false);
  const [llmReady, setLlmReady] = useState(false);
  const [bgmPresets, setBgmPresets] = useState<PresetTrackDto[]>([]);
  const [bgmSaving, setBgmSaving] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef(0);
  const saveTimers = useRef<Record<string, number>>({});
  /** Local text not yet confirmed by server; protects caret from poll/save overwrites. */
  const dirtyLineTextRef = useRef<Record<string, string>>({});
  const notifiedExportJobIds = useRef<Set<string>>(new Set());
  /** Last observed job status; used so historical failed jobs do not re-toast on open. */
  const seenJobStatusRef = useRef<Map<string, string>>(new Map());
  /** Monotonic seq so an older in-flight poll cannot clobber a fresher loadLines. */
  const loadLinesSeqRef = useRef(0);
  const draftSaveTimer = useRef<number | null>(null);
  const batchFileRef = useRef<HTMLInputElement | null>(null);
  const loadBase = useCallback(async () => {
    const [work, chs, chars, vs, presets] = await Promise.all([
      api.getWork(workId),
      api.listChapters(workId),
      api.listCharacters(workId),
      api.listVoices(),
      api.listBgmPresets().catch(() => [] as PresetTrackDto[]),
    ]);
    setWorkTitle(work.title);
    setWorkProvider(work.provider === "mimo" ? "mimo" : "fish");
    setChapters(chs);
    setCharacters(chars);
    setVoices(vs);
    setBgmPresets(presets);
    setChapterId((prev) => prev ?? chs[0]?.id ?? null);
  }, [workId]);

  const loadLines = useCallback(async (cid: string) => {
    const seq = ++loadLinesSeqRef.current;
    const [ls, js] = await Promise.all([api.listLines(cid), api.listJobs(cid)]);
    // Drop stale responses: interval poll started before enqueue must not wipe active jobs.
    if (seq !== loadLinesSeqRef.current) return;
    setLines(() => {
      const dirty = dirtyLineTextRef.current;
      if (!Object.keys(dirty).length) return ls;
      return ls.map((serverLine) => {
        const localText = dirty[serverLine.id];
        if (localText === undefined) return serverLine;
        return {
          ...serverLine,
          text: localText,
          audioState: serverLine.audioPath ? ("stale" as const) : ("none" as const),
        };
      });
    });
    setJobs(js);
  }, []);

  useEffect(() => {
    void loadBase().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    void api
      .getScriptLlm()
      .then((s) => setLlmReady(Boolean(s.hasApiKey && s.baseUrl && s.model)))
      .catch(() => setLlmReady(false));
  }, [loadBase]);

  useEffect(() => {
    if (!chapterId) return;
    stopPlayback();
    setSelected({});
    setPlayMenuOpen(false);
    setGenerateMenuOpen(false);
    setComposeMenuOpen(false);
    setError(null);
    notifiedExportJobIds.current = new Set();
    seenJobStatusRef.current = new Map();
    void loadLines(chapterId).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const timer = window.setInterval(() => {
      void loadLines(chapterId).catch(() => undefined);
    }, 1500);
    return () => {
      clearInterval(timer);
      stopPlayback();
    };
  }, [chapterId, loadLines]);

  // Seed draft when chapter changes or chapter list first arrives for that id.
  useEffect(() => {
    if (!chapterId) {
      setScriptDraft("");
      return;
    }
    const ch = chapters.find((c) => c.id === chapterId);
    if (!ch) return;
    // Avoid clobbering in-progress local draft autosave for the same chapter.
    if (draftSaveTimer.current) return;
    setScriptDraft(ch.scriptDraft ?? "");
  }, [chapterId, chapters]);

  const focusLine = useMemo(
    () => lines.find((l) => l.id === focusLineId) ?? null,
    [lines, focusLineId],
  );

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const synthesizingLineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const job of jobs) {
      if (
        job.kind === "line_synthesis" &&
        (job.status === "queued" || job.status === "running") &&
        job.lineId
      ) {
        ids.add(job.lineId);
      }
    }
    return ids;
  }, [jobs]);

  const stats = useMemo(() => {
    const fresh = lines.filter((l) => l.audioState === "fresh").length;
    const stale = lines.filter((l) => l.audioState === "stale").length;
    const none = lines.filter((l) => l.audioState === "none").length;
    const withAudio = fresh + stale;
    const synthesizing = synthesizingLineIds.size;
    const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "running");
    const exportJobs = jobs.filter((j) => j.kind === "chapter_export");
    const activeExportJob =
      exportJobs.find((j) => j.status === "queued" || j.status === "running") ?? null;
    const latestExportJob =
      exportJobs.find((j) => j.status === "succeeded" && j.exportPath) ??
      exportJobs.find((j) => j.status === "succeeded") ??
      null;
    const recentJobs = jobs
      .filter((j) => j.status === "failed" || j.status === "succeeded" || j.status === "cancelled")
      .slice(0, 6);
    const readyPct = lines.length ? Math.round((fresh / lines.length) * 100) : 0;
    return {
      fresh,
      stale,
      none,
      withAudio,
      synthesizing,
      activeJobs,
      activeJobCount: activeJobs.length,
      activeExportJob,
      latestExportJob,
      recentJobs,
      readyPct,
      total: lines.length,
      pendingAudio: Math.max(0, stale + none - synthesizing),
    };
  }, [lines, jobs, synthesizingLineIds]);

  useEffect(() => {
    for (const job of jobs) {
      const prev = seenJobStatusRef.current.get(job.id);
      seenJobStatusRef.current.set(job.id, job.status);

      // First sighting of an already-terminal job (page open / chapter switch): record only.
      if (prev === undefined) continue;
      if (prev === job.status) continue;

      if (
        job.kind === "chapter_export" &&
        job.status === "succeeded" &&
        job.exportPath &&
        !notifiedExportJobIds.current.has(job.id)
      ) {
        notifiedExportJobIds.current.add(job.id);
        setMessage("本章合成完成，可试听或下载");
      }

      if (job.status === "failed" && job.error) {
        const lineIndex =
          job.lineId != null ? lines.findIndex((l) => l.id === job.lineId) : -1;
        const where =
          job.kind === "chapter_export"
            ? "合成"
            : lineIndex >= 0
              ? `第 ${lineIndex + 1} 行生成`
              : "行生成";
        setError(`${where}失败：${job.error}`);
      }
    }
  }, [jobs, lines]);

  function scheduleLineSave(lineId: string, patch: Parameters<typeof api.updateLine>[1]) {
    setSaveState("saving");
    const existing = saveTimers.current[lineId];
    if (existing) window.clearTimeout(existing);
    saveTimers.current[lineId] = window.setTimeout(() => {
      void (async () => {
        try {
          // Prefer latest dirty text if present so stale scheduled payloads can't clobber it.
          const dirtyText = dirtyLineTextRef.current[lineId];
          const body =
            dirtyText !== undefined && patch.text !== undefined
              ? { ...patch, text: dirtyText }
              : patch;
          const updated = await api.updateLine(lineId, body);
          setLines((prev) =>
            prev.map((l) => {
              if (l.id !== lineId) return l;
              const stillDirty = dirtyLineTextRef.current[lineId];
              if (stillDirty !== undefined) {
                if (stillDirty === updated.text) {
                  delete dirtyLineTextRef.current[lineId];
                  return updated;
                }
                return {
                  ...updated,
                  text: stillDirty,
                  audioState: updated.audioPath ? "stale" : "none",
                };
              }
              return updated;
            }),
          );
          setSaveState("saved");
          setError(null);
        } catch (e) {
          setSaveState("error");
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    }, 400);
  }

  async function flushAll(): Promise<void> {
    for (const lineId of Object.keys(saveTimers.current)) {
      window.clearTimeout(saveTimers.current[lineId]);
      delete saveTimers.current[lineId];
    }

    const dirtyEntries = Object.entries(dirtyLineTextRef.current);
    if (dirtyEntries.length) {
      await Promise.all(
        dirtyEntries.map(async ([lineId, text]) => {
          try {
            const updated = await api.updateLine(lineId, { text });
            if (dirtyLineTextRef.current[lineId] === updated.text) {
              delete dirtyLineTextRef.current[lineId];
            }
          } catch (e) {
            setSaveState("error");
            setError(e instanceof Error ? e.message : String(e));
          }
        }),
      );
    }

    if (chapterId) await loadLines(chapterId);
  }

  function updateChapterLocal(next: ChapterDto) {
    setChapters((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  }

  function scheduleDraftSave(nextDraft: string) {
    if (!chapterId) return;
    setScriptDraft(nextDraft);
    setSaveState("saving");
    if (draftSaveTimer.current) window.clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const updated = await api.updateChapter(chapterId, { scriptDraft: nextDraft });
          updateChapterLocal(updated);
          setSaveState("saved");
          setError(null);
        } catch (e) {
          setSaveState("error");
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    }, 500);
  }

  async function handleSaveScriptStep(payload: {
    instruction: string;
    sourceText: string;
    draft: string;
  }) {
    if (!chapterId) return;
    setScriptStepSaving(true);
    try {
      if (draftSaveTimer.current) {
        window.clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = null;
      }
      const nextDraft = payload.draft;
      setScriptDraft(nextDraft);
      const updated = await api.updateChapter(chapterId, {
        scriptDraft: nextDraft,
        scriptInstruction: payload.instruction,
        scriptSourceText: payload.sourceText,
      });
      updateChapterLocal(updated);
      setChapterSourceSeed((prev) => {
        if (!(chapterId in prev)) return prev;
        const next = { ...prev };
        delete next[chapterId];
        return next;
      });
      setMessage("已保存创作指令、参考材料与剧本草稿");
      setError(null);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScriptStepSaving(false);
    }
  }

  async function handleGenerateScript(payload: { instruction: string; sourceText: string }) {
    if (!chapterId) return;
    setScriptGenerating(true);
    setScriptDraft("");
    setMessage("正在生成剧本草稿…");
    setError(null);
    try {
      if (draftSaveTimer.current) {
        window.clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = null;
      }
      let assembled = "";
      const result = await api.generateScript(chapterId, payload, {
        onDelta: (delta) => {
          assembled += delta;
          setScriptDraft(assembled);
        },
      });
      setScriptDraft(result.script);
      updateChapterLocal(result.chapter);
      setMessage(
        result.previewCount
          ? `已生成剧本草稿，预览约 ${result.previewCount} 行`
          : "已生成剧本草稿，请检查格式",
      );
      setError(null);
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScriptGenerating(false);
    }
  }

  async function handleStartProduction() {
    if (!chapterId) return;
    setScriptAdvancing(true);
    try {
      if (draftSaveTimer.current) {
        window.clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = null;
      }
      // Persist latest local draft then import as structured lines.
      await api.updateChapter(chapterId, { scriptDraft });
      const result = await api.startProduction(chapterId, { text: scriptDraft });
      updateChapterLocal(result.chapter);
      setLines(result.lines);
      if (result.createdCharacters.length) {
        setCharacters(await api.listCharacters(workId));
      }
      setSelected({});
      setFocusLineId(result.lines[0]?.id ?? null);
      setMessage(
        `已进入结构化生产：导入 ${result.importedCount} 行` +
          (result.createdCharacters.length
            ? `，新建角色 ${result.createdCharacters.map((c) => c.name).join("、")}`
            : ""),
      );
      setError(null);
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScriptAdvancing(false);
    }
  }

  async function handleBatchImportFiles(files: ScriptSourceFile[]) {
    if (!files.length) return;
    setBatchImporting(true);
    try {
      if (draftSaveTimer.current) {
        window.clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = null;
      }
      const created: ChapterDto[] = [];
      const seeds: Record<string, string> = {};
      for (const file of files) {
        const ch = await api.createChapter(workId, {
          title: file.title,
          scriptDraft: "",
          scriptSourceText: file.text,
        });
        created.push(ch);
        seeds[ch.id] = file.text;
      }
      setChapterSourceSeed((prev) => ({ ...prev, ...seeds }));
      await loadBase();
      const focus = created[0];
      if (focus) {
        setChapterId(focus.id);
        setScriptDraft(focus.scriptDraft ?? "");
      }
      setMessage(
        `已批量创建 ${created.length} 个章节（正文已填入参考材料）：` +
          created
            .slice(0, 4)
            .map((c) => c.title)
            .join("、") +
          (created.length > 4 ? "…" : ""),
      );
      setError(null);
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchImporting(false);
    }
  }

  async function handleTopBarBatchFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    try {
      const files = await readScriptSourceFiles(fileList);
      if (!files.length) {
        setError("未识别到可用的文本文件（支持 .txt / .md 等）");
        return;
      }
      await handleBatchImportFiles(files);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleResetProduction() {
    if (!chapterId) return;
    try {
      stopPlayback();
      const result = await api.resetProduction(chapterId);
      updateChapterLocal(result.chapter);
      setLines([]);
      setJobs([]);
      setSelected({});
      setFocusLineId(null);
      // Draft is rebuilt from step-2 lines on the server (same dialect as batch import).
      setScriptDraft(result.chapter.scriptDraft ?? "");
      setMessage("已返回剧本生成：第二步改动已写回剧本草稿，行音频已清空");
      setError(null);
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function synthesizeTargets(ids: string[]) {
    if (!ids.length) return;
    try {
      await flushAll();
      const result = await api.synthesize(ids);
      // Optimistic: show 生成中 immediately; loadLines may still race with the poller.
      if (result.jobs.length) {
        setJobs((prev) => {
          const seen = new Set(prev.map((j) => j.id));
          const fresh = result.jobs.filter((j) => !seen.has(j.id));
          return fresh.length ? [...fresh, ...prev] : prev;
        });
      }
      if (result.skipped.length) {
        setMessage(
          `已入队 ${result.jobs.length} 条；跳过：${result.skipped.map((s) => s.reason).join("；")}`,
        );
      } else {
        setMessage(`已入队 ${result.jobs.length} 条生成任务`);
      }
      if (chapterId) await loadLines(chapterId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 生成选中：若目标里已有行音频，二次确认覆盖 vs 仅未生成。 */
  function requestGenerateSelected(ids: string[]) {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const targets = lines.filter((l) => idSet.has(l.id));
    const withAudio = targets.filter((l) => l.audioState !== "none");
    if (withAudio.length === 0) {
      void synthesizeTargets(ids);
      return;
    }
    setGenerateConfirmIds(ids);
    setGenerateConfirmOpen(true);
  }

  function closeGenerateConfirm() {
    setGenerateConfirmOpen(false);
    setGenerateConfirmIds([]);
  }

  async function confirmGenerateSelected(mode: "overwrite" | "missingOnly") {
    const ids = generateConfirmIds;
    closeGenerateConfirm();
    if (!ids.length) return;
    if (mode === "overwrite") {
      await synthesizeTargets(ids);
      return;
    }
    const idSet = new Set(ids);
    const missingIds = lines
      .filter((l) => idSet.has(l.id) && l.audioState === "none")
      .map((l) => l.id);
    if (!missingIds.length) {
      setMessage("所选行均已生成，没有需要补生成的行");
      return;
    }
    await synthesizeTargets(missingIds);
  }

  function stopPlayback() {
    playTokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingLineId(null);
    setPlayingExport(false);
    setPlayingBgmPresetId(null);
    setPlaylistMode(null);
  }

  function playLineAudio(line: LineDto, token: number, onEnded: () => void) {
    audioRef.current?.pause();
    const audio = new Audio(lineAudioUrl(line.id));
    audioRef.current = audio;
    audio.onended = () => {
      if (token !== playTokenRef.current) return;
      onEnded();
    };
    audio.onerror = () => {
      if (token !== playTokenRef.current) return;
      onEnded();
    };
    setPlayingLineId(line.id);
    setFocusLineId(line.id);
    void audio.play().catch(() => {
      if (token !== playTokenRef.current) return;
      onEnded();
    });
  }

  function playLine(line: LineDto) {
    if (line.audioState === "none") return;
    if (playingLineId === line.id) {
      stopPlayback();
      return;
    }
    const token = playTokenRef.current + 1;
    playTokenRef.current = token;
    setPlaylistMode(null);
    playLineAudio(line, token, () => {
      if (token !== playTokenRef.current) return;
      setPlayingLineId(null);
    });
  }

  function startPlaylist(mode: "all" | "from") {
    if (playlistMode === mode) {
      stopPlayback();
      return;
    }

    let startIndex = 0;
    if (mode === "from") {
      if (!focusLineId) {
        setMessage("请先点选一行，再从当前开始播放");
        return;
      }
      const idx = lines.findIndex((l) => l.id === focusLineId);
      if (idx < 0) {
        setMessage("当前行不可用");
        return;
      }
      startIndex = idx;
    }

    const sequence = lines.slice(startIndex).filter((l) => l.audioState !== "none");
    if (!sequence.length) {
      setMessage(mode === "from" ? "从当前行起没有可播放音频" : "本章没有可播放的行音频");
      return;
    }

    const token = playTokenRef.current + 1;
    playTokenRef.current = token;
    setPlaylistMode(mode);
    setError(null);

    const playAt = (index: number) => {
      if (token !== playTokenRef.current) return;
      if (index >= sequence.length) {
        setPlayingLineId(null);
        setPlaylistMode(null);
        return;
      }
      playLineAudio(sequence[index]!, token, () => playAt(index + 1));
    };

    playAt(0);
  }

  async function persistLineOrder(nextLines: LineDto[]) {
    if (!chapterId) return;
    setLines(nextLines);
    setSaveState("saving");
    try {
      const updated = await api.reorderLines(
        chapterId,
        nextLines.map((l) => l.id),
      );
      setLines(updated);
      setSaveState("saved");
      setError(null);
    } catch (e) {
      setSaveState("error");
      setError(e instanceof Error ? e.message : String(e));
      await loadLines(chapterId);
    }
  }

  function selectAllLines() {
    if (!lines.length) return;
    const next: Record<string, true> = {};
    for (const line of lines) next[line.id] = true;
    setSelected(next);
  }

  function clearLineSelection() {
    setSelected({});
  }

  async function deleteSelectedLines() {
    if (!chapterId || selectedIds.length === 0) return;
    const ids = [...selectedIds];
    stopPlayback();
    for (const id of ids) {
      await api.deleteLine(id);
    }
    setSelected({});
    setDeleteSelectedOpen(false);
    if (focusLineId && ids.includes(focusLineId)) setFocusLineId(null);
    setMessage(`已删除 ${ids.length} 行`);
    await loadLines(chapterId);
  }

  function targetLinesForCompose(lineIds: string[] | null): LineDto[] {
    if (!lineIds) return lines;
    const set = new Set(lineIds);
    return lines.filter((l) => set.has(l.id));
  }

  async function runExport(confirmStale: boolean, lineIds: string[] | null = composeLineIds) {
    if (!chapterId) return;
    await flushAll();
    const targets = targetLinesForCompose(lineIds);
    const withAudio = targets.filter((l) => l.audioState !== "none").length;
    const skipped = targets.filter((l) => l.audioState === "none").length;
    const job = await api.exportChapter(chapterId, {
      confirmStale,
      lineIds: lineIds ?? undefined,
    });
    setExportConfirmOpen(false);
    setExportConfirmKind(null);
    setComposeMenuOpen(false);
    // Optimistic: surface 合成中 before the next poll / loadLines settles.
    setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]));
    setMessage(
      skipped > 0
        ? `合成任务已入队（将拼接 ${withAudio} 行，跳过 ${skipped} 行无音频）`
        : lineIds
          ? `合成任务已入队（选中 ${withAudio} 行）`
          : "合成任务已入队",
    );
    if (job.status === "succeeded" && job.exportPath) {
      notifiedExportJobIds.current.add(job.id);
      setMessage("本章合成完成，可试听或下载");
    }
    await loadLines(chapterId);
  }

  async function startCompose(scope: "all" | "selected") {
    if (!chapterId) return;
    setComposeMenuOpen(false);
    const lineIds = scope === "selected" ? selectedIds : null;
    if (scope === "selected" && selectedIds.length === 0) {
      setError("请先勾选要合成的行");
      return;
    }
    const targets = targetLinesForCompose(lineIds);
    const withAudio = targets.filter((l) => l.audioState !== "none");
    const none = targets.filter((l) => l.audioState === "none");
    const stale = targets.filter((l) => l.audioState === "stale");
    if (withAudio.length === 0) {
      setError(
        scope === "selected"
          ? "选中行没有可合成的音频，请先生成"
          : "没有可合成的行音频，请先生成至少一行",
      );
      return;
    }
    setComposeLineIds(lineIds);
    try {
      await flushAll();
      if (stale.length > 0) {
        setExportConfirmKind("stale");
        setExportConfirmMsg(
          none.length > 0
            ? `存在 ${stale.length} 行过期音频，并将跳过 ${none.length} 行无音频。确认后按当前槽位拼接。`
            : `存在 ${stale.length} 行过期音频。确认后将使用当前槽位音频合成。`,
        );
        setExportConfirmOpen(true);
        return;
      }
      if (none.length > 0) {
        setExportConfirmKind("partial");
        setExportConfirmMsg(
          scope === "selected"
            ? `选中行中有 ${none.length} 行尚未生成，将跳过它们，仅拼接已有 ${withAudio.length} 行音频。`
            : `本章有 ${none.length} 行尚未生成，将跳过它们，仅拼接已有 ${withAudio.length} 行有效音频。`,
        );
        setExportConfirmOpen(true);
        return;
      }
      await runExport(false, lineIds);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("过期") || msg.includes("确认")) {
        setExportConfirmKind("stale");
        setExportConfirmMsg(msg);
        setExportConfirmOpen(true);
        return;
      }
      setError(msg);
    }
  }

  function playExportAudio() {
    const path = stats.latestExportJob?.exportPath;
    if (!path) return;
    if (playingExport) {
      stopPlayback();
      return;
    }
    const token = playTokenRef.current + 1;
    playTokenRef.current = token;
    audioRef.current?.pause();
    const audio = new Audio(studioFileUrl(path));
    audioRef.current = audio;
    audio.onended = () => {
      if (token !== playTokenRef.current) return;
      setPlayingExport(false);
      setPlayingLineId(null);
    };
    audio.onerror = () => {
      if (token !== playTokenRef.current) return;
      setPlayingExport(false);
      setPlayingLineId(null);
      setError("合成音频播放失败");
    };
    setPlaylistMode(null);
    setPlayingLineId(null);
    setPlayingExport(true);
    void audio.play().catch(() => {
      if (token !== playTokenRef.current) return;
      setPlayingExport(false);
      setError("合成音频播放失败");
    });
  }


  function applyBgmPreviewVolume(volume: number) {
    if (!playingBgmPresetId || !audioRef.current) return;
    audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
  }
  function playBgmPreset(presetId: string) {
    if (!presetId) return;
    if (playingBgmPresetId === presetId) {
      stopPlayback();
      return;
    }
    const token = playTokenRef.current + 1;
    playTokenRef.current = token;
    audioRef.current?.pause();
    const audio = new Audio(bgmPresetAudioUrl(presetId));
    // Preview the raw preset at chapter volume (not burn-in STANDARD_BGM_GAIN).
    audio.volume = Math.max(0, Math.min(1, (activeChapter?.bgmVolume ?? 45) / 100));
    audioRef.current = audio;
    audio.onended = () => {
      if (token !== playTokenRef.current) return;
      setPlayingBgmPresetId(null);
      setPlayingExport(false);
      setPlayingLineId(null);
    };
    audio.onerror = () => {
      if (token !== playTokenRef.current) return;
      setPlayingBgmPresetId(null);
      setPlayingExport(false);
      setPlayingLineId(null);
      setError("背景音乐试听失败");
    };
    setPlaylistMode(null);
    setPlayingLineId(null);
    setPlayingExport(false);
    setPlayingBgmPresetId(presetId);
    void audio.play().catch(() => {
      if (token !== playTokenRef.current) return;
      setPlayingBgmPresetId(null);
      setError("背景音乐试听失败");
    });
  }

  function triggerBrowserDownload(filePath: string, fallbackName: string) {
    const a = document.createElement("a");
    a.href = studioFileUrl(filePath);
    a.download = filePath.split(/[\\/]/).pop() || fallbackName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadExportAudio() {
    const job = stats.latestExportJob;
    const wavPath = job?.exportPath;
    if (!wavPath) return;
    triggerBrowserDownload(wavPath, "chapter-export.wav");
    if (downloadWithSrt && job.exportSrtPath) {
      // Second download shortly after — browsers often block simultaneous clicks.
      window.setTimeout(() => {
        triggerBrowserDownload(job.exportSrtPath!, "chapter-export.srt");
      }, 180);
      setMessage("已开始下载 WAV 与 SRT 字幕");
    }
  }

  const charName = (id: string) => characters.find((c) => c.id === id)?.name ?? "？";
  const activeChapter = chapters.find((c) => c.id === chapterId) ?? null;
  const inProduction = Boolean(activeChapter?.productionStarted);
  const canComposeAll =
    inProduction && Boolean(chapterId) && stats.withAudio > 0 && !stats.activeExportJob;
  const selectedWithAudioCount = useMemo(
    () => lines.filter((l) => selected[l.id] && l.audioState !== "none").length,
    [lines, selected],
  );
  const canComposeSelected =
    inProduction && Boolean(chapterId) && selectedWithAudioCount > 0 && !stats.activeExportJob;
  const allSelected = lines.length > 0 && selectedIds.length === lines.length;

  const chapterBgmStale = useMemo(() => {
    const job = stats.latestExportJob;
    if (!job?.exportPath || !activeChapter) return false;
    const snap = job.compositionBgm;
    if (!snap) {
      // Legacy exports without BGM snapshot: stale only if chapter now has BGM.
      return activeChapter.bgmPresetId != null;
    }
    const curPreset = activeChapter.bgmPresetId ?? null;
    const curVol = activeChapter.bgmVolume ?? 45;
    const curIntro = activeChapter.bgmIntroSeconds ?? 3;
    return (
      snap.presetId !== curPreset ||
      (curPreset != null &&
        (snap.volume !== curVol ||
          (snap.introSeconds ?? 3) !== curIntro))
    );
  }, [stats.latestExportJob, activeChapter]);

  async function saveChapterBgm(patch: {
    bgmPresetId?: string | null;
    bgmVolume?: number;
    bgmIntroSeconds?: number;
  }) {
    if (!activeChapter) return;
    setBgmSaving(true);
    try {
      const next = await api.updateChapter(activeChapter.id, patch);
      updateChapterLocal(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBgmSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top command bar */}
      <div className="relative z-40 flex flex-col gap-3 border-b border-border/50 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link to="/" aria-label="返回作品列表" title="返回作品列表">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{workTitle}</h1>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => setRenameWorkOpen(true)}
                aria-label="重命名作品"
                title="重命名作品"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <button
                type="button"
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  workProvider === "mimo"
                    ? "bg-sky-500/10 text-sky-700"
                    : "bg-orange-500/10 text-orange-700",
                )}
                title="点击切换作品 TTS Provider"
                onClick={() => {
                  setRebindTarget(workProvider === "mimo" ? "fish" : "mimo");
                  setRebindProviderOpen(true);
                }}
              >
                {workProvider === "mimo" ? "MiMo TTS" : "Fish Audio"}
              </button>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  saveState === "saving" && "bg-amber-500/10 text-amber-700",
                  saveState === "error" && "bg-destructive/10 text-destructive",
                  saveState === "saved" && "bg-emerald-500/10 text-emerald-700",
                )}
              >
                {saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : "已保存"}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  inProduction
                    ? "bg-primary/10 text-primary"
                    : "bg-violet-500/10 text-violet-700",
                )}
              >
                {inProduction ? "第二步 · 结构化生产" : "第一步 · 剧本生成"}
              </span>
            </div>
            {inProduction ? (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span title="本章行音频：就绪 / 过期 / 缺失">
                  <span className="text-emerald-600">{stats.fresh}</span>
                  {" / "}
                  <span className="text-amber-600">{stats.stale}</span>
                  {" / "}
                  <span className="text-muted-foreground">{stats.none}</span>
                  <span className="ml-1">行音频</span>
                </span>
                {stats.activeExportJob ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary"
                    title={JOB_STATUS_LABEL[stats.activeExportJob.status]}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    合成中
                  </span>
                ) : null}
                {stats.synthesizing > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary"
                    title={`${stats.synthesizing} 行音频生成排队或进行中`}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    生成中 {stats.synthesizing}
                  </span>
                ) : null}
                {!stats.activeExportJob &&
                stats.synthesizing === 0 &&
                stats.activeJobCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    {stats.activeJobCount} 任务进行中
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={batchFileRef}
            type="file"
            accept=".txt,.md,.markdown,.text,text/plain,text/markdown,application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              void handleTopBarBatchFiles(list);
              e.target.value = "";
            }}
          />
          {!inProduction ? (
            <Button
              variant="outline"
              disabled={batchImporting}
              onClick={() => batchFileRef.current?.click()}
              title="选择多个文本文件，按文件名各建一章，正文写入该章参考材料"
            >
              {batchImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {batchImporting ? "导入中…" : "批量上传"}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setResetProductionOpen(true)}
                title="返回剧本生成：把当前结构化台词写回剧本草稿（可再编辑后重新进入第二步）；行音频与进行中任务会清空"
              >
                <RotateCcw className="h-4 w-4" />
                返回剧本生成
              </Button>
              {playlistMode ? (
                <Button variant="default" onClick={() => stopPlayback()} title="停止播放">
                  <Pause className="h-4 w-4" />
                  停止播放
                </Button>
              ) : (
                <MenuButton
                  label="播放"
                  icon={<Play className="h-4 w-4" />}
                  open={playMenuOpen}
                  onOpenChange={setPlayMenuOpen}
                  disabled={lines.length === 0}
                  title="播放行音频"
                >
                  <MenuItem
                    onSelect={() => {
                      setPlayMenuOpen(false);
                      startPlaylist("all");
                    }}
                    title="按剧本顺序播放全部有音频的行"
                  >
                    <Play className="h-3.5 w-3.5" />
                    播放全部
                  </MenuItem>
                  <MenuItem
                    onSelect={() => {
                      setPlayMenuOpen(false);
                      startPlaylist("from");
                    }}
                    title="从当前焦点行开始顺序播放"
                  >
                    <Play className="h-3.5 w-3.5" />
                    从当前开始
                  </MenuItem>
                </MenuButton>
              )}
              <MenuButton
                label="生成"
                icon={<Mic2 className="h-4 w-4" />}
                open={generateMenuOpen}
                onOpenChange={setGenerateMenuOpen}
                disabled={!focusLine && selectedIds.length === 0}
                title="生成行音频"
              >
                <MenuItem
                  disabled={!focusLine}
                  onSelect={() => {
                    setGenerateMenuOpen(false);
                    if (focusLine) void synthesizeTargets([focusLine.id]);
                  }}
                  title="生成当前焦点行"
                >
                  <Mic2 className="h-3.5 w-3.5" />
                  生成当前
                </MenuItem>
                <MenuItem
                  disabled={selectedIds.length === 0 && !focusLine}
                  onSelect={() => {
                    setGenerateMenuOpen(false);
                    if (selectedIds.length) {
                      requestGenerateSelected(selectedIds);
                      return;
                    }
                    if (focusLine) void synthesizeTargets([focusLine.id]);
                  }}
                  title="生成勾选行；已有音频时会确认覆盖或仅补未生成；无勾选时退化为当前行"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  生成选中
                  {selectedIds.length ? ` (${selectedIds.length})` : ""}
                </MenuItem>
              </MenuButton>
              {stats.activeExportJob ? (
                <Button variant="outline" disabled title="合成进行中">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  合成中
                </Button>
              ) : (
                <MenuButton
                  label="合成"
                  icon={<Waves className="h-4 w-4" />}
                  open={composeMenuOpen}
                  onOpenChange={setComposeMenuOpen}
                  disabled={!canComposeAll && !canComposeSelected}
                  title="拼接行音频为章成品"
                >
                  <MenuItem
                    disabled={!canComposeAll}
                    onSelect={() => void startCompose("all")}
                    title={
                      canComposeAll
                        ? stats.none > 0
                          ? `拼接全部有效行（${stats.withAudio}），跳过 ${stats.none} 行无音频`
                          : `拼接全部有效行（${stats.withAudio}）`
                        : "请先生成至少一行音频"
                    }
                  >
                    <Waves className="h-3.5 w-3.5" />
                    合成全部有效行
                    {stats.withAudio ? ` (${stats.withAudio})` : ""}
                  </MenuItem>
                  <MenuItem
                    disabled={!canComposeSelected}
                    onSelect={() => void startCompose("selected")}
                    title={
                      canComposeSelected
                        ? `拼接选中行中的有效音频（${selectedWithAudioCount}）`
                        : selectedIds.length
                          ? "选中行尚无音频"
                          : "请先勾选行"
                    }
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    合成选中行
                    {selectedWithAudioCount ? ` (${selectedWithAudioCount})` : ""}
                  </MenuItem>
                </MenuButton>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" duration={false} onDismiss={() => setError(null)}>
          <div className="whitespace-pre-wrap break-words pr-6">{error}</div>
        </Alert>
      )}
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <div
        className={cn(
          "grid gap-6 xl:gap-8",
          inProduction
            ? "xl:grid-cols-[200px_minmax(0,1fr)_280px]"
            : "xl:grid-cols-[200px_minmax(0,1fr)]",
        )}
      >
        {/* Chapters rail */}
        <aside className="h-fit xl:sticky xl:top-20">
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="text-xs font-medium text-muted-foreground">章节</div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={async () => {
                try {
                  const ch = await api.createChapter(workId);
                  await loadBase();
                  setChapterId(ch.id);
                  setError(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
              aria-label="新增章节"
              title="新增章节"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-0.5">
            {chapters.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                暂无章节，点击 + 创建
              </div>
            ) : (
              chapters.map((ch) => {
                const active = ch.id === chapterId;
                return (
                  <div
                    key={ch.id}
                    className={cn(
                      "group flex w-full items-center gap-0.5 rounded-lg transition-colors",
                      active ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm transition-colors",
                        active
                          ? "font-medium text-foreground"
                          : "text-foreground/75",
                      )}
                      onClick={() => setChapterId(ch.id)}
                      title={ch.title}
                    >
                      {ch.title}
                    </button>
                    <div
                      className={cn(
                        "flex shrink-0 items-center pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                        active && "opacity-100",
                      )}
                    >
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameChapter(ch);
                        }}
                        aria-label={`重命名章节 ${ch.title}`}
                        title="重命名章节"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteChapter(ch);
                        }}
                        aria-label={`删除章节 ${ch.title}`}
                        title="删除章节"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Script stage */}
        <section className="min-w-0">
          {!inProduction ? (
            chapterId ? (
              <ScriptGeneratePanel
                key={chapterId}
                chapterTitle={activeChapter?.title ?? "未命名章节"}
                draft={scriptDraft}
                generating={scriptGenerating}
                advancing={scriptAdvancing}
                batchImporting={batchImporting}
                saving={scriptStepSaving}
                llmReady={llmReady}
                initialInstruction={activeChapter?.scriptInstruction ?? ""}
                initialSourceText={
                  chapterSourceSeed[chapterId] ?? activeChapter?.scriptSourceText ?? ""
                }
                onDraftChange={scheduleDraftSave}
                onGenerate={handleGenerateScript}
                onSave={handleSaveScriptStep}
                onAdvance={handleStartProduction}
                onBatchImportFiles={handleBatchImportFiles}
              />
            ) : (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                请选择或创建章节
              </div>
            )
          ) : (
            <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
            <div className="text-sm font-semibold">
              第二步 · 结构化剧本
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {stats.total} 行
                {selectedIds.length ? ` · 已选 ${selectedIds.length}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={lines.length === 0}
                onClick={() => (allSelected ? clearLineSelection() : selectAllLines())}
                title={allSelected ? "取消全选" : "全选本章台词行"}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {allSelected ? "取消全选" : "全选"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedIds.length === 0}
                onClick={() => setDeleteSelectedOpen(true)}
                title={selectedIds.length ? `删除选中的 ${selectedIds.length} 行` : "请先勾选行"}
                className={selectedIds.length ? "text-destructive hover:text-destructive" : undefined}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除选中
                {selectedIds.length ? ` (${selectedIds.length})` : ""}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={!chapterId}>
                <FileInput className="h-4 w-4" />
                批量导入
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!chapterId) return;
                  const line = await api.createLine(chapterId, {
                    workCharacterId: focusLine?.workCharacterId,
                    afterPosition: focusLine?.position,
                    text: "",
                  });
                  await loadLines(chapterId);
                  setFocusLineId(line.id);
                }}
              >
                <Plus className="h-4 w-4" />
                插入行
              </Button>
            </div>
          </div>

          <div className="space-y-1 pt-3">
            {lines.map((line, index) => {
              const focused = focusLineId === line.id;
              const synthesizing = synthesizingLineIds.has(line.id);
              const audioUiState: LineAudioUiState = synthesizing
                ? "synthesizing"
                : line.audioState;
              return (
                <div
                  key={line.id}
                  draggable={false}
                  className={cn(
                    "group space-y-2 rounded-lg px-2 py-2.5 transition-colors md:px-2.5",
                    focused
                      ? "bg-primary/[0.06]"
                      : "hover:bg-muted/40",
                    line.audioState === "stale" && !synthesizing && "bg-amber-500/[0.04]",
                    synthesizing && "bg-primary/[0.04]",
                    draggingLineId === line.id && "opacity-50",
                    dragOverLineId === line.id &&
                      draggingLineId &&
                      draggingLineId !== line.id &&
                      "bg-primary/10 ring-1 ring-primary/25",
                  )}
                  onClick={() => setFocusLineId(line.id)}
                  onDragOver={(e) => {
                    if (!draggingLineId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverLineId !== line.id) setDragOverLineId(line.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverLineId === line.id) setDragOverLineId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromId = draggingLineId ?? e.dataTransfer.getData("text/line-id");
                    setDraggingLineId(null);
                    setDragOverLineId(null);
                    if (!fromId || fromId === line.id) return;
                    const next = moveLine(lines, fromId, line.id);
                    void persistLineOrder(next);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2 md:gap-3">
                    <div
                      className="flex w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing md:w-7"
                      title="拖拽排序"
                      draggable
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/line-id", line.id);
                        setDraggingLineId(line.id);
                        setFocusLineId(line.id);
                      }}
                      onDragEnd={() => {
                        setDraggingLineId(null);
                        setDragOverLineId(null);
                      }}
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <Checkbox
                        checked={Boolean(selected[line.id])}
                        onCheckedChange={(checked) => {
                          setSelected((prev) => {
                            const next = { ...prev };
                            if (checked) next[line.id] = true;
                            else delete next[line.id];
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title="选择该行，用于批量生成/合成"
                      />
                      <span className="min-w-[1.25rem] text-center text-[11px] tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <select
                      className="h-8 min-w-0 max-w-[40%] shrink rounded-md border-0 bg-muted/50 px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      value={line.workCharacterId}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const workCharacterId = e.target.value;
                        setLines((prev) =>
                          prev.map((l) =>
                            l.id === line.id
                              ? {
                                  ...l,
                                  workCharacterId,
                                  audioState: l.audioPath ? "stale" : "none",
                                }
                              : l,
                          ),
                        );
                        scheduleLineSave(line.id, { workCharacterId });
                      }}
                      title="选择说话角色"
                    >
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <AudioStateIcon state={audioUiState} />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={line.audioState === "none"}
                        onClick={(e) => {
                          e.stopPropagation();
                          playLine(line);
                        }}
                        aria-label={playingLineId === line.id ? "暂停预听" : "预听"}
                        title={
                          line.audioState === "none"
                            ? "无音频，请先生成"
                            : synthesizing
                              ? playingLineId === line.id
                                ? "暂停预听（生成完成后会更新音频）"
                                : "预听当前槽位（生成中）"
                              : playingLineId === line.id
                                ? "暂停预听"
                                : "预听本行"
                        }
                      >
                        {playingLineId === line.id ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={synthesizing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void synthesizeTargets([line.id]);
                        }}
                        aria-label={synthesizing ? "生成中" : "生成本行"}
                        title={synthesizing ? "该行已在生成队列中" : "生成本行音频"}
                      >
                        {synthesizing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mic2 className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteLineId(line.id);
                        }}
                        aria-label="删除本行"
                        title="删除本行"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Textarea
                    value={line.text}
                    placeholder={`${charName(line.workCharacterId)} 说…`}
                    className="block min-h-[72px] w-full min-w-0 resize-y border-0 bg-transparent px-0 py-1 shadow-none focus-visible:ring-0"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const text = e.target.value;
                      dirtyLineTextRef.current[line.id] = text;
                      setLines((prev) =>
                        prev.map((l) =>
                          l.id === line.id
                            ? { ...l, text, audioState: l.audioPath ? "stale" : "none" }
                            : l,
                        ),
                      );
                      scheduleLineSave(line.id, { text });
                    }}
                  />
                </div>
              );
            })}

            {lines.length === 0 && (
              <div className="px-2 py-16 text-center">
                <div className="text-sm font-medium">暂无台词</div>
              </div>
            )}
          </div>
            </>
          )}
        </section>

        {inProduction ? (
        <aside className="space-y-8 xl:sticky xl:top-20 xl:self-start">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">
                角色
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setAddCharacterOpen(true)}
                  aria-label="添加角色"
                  title="添加角色"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setVoicePickCharacterId(null);
                    if (workProvider === "mimo") setMimoVoiceOpen(true);
                    else setVoiceLibraryOpen(true);
                  }}
                  aria-label="打开音色库"
                  title="打开音色库"
                >
                  <Library className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {characters.map((c) => {
                const voice = voices.find((v) => v.id === c.voiceId);
                return (
                  <div
                    key={c.id}
                    className="group rounded-lg px-1.5 py-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => {
                          setVoicePickCharacterId(c.id);
                          if (workProvider === "mimo") setMimoVoiceOpen(true);
                          else setVoiceLibraryOpen(true);
                        }}
                        title={voice ? `更换音色（当前：${voice.name}）` : "为角色绑定音色"}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {voice ? voice.name : "点击选择音色"}
                            {Object.keys(c.paramOverride ?? {}).length > 0 ? " · 已覆盖参数" : ""}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "mt-1 h-2 w-2 shrink-0 rounded-full",
                            voice ? "bg-emerald-500" : "bg-border",
                          )}
                          title={voice ? "已绑音色" : "未绑音色"}
                        />
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditParamsCharacter(c)}
                          aria-label={`编辑角色参数 ${c.name}`}
                          title="编辑朗读参数（语速/情绪等）"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setRenameCharacter(c)}
                          aria-label={`重命名角色 ${c.name}`}
                          title="重命名角色"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteCharacter(c)}
                          aria-label={`删除角色 ${c.name}`}
                          title="删除角色（仍被台词引用时会阻止）"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border/40 pt-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                本章音频
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {stats.activeExportJob ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                    title={JOB_STATUS_LABEL[stats.activeExportJob.status]}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    合成中
                  </span>
                ) : null}
                {stats.synthesizing > 0 ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                    title={`${stats.synthesizing} 行音频生成排队或进行中`}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    生成中 {stats.synthesizing}
                  </span>
                ) : null}
                {!stats.activeExportJob &&
                stats.synthesizing === 0 &&
                stats.activeJobCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {stats.activeJobCount} 进行中
                  </span>
                ) : null}
                {!stats.activeExportJob &&
                stats.synthesizing === 0 &&
                stats.activeJobCount === 0 ? (
                  <span className="text-[11px] text-muted-foreground">任务空闲</span>
                ) : null}
              </div>
            </div>

            <div className="mb-3 space-y-2">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-semibold tabular-nums tracking-tight">
                    {stats.readyPct}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {stats.fresh}/{stats.total || 0} 行音频就绪
                  </div>
                </div>
                {stats.withAudio > 0 ? (
                  <div className="text-right text-xs text-muted-foreground">
                    {stats.pendingAudio > 0 ? (
                      <>
                        待处理 {stats.pendingAudio}
                        <div className="mt-0.5 flex justify-end gap-2">
                          {stats.stale > 0 ? (
                            <span className="text-amber-600" title="台词/角色/参数变更后需重新生成">
                              过期 {stats.stale}
                            </span>
                          ) : null}
                          {stats.none > 0 ? (
                            <span title="尚未生成过；合成时将跳过">缺失 {stats.none}</span>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-emerald-700">可完整合成</div>
                    )}
                  </div>
                ) : (
                  <div className="text-right text-xs text-muted-foreground">暂无可合成音频</div>
                )}
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                title={`就绪 ${stats.fresh} · 过期 ${stats.stale} · 缺失 ${stats.none}`}
              >
                <div className="flex h-full w-full">
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{
                      width: stats.total ? `${(stats.fresh / stats.total) * 100}%` : "0%",
                    }}
                  />
                  <div
                    className="bg-amber-500 transition-all"
                    style={{
                      width: stats.total ? `${(stats.stale / stats.total) * 100}%` : "0%",
                    }}
                  />
                  <div
                    className="bg-border transition-all"
                    style={{
                      width: stats.total ? `${(stats.none / stats.total) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  就绪
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  过期
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-border" />
                  缺失
                </span>
              </div>
            </div>

            <div className="mb-3 space-y-2 border-t border-border/40 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-foreground">背景音乐</div>
                {bgmSaving ? (
                  <span className="text-[11px] text-muted-foreground">保存中…</span>
                ) : activeChapter?.bgmPresetId ? (
                  <span className="text-[11px] text-muted-foreground">合成时烧录</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">无</span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                    disabled={!activeChapter || bgmSaving}
                    value={activeChapter?.bgmPresetId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (playingBgmPresetId) stopPlayback();
                      void saveChapterBgm({ bgmPresetId: v === "" ? null : v });
                    }}
                    title="选择工作室预置曲目；合成时循环铺满并烧录进章成品"
                  >
                    <option value="">无背景音乐</option>
                    {bgmPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant={playingBgmPresetId ? "default" : "outline"}
                    className="shrink-0"
                    disabled={
                      !activeChapter?.bgmPresetId ||
                      !bgmPresets.some((p) => p.id === activeChapter.bgmPresetId)
                    }
                    onClick={() => {
                      if (!activeChapter?.bgmPresetId) return;
                      playBgmPreset(activeChapter.bgmPresetId);
                    }}
                    title={
                      activeChapter?.bgmPresetId
                        ? playingBgmPresetId
                          ? "停止试听预置曲目"
                          : "试听当前预置曲目原曲（非章成品混音）"
                        : "请先选择背景音乐"
                    }
                  >
                    {playingBgmPresetId ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {playingBgmPresetId ? "停止" : "试听"}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] text-muted-foreground">音量</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="h-1.5 w-full accent-primary"
                    disabled={!activeChapter || bgmSaving || !activeChapter.bgmPresetId}
                    value={activeChapter?.bgmVolume ?? 45}
                    onChange={(e) => {
                      const volume = Number(e.target.value);
                      updateChapterLocal({
                        ...activeChapter!,
                        bgmVolume: volume,
                      });
                      applyBgmPreviewVolume(volume);
                    }}
                    onMouseUp={(e) => {
                      if (!activeChapter?.bgmPresetId) return;
                      const volume = Number((e.target as HTMLInputElement).value);
                      void saveChapterBgm({ bgmVolume: volume });
                    }}
                    onTouchEnd={(e) => {
                      if (!activeChapter?.bgmPresetId) return;
                      const volume = Number((e.target as HTMLInputElement).value);
                      void saveChapterBgm({ bgmVolume: volume });
                    }}
                    onKeyUp={(e) => {
                      if (!activeChapter?.bgmPresetId) return;
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
                        void saveChapterBgm({ bgmVolume: activeChapter.bgmVolume });
                      }
                    }}
                    title="背景音乐相对音量 0–100；0 不等于「无」"
                  />
                  <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {activeChapter?.bgmVolume ?? 45}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] text-muted-foreground">前奏</span>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    className="h-1.5 w-full accent-primary"
                    disabled={!activeChapter || bgmSaving || !activeChapter.bgmPresetId}
                    value={activeChapter?.bgmIntroSeconds ?? 3}
                    onChange={(e) => {
                      const intro = Number(e.target.value);
                      updateChapterLocal({
                        ...activeChapter!,
                        bgmIntroSeconds: intro,
                      });
                    }}
                    onMouseUp={(e) => {
                      if (!activeChapter?.bgmPresetId) return;
                      const intro = Number((e.target as HTMLInputElement).value);
                      void saveChapterBgm({ bgmIntroSeconds: intro });
                    }}
                    onTouchEnd={(e) => {
                      if (!activeChapter?.bgmPresetId) return;
                      const intro = Number((e.target as HTMLInputElement).value);
                      void saveChapterBgm({ bgmIntroSeconds: intro });
                    }}
                    onKeyUp={(e) => {
                      if (!activeChapter?.bgmPresetId) return;
                      if (
                        e.key === "ArrowLeft" ||
                        e.key === "ArrowRight" ||
                        e.key === "Home" ||
                        e.key === "End"
                      ) {
                        void saveChapterBgm({
                          bgmIntroSeconds: activeChapter.bgmIntroSeconds,
                        });
                      }
                    }}
                    title="合成时背景音乐独奏前奏时长（秒）；0 表示人声立即进入"
                  />
                  <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {activeChapter?.bgmIntroSeconds ?? 3}s
                  </span>
                </div>
                {activeChapter?.bgmPresetId &&
                !bgmPresets.some((p) => p.id === activeChapter.bgmPresetId) ? (
                  <div className="text-[11px] text-amber-700">
                    当前曲目不可用，请重新选择后再合成。
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mb-3 space-y-2 border-t border-border/40 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-foreground">章合成音频</div>
                {stats.activeExportJob ? (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] text-primary"
                    title={JOB_STATUS_LABEL[stats.activeExportJob.status]}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    合成中…
                  </span>
                ) : stats.latestExportJob?.exportPath ? (
                  chapterBgmStale ? (
                    <span className="text-[11px] text-amber-700">BGM 已变更，需重合成</span>
                  ) : (
                    <span className="text-[11px] text-emerald-700">可试听</span>
                  )
                ) : (
                  <span className="text-[11px] text-muted-foreground">尚未合成</span>
                )}
              </div>
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                {stats.activeExportJob
                  ? stats.latestExportJob?.exportPath
                    ? "正在重新合成本章成品；完成后会覆盖当前试听与下载。"
                    : "正在拼接行音频与背景音乐，完成后可试听/下载。"
                  : stats.latestExportJob?.exportPath
                    ? chapterBgmStale
                      ? "章成品仍可试听/下载，但背景音乐设定已与上次合成不一致，请重新合成。"
                      : "基于最近一次成功合成的 WAV。重新合成后会覆盖并更新试听。"
                    : stats.withAudio > 0
                      ? `当前可拼接 ${stats.withAudio} 行${stats.none > 0 ? `，将跳过 ${stats.none} 行无音频` : ""}。`
                      : "先生成行音频，再合成本章成品。"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={playingExport ? "default" : "outline"}
                  disabled={!stats.latestExportJob?.exportPath}
                  onClick={playExportAudio}
                  title={
                    stats.latestExportJob?.exportPath
                      ? playingExport
                        ? "停止试听"
                        : "试听合成成品"
                      : "请先在顶栏合成"
                  }
                >
                  {playingExport ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {playingExport ? "停止" : "试听"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!stats.latestExportJob?.exportPath}
                  onClick={downloadExportAudio}
                  title={
                    stats.latestExportJob?.exportPath
                      ? downloadWithSrt && stats.latestExportJob.exportSrtPath
                        ? "下载合成 WAV 与 SRT 字幕"
                        : "下载合成 WAV"
                      : "请先在顶栏合成"
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                  下载
                </Button>
              </div>
              {stats.latestExportJob?.exportPath ? (
                <label
                  className={cn(
                    "flex items-center gap-2 text-[11px] text-muted-foreground",
                    !stats.latestExportJob.exportSrtPath && "opacity-60",
                  )}
                  title={
                    stats.latestExportJob.exportSrtPath
                      ? "勾选后下载时额外附带对白 SRT（与音频时间轴对齐）"
                      : "当前成品尚无字幕；请重新合成本章后再下载"
                  }
                >
                  <Checkbox
                    checked={downloadWithSrt && Boolean(stats.latestExportJob.exportSrtPath)}
                    disabled={!stats.latestExportJob.exportSrtPath}
                    onCheckedChange={(v) => setDownloadWithSrt(v === true)}
                    aria-label="下载时附带字幕"
                  />
                  <span>
                    附带字幕（SRT）
                    {!stats.latestExportJob.exportSrtPath ? (
                      <span className="ml-1 text-amber-700">需重合成</span>
                    ) : null}
                  </span>
                </label>
              ) : null}
            </div>

            {stats.activeJobs.length > 0 ? (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="text-xs font-medium text-foreground">进行中的任务</div>
                <div className="max-h-40 space-y-2 overflow-auto">
                  {stats.activeJobs.map((j) => {
                    const targetLine =
                      j.lineId != null ? lines.find((l) => l.id === j.lineId) : undefined;
                    const lineIndex =
                      j.lineId != null ? lines.findIndex((l) => l.id === j.lineId) : -1;
                    const label =
                      j.kind === "chapter_export"
                        ? "合成本章"
                        : lineIndex >= 0
                          ? `生成第 ${lineIndex + 1} 行`
                          : "生成台词";
                    const detail =
                      j.kind === "line_synthesis" && targetLine
                        ? `${charName(targetLine.workCharacterId)} · ${targetLine.text.trim() || "（空台词）"}`
                        : j.kind === "chapter_export"
                          ? activeChapter?.title ?? "当前章节"
                          : JOB_STATUS_LABEL[j.status];
                    return (
                      <div
                        key={j.id}
                        className="flex items-start gap-2 rounded-lg bg-primary/[0.05] px-2.5 py-2 text-sm"
                      >
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{label}</div>
                          <div className="truncate text-xs text-muted-foreground" title={detail}>
                            {detail}
                          </div>
                          <div className="mt-0.5 text-[11px] text-primary">
                            {JOB_STATUS_LABEL[j.status]}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2 text-xs"
                          onClick={() =>
                            void api.cancelJob(j.id).then(() => {
                              if (chapterId) return loadLines(chapterId);
                            })
                          }
                          title="取消该任务"
                        >
                          取消
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : stats.recentJobs.length > 0 ? (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="text-xs font-medium text-foreground">最近任务</div>
                <div className="max-h-36 space-y-1.5 overflow-auto">
                  {stats.recentJobs.map((j) => {
                    const lineIndex =
                      j.lineId != null ? lines.findIndex((l) => l.id === j.lineId) : -1;
                    const label =
                      j.kind === "chapter_export"
                        ? "合成本章"
                        : lineIndex >= 0
                          ? `第 ${lineIndex + 1} 行`
                          : "行生成";
                    return (
                      <div
                        key={j.id}
                        className="flex items-start gap-2 rounded-xl px-1 py-1 text-xs"
                      >
                        <span
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            j.status === "succeeded" && "bg-emerald-500",
                            j.status === "failed" && "bg-destructive",
                            j.status === "cancelled" && "bg-muted-foreground/40",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{label}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {JOB_STATUS_LABEL[j.status]}
                            </span>
                          </div>
                          {j.error ? (
                            <div
                              className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-destructive"
                              title={j.error}
                            >
                              {j.error}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
                点「生成」或顶栏「合成」后，这里会显示任务进度；合成完成后可试听/下载。
              </div>
            )}
          </div>
        </aside>
        ) : null}
      </div>

      <VoiceLibraryDialog
        open={voiceLibraryOpen && workProvider === "fish"}
        mode={voicePickCharacterId ? "pick" : "browse"}
        onOpenChange={(open) => {
          setVoiceLibraryOpen(open);
          if (!open) setVoicePickCharacterId(null);
        }}
        selectedReferenceId={
          voicePickCharacterId
            ? (() => {
                const c = characters.find((x) => x.id === voicePickCharacterId);
                const v = voices.find((x) => x.id === c?.voiceId);
                return v ? String(v.config.reference_id ?? "") : null;
              })()
            : null
        }
        onPicked={async ({ voiceId, title }) => {
          if (!voicePickCharacterId) {
            setVoices(await api.listVoices());
            setMessage(`已导入音色 ${title}`);
            return;
          }
          const updated = await api.updateCharacter(voicePickCharacterId, { voiceId });
          setCharacters((prev) => prev.map((x) => (x.id === voicePickCharacterId ? updated : x)));
          setVoices(await api.listVoices());
          if (chapterId) await loadLines(chapterId);
          setMessage(`已为角色绑定音色 ${title}`);
          setVoicePickCharacterId(null);
        }}
      />

      <MimoVoicePickerDialog
        open={mimoVoiceOpen && workProvider === "mimo"}
        selectedVoiceId={
          voicePickCharacterId
            ? (() => {
                const c = characters.find((x) => x.id === voicePickCharacterId);
                const v = voices.find((x) => x.id === c?.voiceId);
                return v ? String(v.config.voice ?? "") : null;
              })()
            : null
        }
        onOpenChange={(open) => {
          setMimoVoiceOpen(open);
          if (!open) setVoicePickCharacterId(null);
        }}
        onPicked={async ({ voiceId, title }) => {
          if (!voicePickCharacterId) {
            setVoices(await api.listVoices());
            setMessage(`已准备音色 ${title}`);
            return;
          }
          const updated = await api.updateCharacter(voicePickCharacterId, { voiceId });
          setCharacters((prev) => prev.map((x) => (x.id === voicePickCharacterId ? updated : x)));
          setVoices(await api.listVoices());
          if (chapterId) await loadLines(chapterId);
          setMessage(`已为角色绑定音色 ${title}`);
          setVoicePickCharacterId(null);
        }}
      />

      <ConfirmDialog
        open={rebindProviderOpen}
        title={
          rebindTarget
            ? `切换作品 Provider 到 ${rebindTarget === "mimo" ? "MiMo TTS" : "Fish Audio"}？`
            : "切换作品 Provider？"
        }
        description="将解绑与新 Provider 不符的角色音色，清空角色与台词参数覆盖，并把受影响行音频标为过期。不会自动重生成，也不会删除已有音频文件。"
        destructive
        confirmText="确认切换"
        onOpenChange={(open) => {
          setRebindProviderOpen(open);
          if (!open) setRebindTarget(null);
        }}
        onConfirm={async () => {
          if (!rebindTarget) return;
          try {
            const updated = await api.updateWork(workId, { provider: rebindTarget });
            setWorkProvider(updated.provider === "mimo" ? "mimo" : "fish");
            setCharacters(await api.listCharacters(workId));
            setVoices(await api.listVoices());
            if (chapterId) await loadLines(chapterId);
            setMessage(
              `作品已切换为 ${updated.provider === "mimo" ? "MiMo TTS" : "Fish Audio"}`,
            );
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setRebindProviderOpen(false);
            setRebindTarget(null);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteLineId)}
        title="删除该行？"
        description="对应行音频会一并删除，且不可恢复。"
        destructive
        confirmText="删除"
        onOpenChange={(open) => {
          if (!open) setDeleteLineId(null);
        }}
        onConfirm={async () => {
          if (!deleteLineId) return;
          const id = deleteLineId;
          await api.deleteLine(id);
          setDeleteLineId(null);
          setSelected((prev) => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
          if (focusLineId === id) setFocusLineId(null);
          if (chapterId) await loadLines(chapterId);
        }}
      />
      <ConfirmDialog
        open={deleteSelectedOpen}
        title={`删除选中的 ${selectedIds.length} 行？`}
        description="对应行音频会一并删除，且不可恢复。"
        destructive
        confirmText={`删除 ${selectedIds.length || ""}`.trim()}
        onOpenChange={setDeleteSelectedOpen}
        onConfirm={async () => {
          await deleteSelectedLines();
        }}
      />
      <AlertDialog
        open={generateConfirmOpen}
        onOpenChange={(open) => {
          if (!open) closeGenerateConfirm();
          else setGenerateConfirmOpen(true);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>生成选中行</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const idSet = new Set(generateConfirmIds);
                const targets = lines.filter((l) => idSet.has(l.id));
                const withAudio = targets.filter((l) => l.audioState !== "none").length;
                const missing = targets.filter((l) => l.audioState === "none").length;
                return `已选 ${targets.length} 行，其中 ${withAudio} 行已有音频、${missing} 行尚未生成。请选择处理方式。`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-col sm:space-x-0 gap-2">
            <Button
              onClick={() => {
                void confirmGenerateSelected("missingOnly");
              }}
            >
              仅生成未生成的行
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void confirmGenerateSelected("overwrite");
              }}
            >
              覆盖生成全部选中
            </Button>
            <AlertDialogCancel>取消</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmDialog
        open={exportConfirmOpen}
        title={exportConfirmKind === "partial" ? "跳过无音频行并合成？" : "使用过期音频合成？"}
        description={
          exportConfirmMsg ||
          (exportConfirmKind === "partial"
            ? "将跳过尚未生成的行，仅拼接已有行音频。"
            : "存在过期行音频。确认后将使用当前槽位音频合成。")
        }
        confirmText="继续合成"
        onOpenChange={(open) => {
          setExportConfirmOpen(open);
          if (!open) setExportConfirmKind(null);
        }}
        onConfirm={async () => {
          await runExport(exportConfirmKind === "stale", composeLineIds);
        }}
      />
      <PromptDialog
        open={addCharacterOpen}
        title="添加角色"
        description="输入作品内角色名。"
        placeholder="角色名"
        confirmText="创建"
        onOpenChange={setAddCharacterOpen}
        onConfirm={async (name) => {
          await api.createCharacter(workId, name);
          setCharacters(await api.listCharacters(workId));
          setAddCharacterOpen(false);
          setMessage(`已创建角色 ${name}`);
        }}
      />
      <PromptDialog
        open={renameWorkOpen}
        title="重命名作品"
        placeholder="作品标题"
        defaultValue={workTitle}
        confirmText="保存"
        onOpenChange={setRenameWorkOpen}
        onConfirm={async (nextTitle) => {
          try {
            const updated = await api.updateWork(workId, { title: nextTitle });
            setWorkTitle(updated.title);
            setRenameWorkOpen(false);
            setMessage(`已重命名为 ${updated.title}`);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      <PromptDialog
        open={Boolean(renameChapter)}
        title="重命名章节"
        placeholder="章节标题"
        defaultValue={renameChapter?.title ?? ""}
        confirmText="保存"
        onOpenChange={(open) => {
          if (!open) setRenameChapter(null);
        }}
        onConfirm={async (nextTitle) => {
          if (!renameChapter) return;
          try {
            const updated = await api.updateChapter(renameChapter.id, { title: nextTitle });
            updateChapterLocal(updated);
            setRenameChapter(null);
            setMessage(`章节已重命名为 ${updated.title}`);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteChapter)}
        title={deleteChapter ? `删除章节「${deleteChapter.title}」？` : "删除章节？"}
        description="章节下的台词、行音频与章合成音频将一并删除，且不可恢复。"
        destructive
        confirmText="删除"
        onOpenChange={(open) => {
          if (!open) setDeleteChapter(null);
        }}
        onConfirm={async () => {
          if (!deleteChapter) return;
          try {
            const removedId = deleteChapter.id;
            const removedTitle = deleteChapter.title;
            await api.deleteChapter(removedId);
            setDeleteChapter(null);
            const remaining = chapters.filter((c) => c.id !== removedId);
            setChapters(remaining);
            if (chapterId === removedId) {
              setChapterId(remaining[0]?.id ?? null);
              setLines([]);
              setJobs([]);
              setSelected({});
              setFocusLineId(null);
              setScriptDraft("");
            }
            setMessage(`已删除章节 ${removedTitle}`);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      <PromptDialog
        open={Boolean(renameCharacter)}
        title="重命名角色"
        description="修改作品内显示名。"
        placeholder="角色名"
        defaultValue={renameCharacter?.name ?? ""}
        confirmText="保存"
        onOpenChange={(open) => {
          if (!open) setRenameCharacter(null);
        }}
        onConfirm={async (name) => {
          if (!renameCharacter) return;
          try {
            const updated = await api.updateCharacter(renameCharacter.id, { name });
            setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setRenameCharacter(null);
            setMessage(`已重命名为 ${updated.name}`);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      {workProvider === "mimo" ? (
        <MimoCharacterParamsDialog
          open={Boolean(editParamsCharacter)}
          character={editParamsCharacter}
          voiceName={
            editParamsCharacter
              ? voices.find((v) => v.id === editParamsCharacter.voiceId)?.name ?? null
              : null
          }
          onOpenChange={(open) => {
            if (!open) setEditParamsCharacter(null);
          }}
          onSave={async (paramOverride) => {
            if (!editParamsCharacter) return;
            const updated = await api.updateCharacter(editParamsCharacter.id, { paramOverride });
            setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setEditParamsCharacter(null);
            if (chapterId) await loadLines(chapterId);
            setMessage(`已更新角色「${updated.name}」风格指令`);
            setError(null);
          }}
        />
      ) : (
        <CharacterParamsDialog
          open={Boolean(editParamsCharacter)}
          character={editParamsCharacter}
          voiceName={
            editParamsCharacter
              ? voices.find((v) => v.id === editParamsCharacter.voiceId)?.name ?? null
              : null
          }
          onOpenChange={(open) => {
            if (!open) setEditParamsCharacter(null);
          }}
          onSave={async (paramOverride) => {
            if (!editParamsCharacter) return;
            const updated = await api.updateCharacter(editParamsCharacter.id, { paramOverride });
            setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            setEditParamsCharacter(null);
            if (chapterId) await loadLines(chapterId);
            setMessage(`已更新角色「${updated.name}」朗读参数`);
            setError(null);
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteCharacter)}
        title={deleteCharacter ? `删除角色「${deleteCharacter.name}」？` : "删除角色？"}
        description="仅在没有任何台词引用该角色时可删除。"
        destructive
        confirmText="删除"
        onOpenChange={(open) => {
          if (!open) setDeleteCharacter(null);
        }}
        onConfirm={async () => {
          if (!deleteCharacter) return;
          try {
            await api.deleteCharacter(deleteCharacter.id);
            setCharacters(await api.listCharacters(workId));
            setDeleteCharacter(null);
            setMessage(`已删除角色 ${deleteCharacter.name}`);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
      <ConfirmDialog
        open={resetProductionOpen}
        title="返回剧本生成？"
        description="会把当前结构化台词写回剧本草稿（与批量导入同一格式），然后清空第二步的台词行、行音频与进行中任务。回到第一步后可继续改文案，再重新进入结构化生产。"
        destructive
        confirmText="写回并返回"
        onOpenChange={setResetProductionOpen}
        onConfirm={async () => {
          await handleResetProduction();
          setResetProductionOpen(false);
        }}
      />
      <ScriptImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onConfirm={async ({ text, mode }) => {
          if (!chapterId) return;
          try {
            await flushAll();
            const result = await api.importScript(chapterId, { text, mode });
            setLines(result.lines);
            if (result.createdCharacters.length) {
              setCharacters(await api.listCharacters(workId));
            }
            setImportOpen(false);
            setSelected({});
            setFocusLineId(result.lines[0]?.id ?? null);
            const createdHint = result.createdCharacters.length
              ? `，新建角色 ${result.createdCharacters.map((c) => c.name).join("、")}`
              : "";
            setMessage(
              `${mode === "replace" ? "已替换导入" : "已追加导入"} ${result.importedCount} 行${createdHint}`,
            );
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </div>
  );
}
