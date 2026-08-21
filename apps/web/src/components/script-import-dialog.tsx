import { useEffect, useMemo, useState } from "react";
import { parseScriptImport } from "@open-pod/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const EXAMPLE = `旁白：夜色渐浓，街道只剩路灯。
小明：你来了。
小红：嗯，我们开始吧。
这一行没有角色前缀，会使用角色「旁白」。`;

export function ScriptImportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { text: string; mode: "append" | "replace" }) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (props.open) {
      setText("");
      setReplace(false);
      setSubmitting(false);
    }
  }, [props.open]);

  const preview = useMemo(() => parseScriptImport(text), [text]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(92vw,36rem)]">
        <DialogHeader>
          <DialogTitle>批量导入剧本</DialogTitle>
          <DialogDescription>
            每行一条台词。格式：
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">角色名：台词</code>
            ，仅识别全角冒号。无前缀行使用角色「旁白」（普通角色）；未知角色会自动创建。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            className="min-h-[220px] font-mono text-[13px] leading-6"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <label className="inline-flex items-center gap-2 text-muted-foreground">
              <Checkbox
                checked={replace}
                onCheckedChange={(checked) => setReplace(Boolean(checked))}
              />
              替换本章现有台词（会删除旧行与行音频）
            </label>
            <span className="text-xs text-muted-foreground">
              预览 {preview.length} 行
              {preview.length
                ? ` · 角色 ${new Set(preview.map((p) => p.characterName)).size} 个`
                : ""}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            disabled={!preview.length || submitting}
            onClick={() => {
              void (async () => {
                setSubmitting(true);
                try {
                  await props.onConfirm({
                    text,
                    mode: replace ? "replace" : "append",
                  });
                } finally {
                  setSubmitting(false);
                }
              })();
            }}
          >
            {submitting ? "导入中…" : replace ? "替换导入" : "追加导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
