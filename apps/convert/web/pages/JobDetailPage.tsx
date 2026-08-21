import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { cn } from "@/lib/utils";

export function JobDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    const j = await api.getJob(id);
    setJob(j);
  }, [id]);

  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message || e)));
    const t = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  if (!id) return null;
  if (error) {
    return <div className="text-destructive">{error}</div>;
  }
  if (!job) {
    return <div className="text-muted-foreground">加载中…</div>;
  }

  const status = String(job.status);
  const warnings = (job.warnings as string[]) || [];
  const segments = (job.segments as Array<Record<string, unknown>>) || [];
  const canDownload = status === "succeeded" || status === "partial";
  const canRetry =
    job.source_type === "pdf" &&
    (status === "partial" || status === "failed") &&
    segments.some((s) => s.state === "failed");

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← 返回任务列表
      </Link>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{String(job.source_name)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {String(job.source_type).toUpperCase()} · {String(job.id).slice(0, 8)}…
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              status === "succeeded" && "bg-emerald-100 text-emerald-800",
              status === "partial" && "bg-amber-100 text-amber-900",
              status === "failed" && "bg-red-100 text-red-800",
              status === "running" && "bg-sky-100 text-sky-900",
              (status === "queued" || status === "cancelled") &&
                "bg-muted text-muted-foreground",
            )}
          >
            {status}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">阶段</span>
            <div>{String(job.phase)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">进度</span>
            <div>{String(job.progress_message || "—")}</div>
          </div>
          <div>
            <span className="text-muted-foreground">创建</span>
            <div>{String(job.created_at)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">完成</span>
            <div>{job.finished_at ? String(job.finished_at) : "—"}</div>
          </div>
        </div>

        {job.error != null && String(job.error) && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {String(job.error)}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <div className="font-medium">警告</div>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {segments.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-medium">解析页段</div>
            <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1">页段</th>
                    <th className="px-2 py-1">状态</th>
                    <th className="px-2 py-1">错误</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((s) => (
                    <tr key={String(s.index)} className="border-t border-border">
                      <td className="px-2 py-1">{String(s.pageRanges)}</td>
                      <td className="px-2 py-1">{String(s.state)}</td>
                      <td className="px-2 py-1 text-destructive">
                        {s.errMsg ? String(s.errMsg) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {canDownload && (
            <>
              <a
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
                href={api.downloadUrl(id)}
              >
                下载 zip
              </a>
              <a
                className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm"
                href={api.downloadUrl(id, true)}
                onClick={() => setTimeout(() => nav("/"), 500)}
              >
                下载并删除
              </a>
            </>
          )}
          {(status === "queued" || status === "running") && (
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.cancelJob(id);
                  await refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              取消
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.retryFailed(id);
                  await refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              重试失败页段
            </button>
          )}
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-lg border border-destructive/40 px-4 text-sm text-destructive"
            disabled={busy}
            onClick={async () => {
              if (!confirm("确认删除该任务及本地文件？")) return;
              setBusy(true);
              try {
                await api.deleteJob(id);
                nav("/");
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setBusy(false);
              }
            }}
          >
            删除
          </button>
        </div>
      </section>
    </div>
  );
}
