import { useEffect, useState } from "react";
import {
  MIMO_PARAM_OVERRIDE_SCHEMA,
  STYLE_INSTRUCTION_TEMPLATES,
  getStyleInstructionTemplate,
  type ParamFieldSchema,
  type WorkCharacterDto,
} from "@open-pod/shared";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function resolveFieldValue(override: Record<string, unknown>, field: ParamFieldSchema): unknown {
  if (Object.prototype.hasOwnProperty.call(override, field.key)) return override[field.key];
  return field.default;
}

export function MimoCharacterParamsDialog(props: {
  open: boolean;
  character: WorkCharacterDto | null;
  voiceName?: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (paramOverride: Record<string, unknown>) => void | Promise<void>;
}) {
  const [styleInstruction, setStyleInstruction] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = MIMO_PARAM_OVERRIDE_SCHEMA.find((f) => f.key === "style_instruction");

  useEffect(() => {
    if (!props.open || !props.character || !field) return;
    setStyleInstruction(String(resolveFieldValue(props.character.paramOverride, field) ?? ""));
    setSelectedTemplateId(null);
    setSaving(false);
  }, [props.open, props.character, field]);

  function applyTemplate(templateId: string) {
    const tpl = getStyleInstructionTemplate(templateId);
    if (!tpl) return;
    setSelectedTemplateId(templateId);
    setStyleInstruction(tpl.text);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(92vw,28rem)] max-h-[min(88vh,44rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>角色风格指令</DialogTitle>
          <DialogDescription>
            {props.character ? `「${props.character.name}」` : "角色"}
            {props.voiceName ? ` · ${props.voiceName}` : " · 尚未绑定音色"}
            。映射 MiMo user 消息，不进入台词正文。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label>预置模板</Label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_INSTRUCTION_TEMPLATES.map((tpl) => {
                const active = selectedTemplateId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    disabled={saving || !props.character}
                    title={tpl.text}
                    onClick={() => applyTemplate(tpl.id)}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border/80 bg-background/80 text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground",
                      saving && "opacity-60",
                    )}
                  >
                    {tpl.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              点选模板会填入内置风格指令，可再编辑；需点保存后才会写入角色。
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mimo-style">风格指令</Label>
            <Textarea
              id="mimo-style"
              className="min-h-[140px] resize-y text-sm"
              value={styleInstruction}
              placeholder="例如：温柔、略带疲惫，语速偏慢，像深夜电台主播。也可点选上方预置模板填入。"
              disabled={saving}
              onChange={(e) => {
                setStyleInstruction(e.target.value);
                setSelectedTemplateId(null);
              }}
            />
            {field?.description ? (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => {
              setStyleInstruction("");
              setSelectedTemplateId(null);
            }}
          >
            清空
          </Button>
          <Button
            disabled={saving || !props.character}
            onClick={async () => {
              if (!props.character) return;
              setSaving(true);
              try {
                const trimmed = styleInstruction.trim();
                await props.onSave(trimmed ? { style_instruction: trimmed } : {});
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
