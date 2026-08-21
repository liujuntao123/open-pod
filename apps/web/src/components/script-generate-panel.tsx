import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { parseScriptImport } from "@open-pod/shared";
import { FileUp, Loader2, Save, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DRAFT_EXAMPLE = `主持人：他开头到底在反驳谁呀？
嘉宾：[思考] 呃，没有吧。[长思考]额...他一上来呢，直接引用了奥古斯丁《忏悔录》里的一段。[停顿]奥古斯丁啊，回忆自己小时候学说话——大人指着某个东西，嘴里发出一个声音，[停顿]然后呢，孩子就把这个声音和那个东西绑在一起。[长停顿]一遍一遍，词的「意义」就学会了，对吧。`;

const TEXT_FILE_ACCEPT =
  ".txt,.md,.markdown,.text,text/plain,text/markdown,application/json";

export type ScriptSourceFile = {
  title: string;
  text: string;
  fileName: string;
};

export const INSTRUCTION_PRESETS = [
  {
    id: "duo-podcast",
    label: "双人播客",
    instruction: [
      "请写成双人播客对谈。",
      "角色只用主持人和嘉宾。",
      "嘉宾负责把观点、例子和解释说清楚，回答明显长于提问，也可以连着说好几句；主持人负责开场、简短提问、追问、接话和过渡。",
      "请说人话，像现场聊天。可以在句子里多使用吧、呢、吗、啊、然后呢这些语气词，让衔接更自然。开口时常常可以先有[思考]、[长思考]，再配上呃、额、嗯。分句之间多用[停顿]，也带一点情绪标签；讲完一块可以用[长停顿]；关键结论或术语前加上[强调]。",
      "篇幅跟着参考材料走，把要点说清楚。",
    ].join(""),
  },
  {
    id: "solo-podcast",
    label: "单人播客",
    instruction: [
      "请写成单人播客口播。",
      "只有一位主讲人，开场和过渡也由主讲人自己说。",
      "主讲人把全部内容讲完。",
      "请像跟听众聊天一样说人话。可以多写一点语气词，也适当使用[思考]、[停顿]和轻一点的情绪标签；重要的地方可以[强调]。",
      "篇幅跟着参考材料走，把内容完整展开。",
    ].join(""),
  },
  {
    id: "book-talk",
    label: "书籍解读",
    instruction: [
      "请写成书籍解读。",
      "以讲解者为主，也可以有提问者。",
      "讲解者负责观点和例子，书名和章节也由讲解者口头带出来；提问者只做短问和反应。",
      "请像读书分享那样说人话。先用大白话把画面讲清楚，再点章节或术语。可以在句子里多使用吧、呢、吗、啊这些语气词；讲解时常有[思考]起势、[停顿]换画面、[长停顿]收束，论点前加上[强调]，有情绪也可以标出来。",
      "篇幅跟着参考材料走，把论点和例子说清楚。",
    ].join(""),
  },
  {
    id: "multi-audiobook",
    label: "多人有声书",
    instruction: [
      "请改写成多人有声书。",
      "叙述者可以用「旁白」或「讲述者」；人物对白用稳定的角色名分行。",
      "按人物关系说话。",
      "叙述可以稍顺一点，但仍然要口语。人物对白请说人话，并多写语气词，也把思考、停顿、情绪和[强调]自然写进去。",
      "篇幅跟着参考材料走，完整改写。",
    ].join(""),
  },
  {
    id: "audio-drama",
    label: "广播剧",
    instruction: [
      "请写成广播剧。",
      "只写人物对白，用对白推进冲突和关系。",
      "按人物关系说话。",
      "请写成当场说出口的人话。思考、停顿、情绪和反应都可以写进过程里；需要戏剧留白时用[长停顿]。",
      "篇幅跟着参考材料走。",
    ].join(""),
  },
  {
    id: "interview",
    label: "访谈节目",
    instruction: [
      "请写成访谈节目。",
      "角色只用主持人和嘉宾。",
      "嘉宾做主要、详细的回答，边想边说，篇幅明显长于提问；主持人负责短问和追问。",
      "请说访谈口语。嘉宾先用大白话把点拆开，再补术语。可以在句子里多使用吧、呢、吗、啊、然后呢；也常有[思考]、[停顿]、情绪标签和[强调]。",
      "篇幅跟着参考材料走，把议题说清楚。",
    ].join(""),
  },
  {
    id: "essay-narration",
    label: "散文朗诵",
    instruction: [
      "请写成适合朗诵的散文或美文。",
      "以朗读者或旁白为主，全文都是会出声的朗读正文。",
      "由单人承担叙述。",
      "语言自然可上口，可以偏[平静]或[小声]；关键意象可以[强调]，也可以轻轻[停顿]。整体比聊天对谈更顺一些。",
      "篇幅跟着参考材料走，保留意象和层次。",
    ].join(""),
  },
  {
    id: "news-brief",
    label: "资讯播报",
    instruction: [
      "请写成资讯或热点播报。",
      "以主播口吻为主，也可以双主播接力；片头和提要由主播口播。",
      "主播把事实和要点讲清楚。",
      "请写清楚好懂的话，语气可以偏[平静]或[认真]；关键事实和数字前加上[强调]。语气词比聊天对谈少一些。",
      "篇幅跟着参考材料走，把事实和要点播完。",
    ].join(""),
  },
] as const;

function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, "");
  const stripped = base.replace(/\.[^.]+$/u, "").trim();
  return stripped || "未命名章节";
}

