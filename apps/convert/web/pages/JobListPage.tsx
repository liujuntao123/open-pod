import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type JobListItem, type Settings } from "../api";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  queued: "排队",
  running: "运行中",
  succeeded: "成功",
  partial: "部分成功",
  failed: "失败",
  cancelled: "已取消",
};

export function JobListPage() {
  const nav = useNavigate();
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [outputMode, setOutputMode] = useState("split");
  const [isOcr, setIsOcr] = useState(false);
  const [modelVersion, setModelVersion] = useState("pipeline");
  const [language, setLanguage] = useState("ch");
  const [assets, setAssets] = useState("localize");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [j, s] = await Promise.all([api.listJobs(), api.settings()]);
    setJobs(j.jobs);
    setSettings(s);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message || e)));
    const t = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const isPdf = file?.name.toLowerCase().endsWith(".pdf");
  const isEpub = file?.name.toLowerCase().endsWith(".epub");
  const pdfBlocked = Boolean(isPdf && settings && !settings.mineruTokenConfigured);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (isEpub) fd.set("outputMode", outputMode);
      if (isPdf) {
        fd.set("isOcr", isOcr ? "true" : "false");
        fd.set("modelVersion", modelVersion);
        fd.set("language", language);
      }
      fd.set("assets", assets);
      const { id } = await api.createJob(fd);
      setFile(null);
      nav(`/jobs/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-xl font-semibold">新建转换任务</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传单个 PDF 或 EPUB。默认交付分片 Markdown 产物包（zip）。
        </p>
        {settings && !settings.mineruTokenConfigured && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            未配置 MinerU Token：EPUB 可用，PDF 需先到{" "}
            <Link className="underline" to="/settings">
              设置
            </Link>{" "}
            填写 Token。
          </div>
        )}
        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium">源文件</label>
            <input
              type="file"
              accept=".pdf,.epub,application/pdf,application/epub+zip"
              className="mt-1 block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {isEpub && (
            <div>
              <label className="text-sm font-medium">EPUB 输出</label>
              <select
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                value={outputMode}
                onChange={(e) => setOutputMode(e.target.value)}
              >
                <option value="split">分片（默认）</option>
                <option value="merge">合并单文件</option>
                <option value="both">分片 + 合并</option>
              </select>
            </div>
          )}

          {isPdf && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isOcr}
                onChange={(e) => setIsOcr(e.target.checked)}
              />
              启用 OCR（扫描件）
            </label>
          )}

          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "收起高级选项" : "高级选项"}
          </button>

          {showAdvanced && (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
              {isPdf && (
                <>
                  <label className="text-sm">
                    模型
                    <select
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                      value={modelVersion}
                      onChange={(e) => setModelVersion(e.target.value)}
                    >
                      <option value="pipeline">pipeline</option>
                      <option value="vlm">vlm</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    语言
                    <input
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="text-sm sm:col-span-2">
                图片资产
                <select
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2"
                  value={assets}
                  onChange={(e) => setAssets(e.target.value)}
                >
                  <option value="localize">本地化到 images/</option>
                  <option value="none">不要图片</option>
                </select>
              </label>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!file || submitting || pdfBlocked}
            className={cn(
              "inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground",
              (!file || submitting || pdfBlocked) && "opacity-50",
            )}
          >
            {submitting ? "提交中…" : "开始转换"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">任务列表</h2>
        <div className="mt-3 divide-y divide-border">
          {jobs.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无任务</p>
          )}
          {jobs.map((j) => (
            <Link
              key={j.id}
              to={`/jobs/${j.id}`}
              className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{j.source_name}</div>
                <div className="text-xs text-muted-foreground">
                  {j.source_type.toUpperCase()} · {j.progress_message || j.phase}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs",
                  j.status === "succeeded" && "bg-emerald-100 text-emerald-800",
                  j.status === "partial" && "bg-amber-100 text-amber-900",
                  j.status === "failed" && "bg-red-100 text-red-800",
                  j.status === "running" && "bg-sky-100 text-sky-900",
                  j.status === "queued" && "bg-muted text-muted-foreground",
                  j.status === "cancelled" && "bg-muted text-muted-foreground",
                )}
              >
                {statusLabel[j.status] ?? j.status}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
