import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { WorkDto } from "@open-pod/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PromptDialog } from "@/components/prompt-dialog";

export function WorkListPage() {
  const [works, setWorks] = useState<WorkDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [newProvider, setNewProvider] = useState<"fish" | "mimo">("fish");
  const [loading, setLoading] = useState(true);
  const [deleteWorkId, setDeleteWorkId] = useState<string | null>(null);
  const [deleteWorkTitle, setDeleteWorkTitle] = useState("");
  const [renameWork, setRenameWork] = useState<WorkDto | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setWorks(await api.listWorks());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">作品列表</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-56"
            placeholder="作品标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value === "mimo" ? "mimo" : "fish")}
            aria-label="TTS Provider"
            title="TTS Provider"
          >
            <option value="fish">Fish Audio</option>
            <option value="mimo">MiMo TTS</option>
          </select>
          <Button
            onClick={async () => {
              try {
                await api.createWork(title || undefined, newProvider);
                setTitle("");
                await refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <Plus className="h-4 w-4" />
            新建作品
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : works.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>还没有作品</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">输入标题后点击「新建作品」开始。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((w) => (
            <Card key={w.id} className="overflow-hidden transition-colors hover:border-border">
              <CardHeader>
                <CardTitle className="line-clamp-1">{w.title}</CardTitle>
                <CardDescription>
                  {w.provider === "mimo" ? "MiMo TTS" : "Fish Audio"} · 更新于{" "}
                  {new Date(w.updatedAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button asChild>
                  <Link to={`/works/${w.id}`}>打开工作台</Link>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setRenameWork(w)}
                  aria-label={`重命名作品 ${w.title}`}
                  title="重命名"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setDeleteWorkId(w.id);
                    setDeleteWorkTitle(w.title);
                  }}
                  aria-label={`删除作品 ${w.title}`}
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PromptDialog
        open={Boolean(renameWork)}
        title="重命名作品"
        placeholder="作品标题"
        defaultValue={renameWork?.title ?? ""}
        confirmText="保存"
        onOpenChange={(open) => {
          if (!open) setRenameWork(null);
        }}
        onConfirm={async (nextTitle) => {
          if (!renameWork) return;
          try {
            const updated = await api.updateWork(renameWork.id, { title: nextTitle });
            setWorks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
            setRenameWork(null);
            setError(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteWorkId)}
        title={`删除作品「${deleteWorkTitle}」？`}
        description="作品、章节、台词与对应音频将一并删除，且不可恢复。"
        destructive
        confirmText="删除"
        onOpenChange={(open) => {
          if (!open) setDeleteWorkId(null);
        }}
        onConfirm={async () => {
          if (!deleteWorkId) return;
          await api.deleteWork(deleteWorkId);
          setDeleteWorkId(null);
          await refresh();
        }}
      />
    </div>
  );
}
