import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FISH_EMOTION_PRESETS,
  FISH_PARAM_OVERRIDE_SCHEMA,
  type ParamFieldSchema,
  type WorkCharacterDto,
} from "@open-pod/shared";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SCHEMA_BY_KEY: Record<string, ParamFieldSchema> = Object.fromEntries(
  FISH_PARAM_OVERRIDE_SCHEMA.map((field) => [field.key, field]),
);

const ADVANCED_KEYS = ["temperature", "top_p", "repetition_penalty", "chunk_length"] as const;

const LATENCY_LABELS: Record<string, string> = {
  normal: "质量优先",
  balanced: "均衡",
  low: "低延迟",
};

function resolveFieldValue(override: Record<string, unknown>, field: ParamFieldSchema): unknown {
  if (Object.prototype.hasOwnProperty.call(override, field.key)) return override[field.key];
  return field.default;
}

function coerceFieldValue(field: ParamFieldSchema, raw: unknown): unknown {
  if (field.type === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return field.default;
    let v = n;
    if (field.min != null) v = Math.max(field.min, v);
    if (field.max != null) v = Math.min(field.max, v);
    return v;
  }
  if (field.type === "boolean") return Boolean(raw);
  if (field.type === "enum") return String(raw ?? field.default ?? "");
  return String(raw ?? "");
}

function formatNumber(value: unknown, digits = 2): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  const fixed = n.toFixed(digits);
  return fixed.replace(/\.?0+$/, "");
}

