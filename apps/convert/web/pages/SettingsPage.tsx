import { useEffect, useState } from "react";
import { api, type Settings } from "../api";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [token, setToken] = useState("");
  const [retentionDays, setRetentionDays] = useState(7);
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyUrl, setProxyUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .settings()
      .then((s) => {
        setSettings(s);
        setRetentionDays(s.retentionDays);
        setProxyEnabled(s.proxyEnabled);
        setProxyUrl(s.proxyUrl || "");
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const body: Parameters<typeof api.saveSettings>[0] = {
        retentionDays,
        proxyEnabled,
        proxyUrl,
      };
      if (token.trim()) body.mineruToken = token.trim();
      const s = await api.saveSettings(body);
      setSettings(s);
      setToken("");
      setMsg("已保存");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function clearToken() {
    setSaving(true);
    try {
      const s = await api.saveSettings({ mineruToken: null });
      setSettings(s);
      setMsg("已清除 Token");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          配置保存在独立数据目录 <code>~/.open-pod-convert</code>，与 Open Pod 主服务分离。
        </p>

        <form className="mt-4 space-y-4" onSubmit={save}>
          <div>
            <label className="text-sm font-medium">MinerU Token</label>
            <p className="text-xs text-muted-foreground">
              当前：
              {settings?.mineruTokenConfigured
                ? settings.mineruTokenHint || "已配置"
                : "未配置"}
              （环境变量 OPEN_POD_CONVERT_MINERU_TOKEN 可覆盖）
            </p>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="粘贴新 Token（留空则不修改）"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
            {settings?.mineruTokenConfigured && (
              <button
                type="button"
                className="mt-2 text-sm text-destructive underline"
                onClick={() => void clearToken()}
              >
                清除已保存 Token
              </button>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">产物保留天数</label>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">0 表示不自动过期（仍可手动删除）。</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={proxyEnabled}
              onChange={(e) => setProxyEnabled(e.target.checked)}
            />
            启用出站 HTTP 代理（默认关）
          </label>

          {proxyEnabled && (
            <div>
              <label className="text-sm font-medium">代理 URL</label>
              <input
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="http://127.0.0.1:7897（可留空以使用环境变量）"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
              />
            </div>
          )}

          {msg && <div className="text-sm text-emerald-700">{msg}</div>}
          {err && <div className="text-sm text-destructive">{err}</div>}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </section>
    </div>
  );
}
