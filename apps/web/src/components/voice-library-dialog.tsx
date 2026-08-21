import { useEffect, useRef, useState } from "react";
import { Heart, Loader2, Pause, Play, Search } from "lucide-react";
import { api, fishCoverUrl, type FishRemoteModel, type FishStatus } from "@/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TabKey = "explore" | "favorites";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function VoiceCard(props: {
  item: FishRemoteModel;
  selected?: boolean;
  actionLabel: string;
  playing?: boolean;
  onAction: () => void;
  onPreview: () => void;
}) {
  const cover = fishCoverUrl(props.item.coverImage);
  const chips = [
    ...props.item.languages.slice(0, 1),
    ...props.item.tags
      .filter((t) => /男|女|male|female|年轻|中年|old|young/i.test(t))
      .slice(0, 2),
  ];
  const favorited = props.item.liked || props.item.marked;

  return (
    <div
      className={cn(
        "group flex gap-3 rounded-xl border border-border/80 bg-card/90 p-3 transition-all hover:border-primary/35 hover:shadow-sm",
        props.selected && "border-primary bg-primary/5 shadow-sm",
      )}
    >
      <button
        type="button"
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border"
        onClick={props.onPreview}
        aria-label={props.playing ? "暂停试听" : "试听"}
      >
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
            {props.item.title.slice(0, 1)}
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          {props.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
        </span>
      </button>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">
              {props.item.title}
              {props.item.authorName ? (
                <span className="font-normal text-muted-foreground"> · {props.item.authorName}</span>
              ) : null}
            </div>
            {props.item.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{props.item.description}</p>
            ) : null}
          </div>
          {favorited ? (
            <Heart className="mt-0.5 h-4 w-4 shrink-0 fill-rose-500 text-rose-500" aria-label="已收藏" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {formatCount(props.item.taskCount)} · ♥ {formatCount(props.item.likeCount)}
          </div>
          <Button size="sm" variant={props.selected ? "secondary" : "default"} onClick={props.onAction}>
            {props.actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function VoiceLibraryDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "browse" | "pick";
  selectedReferenceId?: string | null;
  onPicked?: (payload: { voiceId: string; title: string; referenceId: string }) => void;
}) {
  const mode = props.mode ?? "browse";
  const [tab, setTab] = useState<TabKey>("explore");
  const [fish, setFish] = useState<FishStatus | null>(null);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("zh");
  const [sortBy, setSortBy] = useState<"score" | "task_count" | "created_at">("score");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(24);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [items, setItems] = useState<FishRemoteModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function load(nextPage = 1, nextTab = tab) {
    setLoading(true);
    setError(null);
    try {
      const f = fish ?? (await api.getFish());
      if (!fish) setFish(f);
      if (!f.hasApiKey) {
        setItems([]);
        setTotal(0);
        setHasMore(false);
        return;
      }
      const result = await api.listFishModels({
        pageNumber: nextPage,
        pageSize,
        title: query.trim() || undefined,
        language: language || undefined,
        sortBy,
        tab: nextTab,
      });
      setItems(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage(result.pageNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    void load(1, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, tab]);

  async function preview(item: FishRemoteModel) {
    if (playingId === item.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    try {
      setBusyId(item.id);
      let url = item.previewUrl;
      if (!url) {
        const r = await api.previewFishModel(item.id);
        url = r.url;
      }
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      await audio.play();
      setPlayingId(item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function pickOrImport(item: FishRemoteModel) {
    setBusyId(item.id);
    try {
      const voice = await api.importFishModel({
        referenceId: item.id,
        title: item.title,
        model: "s2.1-pro-free",
      });
      if (mode === "pick") {
        props.onPicked?.({
          voiceId: voice.id,
          title: voice.name,
          referenceId: item.id,
        });
        props.onOpenChange(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(96vw,72rem)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>选择语音</DialogTitle>
          <DialogDescription>
            {mode === "pick"
              ? "从官方音色库选择并绑定到当前角色。"
              : "浏览官方音色库；「已收藏」读取官方 liked/marked 状态。"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
          {(
            [
              ["explore", "探索"],
              ["favorites", "已收藏"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                tab === key
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(1, tab);
              }}
            />
          </div>
          <select
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="">全部语言</option>
          </select>
          <select
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="score">推荐</option>
            <option value="task_count">使用量</option>
            <option value="created_at">最新</option>
          </select>
          <Button
            variant="secondary"
            disabled={!fish?.hasApiKey || loading}
            onClick={() => void load(1, tab)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜索"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          {error && (
            <Alert variant="destructive" floating={false} className="mb-3" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}
          {!fish?.hasApiKey && (
            <Alert variant="warning" floating={false} className="mb-3" duration={false}>
              请先在设置中配置 Fish API Key。
            </Alert>
          )}

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {tab === "favorites"
                ? "官方账号下暂无 liked/marked 收藏音色。"
                : "没有匹配的音色。"}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <VoiceCard
                  key={item.id}
                  item={item}
                  selected={props.selectedReferenceId === item.id}
                  playing={playingId === item.id}
                  actionLabel={
                    busyId === item.id
                      ? "处理中…"
                      : mode === "pick"
                        ? props.selectedReferenceId === item.id
                          ? "已选择"
                          : "使用"
                        : "导入"
                  }
                  onAction={() => void pickOrImport(item)}
                  onPreview={() => void preview(item)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3 text-sm text-muted-foreground">
          <span>
            第 {page} 页
            {total > 0 ? ` · ${total.toLocaleString()} 条` : ""}
            {hasMore ? " · 还有更多" : ""}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => void load(page - 1, tab)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore || loading}
              onClick={() => void load(page + 1, tab)}
            >
              下一页
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