function Section(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {props.title}
        </div>
        {props.hint ? <p className="text-xs text-muted-foreground">{props.hint}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

function SliderField(props: {
  field: ParamFieldSchema;
  value: unknown;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const min = props.field.min ?? 0;
  const max = props.field.max ?? 1;
  const step = props.field.step ?? 0.05;
  const numeric = Number(props.value ?? props.field.default ?? min);
  const safe = Number.isFinite(numeric) ? numeric : min;
  const digits = step < 1 ? 2 : 0;

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`char-param-${props.field.key}`} className="text-sm">
          {props.field.label}
        </Label>
        <span className="text-sm font-medium tabular-nums text-foreground">
          {formatNumber(safe, digits)}
          {props.unit ? (
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">{props.unit}</span>
          ) : null}
        </span>
      </div>
      <input
        id={`char-param-${props.field.key}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={safe}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary",
          "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
          "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary",
        )}
      />
      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{formatNumber(min, digits)}</span>
        <span>{formatNumber(max, digits)}</span>
      </div>
    </div>
  );
}

function NumberField(props: {
  field: ParamFieldSchema;
  value: unknown;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`char-param-${props.field.key}`}>{props.field.label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatNumber(props.value, props.field.step != null && props.field.step < 1 ? 2 : 0)}
        </span>
      </div>
      <Input
        id={`char-param-${props.field.key}`}
        type="number"
        min={props.field.min}
        max={props.field.max}
        step={props.field.step ?? "any"}
        value={props.value === undefined || props.value === null ? "" : String(props.value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            props.onChange(Number(props.field.default ?? 0));
            return;
          }
          props.onChange(Number(coerceFieldValue(props.field, raw)));
        }}
        className="tabular-nums"
      />
      {props.field.description ? (
        <p className="text-xs text-muted-foreground">{props.field.description}</p>
      ) : null}
    </div>
  );
}

export function CharacterParamsDialog(props: {
  open: boolean;
  character: WorkCharacterDto | null;
  voiceName?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (paramOverride: Record<string, unknown>) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [emotionIsCustom, setEmotionIsCustom] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!props.open || !props.character) return;
    const next: Record<string, unknown> = {};
    for (const field of FISH_PARAM_OVERRIDE_SCHEMA) {
      next[field.key] = coerceFieldValue(
        field,
        resolveFieldValue(props.character.paramOverride, field),
      );
    }
    setDraft(next);

    const emotion = String(next.emotion ?? "").trim();
    setEmotionIsCustom(
      emotion.length > 0 && !FISH_EMOTION_PRESETS.some((p) => p.value === emotion),
    );

    const hasAdvancedOverride = ADVANCED_KEYS.some((key) =>
      Object.prototype.hasOwnProperty.call(props.character!.paramOverride, key),
    );
    setAdvancedOpen(hasAdvancedOverride);
    setSaving(false);
  }, [props.open, props.character]);

  const advancedDirtyCount = useMemo(() => {
    let count = 0;
    for (const key of ADVANCED_KEYS) {
      const field = SCHEMA_BY_KEY[key];
      if (!field) continue;
      const value = coerceFieldValue(field, draft[key]);
      const def = coerceFieldValue(field, field.default);
      if (value !== def) count += 1;
    }
    return count;
  }, [draft]);

  function setField(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const speedField = SCHEMA_BY_KEY.speed;
  const volumeField = SCHEMA_BY_KEY.volume;
  const normalizeField = SCHEMA_BY_KEY.normalize;
  const latencyField = SCHEMA_BY_KEY.latency;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(92vw,26rem)] max-h-[min(88vh,40rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>角色朗读参数</DialogTitle>
          <DialogDescription>
            {props.character ? `「${props.character.name}」` : "角色"}
            的常用朗读设置
            {props.voiceName ? ` · ${props.voiceName}` : " · 尚未绑定音色"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {speedField && volumeField ? (
            <Section title="语速与音量">
              <SliderField
                field={speedField}
                value={draft.speed}
                unit="×"
                onChange={(v) => setField("speed", coerceFieldValue(speedField, v))}
              />
              <SliderField
                field={volumeField}
                value={draft.volume}
                unit="dB"
                onChange={(v) => setField("volume", coerceFieldValue(volumeField, v))}
              />
            </Section>
          ) : null}

          <Section title="表现" hint="控制情绪与朗读风格；会在生成时生效。">
            <div className="space-y-1.5">
              <Label htmlFor="char-param-emotion">情绪标签</Label>
              <select
                id="char-param-emotion"
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                value={emotionIsCustom ? "__custom__" : String(draft.emotion ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom__") {
                    setEmotionIsCustom(true);
                    return;
                  }
                  setEmotionIsCustom(false);
                  setField("emotion", v);
                }}
              >
                {FISH_EMOTION_PRESETS.map((p) => (
                  <option key={p.value || "default"} value={p.value}>
                    {p.label}
                  </option>
                ))}
                <option value="__custom__">自定义…</option>
              </select>
              {emotionIsCustom ? (
                <Input
                  value={String(draft.emotion ?? "")}
                  placeholder="例如 angry 或 whisper"
                  onChange={(e) => setField("emotion", e.target.value)}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                生成时在台词前加上 [标签]，适合 Fish S2 系列。
              </p>
            </div>

            {normalizeField ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={Boolean(draft.normalize)}
                  onChange={(e) => setField("normalize", e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">文本规范化</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    把数字、日期等读得更自然
                  </span>
                </span>
              </label>
            ) : null}

            {latencyField ? (
              <div className="space-y-1.5">
                <Label htmlFor="char-param-latency">延迟档</Label>
                <select
                  id="char-param-latency"
                  className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
                  value={String(draft.latency ?? latencyField.default ?? "normal")}
                  onChange={(e) => setField("latency", e.target.value)}
                >
                  {(latencyField.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {LATENCY_LABELS[opt.value] ?? opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">质量优先更稳，低延迟更快出声。</p>
              </div>
            ) : null}
          </Section>

          <section className="rounded-xl border border-border/60 bg-background/40">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
            >
              <span>
                <span className="block text-sm font-medium">高级参数</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Temperature、Top P、重复惩罚、分块长度
                  {advancedDirtyCount > 0 ? ` · 已改 ${advancedDirtyCount} 项` : ""}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
            </button>
            {advancedOpen ? (
              <div className="space-y-3 border-t border-border/60 px-3 py-3">
                {ADVANCED_KEYS.map((key) => {
                  const field = SCHEMA_BY_KEY[key];
                  if (!field) return null;
                  return (
                    <NumberField
                      key={key}
                      field={field}
                      value={draft[key]}
                      onChange={(v) => setField(key, coerceFieldValue(field, v))}
                    />
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => {
              const next: Record<string, unknown> = {};
              for (const field of FISH_PARAM_OVERRIDE_SCHEMA) {
                next[field.key] = coerceFieldValue(field, field.default);
              }
              setDraft(next);
              setEmotionIsCustom(false);
              setAdvancedOpen(false);
            }}
          >
            恢复默认
          </Button>
          <Button variant="outline" disabled={saving} onClick={() => props.onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={saving || !props.character}
            onClick={() => {
              void (async () => {
                setSaving(true);
                try {
                  const cleaned: Record<string, unknown> = {};
                  for (const field of FISH_PARAM_OVERRIDE_SCHEMA) {
                    const value = coerceFieldValue(field, draft[field.key]);
                    const def = coerceFieldValue(field, field.default);
                    if (value !== def) cleaned[field.key] = value;
                  }
                  await props.onSave(cleaned);
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
