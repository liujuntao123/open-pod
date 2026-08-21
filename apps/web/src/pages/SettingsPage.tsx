import { useEffect, useState } from "react";
import { api, type FishStatus, type MimoStatus, type ScriptLlmStatus } from "../api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsPage() {
  const [fish, setFish] = useState<FishStatus | null>(null);
  const [mimo, setMimo] = useState<MimoStatus | null>(null);
  const [scriptLlm, setScriptLlm] = useState<ScriptLlmStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [mimoApiKey, setMimoApiKey] = useState("");
  const [fishBaseUrl, setFishBaseUrl] = useState("");
  const [mimoBaseUrl, setMimoBaseUrl] = useState("");
  const [fishUrlSaving, setFishUrlSaving] = useState(false);
  const [mimoUrlSaving, setMimoUrlSaving] = useState(false);
  const [concurrency, setConcurrency] = useState(1);
  const [dataDir, setDataDir] = useState("");

  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmSaving, setLlmSaving] = useState(false);

  async function refresh() {
    try {
      const [f, m, settings] = await Promise.all([
        api.getFish(),
        api.getMimo(),
        api.settings(),
      ]);
      setFish(f);
      setMimo(m);
      setFishBaseUrl(f.baseUrl);
      setMimoBaseUrl(m.baseUrl);
      setScriptLlm(settings.scriptLlm);
      setLlmBaseUrl(settings.scriptLlm.baseUrl);
      setLlmModel(settings.scriptLlm.model);
      setConcurrency(settings.ttsConcurrency);
      setDataDir(settings.dataDir);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">工作室设置</h1>
        {dataDir ? (
          <p className="mt-1 text-sm text-muted-foreground">数据目录：{dataDir}</p>
        ) : null}
      </div>

      {error && (
        <Alert variant="destructive" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Fish Audio</h2>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{fish?.name ?? "Fish Audio"}</Badge>
            <Badge variant={fish?.hasApiKey ? "success" : "warning"}>
              {fish?.hasApiKey ? "已配置 Key" : "未配置 Key"}
            </Badge>
            {fish?.isCustomBaseUrl ? (
              <Badge variant="warning">自定义 URL</Badge>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Base URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={fishBaseUrl}
                onChange={(e) => setFishBaseUrl(e.target.value)}
                placeholder={fish?.defaultBaseUrl ?? "https://api.fish.audio"}
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  disabled={fishUrlSaving}
                  onClick={async () => {
                    setFishUrlSaving(true);
                    try {
                      const next = await api.setFishBaseUrl(fishBaseUrl.trim() || null);
                      setFish(next);
                      setFishBaseUrl(next.baseUrl);
                      setMessage(
                        next.isCustomBaseUrl
                          ? "Fish Base URL 已保存"
                          : "Fish Base URL 已恢复默认",
                      );
                      setError(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setFishUrlSaving(false);
                    }
                  }}
                >
                  {fishUrlSaving ? "保存中…" : "保存 URL"}
                </Button>
                {fish?.isCustomBaseUrl ? (
                  <Button
                    variant="outline"
                    disabled={fishUrlSaving}
                    onClick={async () => {
                      setFishUrlSaving(true);
                      try {
                        const next = await api.setFishBaseUrl(null);
                        setFish(next);
                        setFishBaseUrl(next.baseUrl);
                        setMessage("Fish Base URL 已恢复默认");
                        setError(null);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setFishUrlSaving(false);
                      }
                    }}
                  >
                    恢复默认
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              默认 {fish?.defaultBaseUrl ?? "https://api.fish.audio"}；留空保存将恢复默认
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={fish?.hasApiKey ? "已保存，输入新 Key 可覆盖" : "粘贴 Fish API Key"}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={async () => {
                  try {
                    const next = await api.setFishApiKey(apiKey.trim() || null);
                    setFish(next);
                    setApiKey("");
                    setMessage(next.hasApiKey ? "API Key 已保存" : "API Key 已清除");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                保存 Key
              </Button>
              {fish?.hasApiKey && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const next = await api.setFishApiKey(null);
                      setFish(next);
                      setMessage("API Key 已清除");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  清除
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border/40 pt-6">
        <div>
          <h2 className="text-base font-semibold">MiMo TTS</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Token Plan 等套餐可能使用不同的 Base URL，可在此覆盖。
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{mimo?.name ?? "MiMo TTS"}</Badge>
            <Badge variant={mimo?.hasApiKey ? "success" : "warning"}>
              {mimo?.hasApiKey ? "已配置 Key" : "未配置 Key"}
            </Badge>
            {mimo?.isCustomBaseUrl ? (
              <Badge variant="warning">自定义 URL</Badge>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Base URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={mimoBaseUrl}
                onChange={(e) => setMimoBaseUrl(e.target.value)}
                placeholder={mimo?.defaultBaseUrl ?? "https://api.xiaomimimo.com/v1"}
                className="min-w-0 flex-1"
              />
              <div className="flex shrink-0 gap-2">
                <Button
                  disabled={mimoUrlSaving}
                  onClick={async () => {
                    setMimoUrlSaving(true);
                    try {
                      const next = await api.setMimoBaseUrl(mimoBaseUrl.trim() || null);
                      setMimo(next);
                      setMimoBaseUrl(next.baseUrl);
                      setMessage(
                        next.isCustomBaseUrl
                          ? "MiMo Base URL 已保存"
                          : "MiMo Base URL 已恢复默认",
                      );
                      setError(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setMimoUrlSaving(false);
                    }
                  }}
                >
                  {mimoUrlSaving ? "保存中…" : "保存 URL"}
                </Button>
                {mimo?.isCustomBaseUrl ? (
                  <Button
                    variant="outline"
                    disabled={mimoUrlSaving}
                    onClick={async () => {
                      setMimoUrlSaving(true);
                      try {
                        const next = await api.setMimoBaseUrl(null);
                        setMimo(next);
                        setMimoBaseUrl(next.baseUrl);
                        setMessage("MiMo Base URL 已恢复默认");
                        setError(null);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setMimoUrlSaving(false);
                      }
                    }}
                  >
                    恢复默认
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              默认 {mimo?.defaultBaseUrl ?? "https://api.xiaomimimo.com/v1"}；留空保存将恢复默认
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                value={mimoApiKey}
                onChange={(e) => setMimoApiKey(e.target.value)}
                placeholder={mimo?.hasApiKey ? "已保存，输入新 Key 可覆盖" : "粘贴 MiMo API Key"}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                onClick={async () => {
                  try {
                    const next = await api.setMimoApiKey(mimoApiKey.trim() || null);
                    setMimo(next);
                    setMimoApiKey("");
                    setMessage(next.hasApiKey ? "MiMo API Key 已保存" : "MiMo API Key 已清除");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              >
                保存 Key
              </Button>
              {mimo?.hasApiKey && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const next = await api.setMimoApiKey(null);
                      setMimo(next);
                      setMessage("MiMo API Key 已清除");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  清除
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border/40 pt-6">
        <div>
          <h2 className="text-base font-semibold">剧本生成 LLM</h2>
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={scriptLlm?.hasApiKey ? "success" : "warning"}>
              {scriptLlm?.hasApiKey ? "已配置 Key" : "未配置 Key"}
            </Badge>
            {scriptLlm?.model ? (
              <span className="text-muted-foreground">Model: {scriptLlm.model}</span>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Base URL</Label>
              <Input
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Model ID</Label>
              <Input
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="gpt-4o-mini"
              />
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder={
                  scriptLlm?.hasApiKey ? "已保存，输入新 Key 可覆盖" : "粘贴 OpenAI 兼容 API Key"
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={llmSaving}
              onClick={async () => {
                setLlmSaving(true);
                try {
                  const payload: {
                    baseUrl: string;
                    model: string;
                    apiKey?: string | null;
                  } = {
                    baseUrl: llmBaseUrl.trim(),
                    model: llmModel.trim(),
                  };
                  if (llmApiKey.trim()) payload.apiKey = llmApiKey.trim();
                  const next = await api.setScriptLlm(payload);
                  setScriptLlm(next);
                  setLlmBaseUrl(next.baseUrl);
                  setLlmModel(next.model);
                  setLlmApiKey("");
                  setMessage("剧本 LLM 配置已保存");
                  setError(null);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setLlmSaving(false);
                }
              }}
            >
              {llmSaving ? "保存中…" : "保存配置"}
            </Button>
            {scriptLlm?.hasApiKey ? (
              <Button
                variant="outline"
                disabled={llmSaving}
                onClick={async () => {
                  setLlmSaving(true);
                  try {
                    const next = await api.setScriptLlm({ apiKey: null });
                    setScriptLlm(next);
                    setMessage("剧本 LLM API Key 已清除");
                    setError(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setLlmSaving(false);
                  }
                }}
              >
                清除 Key
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border/40 pt-6">
        <div>
          <h2 className="text-base font-semibold">任务并发</h2>
        </div>
        <div className="flex items-center gap-3">
          <Input
            className="w-24"
            type="number"
            min={1}
            max={4}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
          />
          <Button
            onClick={async () => {
              try {
                await api.updateSettings(concurrency);
                setMessage("并发已更新");
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            保存
          </Button>
        </div>
      </section>
    </div>
  );
}
