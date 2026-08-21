import { useEffect, useState } from "react";
import type { MimoPreset } from "../api";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function MimoVoicePickerDialog(props: {
  open: boolean;
  selectedVoiceId?: string | null;
  onOpenChange: (open: boolean) => void;
  onPicked?: (payload: { voiceId: string; title: string; voice: string }) => void;
}) {
  const [presets, setPresets] = useState<MimoPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyVoice, setBusyVoice] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    void api
      .listMimoPresets()
      .then(setPresets)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[min(96vw,32rem)] max-h-[min(88vh,36rem)] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>MiMo 预置音色</DialogTitle>
          <DialogDescription>
            选择预置 voice id。首次选用会写入本地音色库并绑定角色。
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {presets.map((p) => {
            const selected = props.selectedVoiceId === p.id;
            return (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2",
                  selected ? "border-primary bg-primary/5" : "border-border/70",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.id}
                    {p.language ? ` · ${p.language}` : ""}
                    {p.gender ? ` · ${p.gender}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testing === p.id || busyVoice === p.id}
                  onClick={async () => {
                    setTesting(p.id);
                    setError(null);
                    try {
                      const voice = await api.ensureMimoVoice(p.id);
                      const result = await api.testVoice(voice.id);
                      if (result.url) {
                        const audio = new Audio(result.url);
                        void audio.play();
                      } else {
                        setError(result.error || "试听失败");
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setTesting(null);
                    }
                  }}
                >
                  {testing === p.id ? "试听中…" : "试听"}
                </Button>
                <Button
                  size="sm"
                  disabled={busyVoice === p.id}
                  onClick={async () => {
                    setBusyVoice(p.id);
                    setError(null);
                    try {
                      const voice = await api.ensureMimoVoice(p.id);
                      props.onPicked?.({
                        voiceId: voice.id,
                        title: voice.name,
                        voice: p.id,
                      });
                      props.onOpenChange(false);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusyVoice(null);
                    }
                  }}
                >
                  {busyVoice === p.id ? "绑定中…" : selected ? "已选" : "选用"}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