function isTextLikeFile(file: File): boolean {
  if (!file) return false;
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json" || file.type === "application/xml") return true;
  return /\.(txt|md|markdown|text|json|csv|log)$/iu.test(file.name);
}

export async function readScriptSourceFiles(fileList: ArrayLike<File>): Promise<ScriptSourceFile[]> {
  const files = Array.from(fileList).filter(isTextLikeFile);
  files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" }));
  const out: ScriptSourceFile[] = [];
  for (const file of files) {
    const text = await file.text();
    out.push({
      title: titleFromFileName(file.name),
      text,
      fileName: file.name,
    });
  }
  return out;
}

export function ScriptGeneratePanel(props: {
  chapterTitle: string;
  draft: string;
  generating: boolean;
  advancing: boolean;
  llmReady: boolean;
  batchImporting?: boolean;
  saving?: boolean;
  /** Seed 创作指令 when opening a chapter. */
  initialInstruction?: string;
  /** Seed 参考材料 when switching chapters after batch upload or resume. */
  initialSourceText?: string;
  onDraftChange: (value: string) => void;
  onGenerate: (payload: { instruction: string; sourceText: string }) => void | Promise<void>;
  onSave: (payload: {
    instruction: string;
    sourceText: string;
    draft: string;
  }) => void | Promise<void>;
  onAdvance: () => void | Promise<void>;
  /** Multi-file → create one chapter per file (title from filename, body as 参考材料). */
  onBatchImportFiles?: (files: ScriptSourceFile[]) => void | Promise<void>;
}) {
  const [instruction, setInstruction] = useState(() => props.initialInstruction ?? "");
  const [sourceText, setSourceText] = useState(() => props.initialSourceText ?? "");
  const [activePresetId, setActivePresetId] = useState<string | null>(() => {
    const seed = props.initialInstruction ?? "";
    return INSTRUCTION_PRESETS.find((p) => p.instruction === seed)?.id ?? null;
  });
  const [dragOver, setDragOver] = useState(false);
  const [fileHint, setFileHint] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the latest streamed tokens visible.
  useEffect(() => {
    if (!props.generating) return;
    const el = draftRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [props.draft, props.generating]);


  const preview = useMemo(() => parseScriptImport(props.draft), [props.draft]);
  const roles = useMemo(() => {
    const names: Record<string, true> = {};
    for (const p of preview) names[p.characterName] = true;
    return Object.keys(names).length;
  }, [preview]);
  const busy = props.generating || Boolean(props.batchImporting) || Boolean(props.saving);
  const canGenerate = Boolean(instruction.trim() || sourceText.trim()) && !busy;
  const canAdvance = preview.length > 0 && !props.advancing && !busy;
  const canSave =
    !busy &&
    Boolean(instruction.trim() || sourceText.trim() || props.draft.trim());

  function applyPreset(id: string) {
    const preset = INSTRUCTION_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    if (activePresetId === id) {
      setActivePresetId(null);
      return;
    }
    setActivePresetId(id);
    setInstruction(preset.instruction);
  }

  function onInstructionChange(value: string) {
    setInstruction(value);
    const matched = INSTRUCTION_PRESETS.find((p) => p.instruction === value);
    setActivePresetId(matched?.id ?? null);
  }

  async function ingestFiles(list: ArrayLike<File> | null | undefined) {
    if (!list || list.length === 0) return;
    const files = await readScriptSourceFiles(list);
    if (!files.length) {
      setFileHint("未识别到可用的文本文件（支持 .txt / .md 等）");
      return;
    }

    if (files.length === 1) {
      const only = files[0]!;
      setSourceText((prev) => (prev.trim() ? `${prev.trim()}\n\n${only.text}` : only.text));
      setFileHint(`已载入参考材料：${only.fileName}`);
      return;
    }

    if (!props.onBatchImportFiles) {
      // Fallback: concatenate into source if parent has no batch handler.
      const merged = files.map((f) => `【${f.title}】\n${f.text}`).join("\n\n");
      setSourceText((prev) => (prev.trim() ? `${prev.trim()}\n\n${merged}` : merged));
      setFileHint(`已合并 ${files.length} 个文件到参考材料`);
      return;
    }

    setFileHint(`正在批量创建 ${files.length} 个章节…`);
    await props.onBatchImportFiles(files);
    setFileHint(`已按文件创建 ${files.length} 个章节（文件名作标题，正文写入参考材料）`);
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    if (busy) return;
    void ingestFiles(e.dataTransfer?.files);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm font-semibold">第一步 · 生成剧本文本</div>
        <div className="rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
          {props.chapterTitle}
        </div>
      </div>

      {!props.llmReady ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          尚未配置剧本 LLM。请先到{" "}
          <Link to="/settings" className="font-medium underline underline-offset-2">
            设置
          </Link>{" "}
          填写 OpenAI 兼容的 Base URL、API Key 与 Model ID。你仍可手工粘贴/编辑草稿后进入第二步。
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="script-instruction">创作指令</Label>
            <div className="flex flex-wrap gap-1.5">
              {INSTRUCTION_PRESETS.map((preset) => {
                const active = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={busy}
                    onClick={() => applyPreset(preset.id)}
                    title={preset.instruction}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border/80 bg-background/80 text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground",
                      busy && "opacity-60",
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              id="script-instruction"
              value={instruction}
              onChange={(e) => onInstructionChange(e.target.value)}
              placeholder="选择上方预制类型，或自行填写：例如把下面材料改成双人播客对谈演播稿，只有主持人和嘉宾台词，不要旁白，约 12 行。"
              className="min-h-[110px] text-sm"
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="script-source">参考材料（可选）</Label>
              <div className="text-[11px] text-muted-foreground">
                单文件 → 参考材料 · 多文件 → 批量建章（正文进参考材料）
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept={TEXT_FILE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files;
                void ingestFiles(list);
                e.target.value = "";
              }}
            />

            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!busy) fileRef.current?.click();
                }
              }}
              onClick={() => {
                if (!busy) fileRef.current?.click();
              }}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/80 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:bg-muted/40",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border bg-background/80",
                  dragOver ? "border-primary/40 text-primary" : "border-border/70",
                )}
              >
                {props.batchImporting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : dragOver ? (
                  <Upload className="h-5 w-5" />
                ) : (
                  <FileUp className="h-5 w-5" />
                )}
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  {dragOver ? "松开以载入文件" : "拖拽文件到此处，或点击选择"}
                </div>
                <div className="text-xs leading-5">
                  支持 .txt / .md；可多选。多个文件将按文件名各建一章，正文写入该章参考材料。
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="pointer-events-none"
                tabIndex={-1}
              >
                <FileUp className="h-3.5 w-3.5" />
                选择文件
              </Button>
            </div>

            {fileHint ? (
              <div className="text-xs text-muted-foreground">{fileHint}</div>
            ) : null}

            <Textarea
              id="script-source"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="粘贴小说片段、大纲或已有草稿……也可通过上方区域上传"
              className="min-h-[140px] font-mono text-[13px] leading-6"
              disabled={busy}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!canSave}
              title={
                !canSave
                  ? props.saving
                    ? "保存中…"
                    : "请先填写指令、参考材料或剧本草稿"
                  : "保存创作指令、参考材料与剧本草稿"
              }
              onClick={() => {
                void props.onSave({
                  instruction,
                  sourceText,
                  draft: props.draft,
                });
              }}
            >
              {props.saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {props.saving ? "保存中…" : "保存"}
            </Button>
            <Button
              disabled={!canGenerate || !props.llmReady}
              title={
                !props.llmReady
                  ? "请先配置剧本 LLM"
                  : !canGenerate
                    ? "请填写指令或参考材料"
                    : "调用大模型生成草稿"
              }
              onClick={() => {
                void props.onGenerate({
                  instruction: instruction.trim(),
                  sourceText: sourceText.trim(),
                });
              }}
            >
              {props.generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {props.generating ? "生成中…" : "生成剧本"}
            </Button>
          </div>
        </div>

        <div className="space-y-3 border-t border-border/40 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              剧本草稿
              {props.generating ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">生成中…</span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              预览 {preview.length} 行
              {preview.length ? ` · 角色 ${roles}` : ""}
            </div>
          </div>
          <Textarea
            ref={draftRef}
            value={props.draft}
            onChange={(e) => props.onDraftChange(e.target.value)}
            placeholder={props.generating ? "模型正在输出…" : DRAFT_EXAMPLE}
            className={cn(
              "min-h-[480px] font-mono text-[13px] leading-6 xl:min-h-[560px]",
              props.batchImporting && "opacity-70",
              props.generating && "ring-1 ring-primary/30",
            )}
            disabled={Boolean(props.batchImporting)}
            readOnly={props.generating}
          />
          <div className="flex justify-end">
            <Button disabled={!canAdvance} onClick={() => void props.onAdvance()}>
              {props.advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {props.advancing ? "进入中…" : "确认并进入结构化生产"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
