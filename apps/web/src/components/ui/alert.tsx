import * as React from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full overflow-hidden rounded-lg border px-4 py-3 text-sm shadow-lg",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-800",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const DEFAULT_DURATION_MS = {
  default: 5_000,
  success: 4_000,
  warning: 6_000,
  destructive: 8_000,
} as const;

export type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

let alertHost: HTMLDivElement | null = null;

function getAlertHost() {
  if (typeof document === "undefined") return null;
  if (!alertHost || !alertHost.isConnected) {
    alertHost = document.createElement("div");
    alertHost.dataset.alertHost = "true";
    alertHost.className =
      "pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-end justify-end gap-2 p-4 sm:p-6";
    document.body.appendChild(alertHost);
  }
  return alertHost;
}

export function Alert({
  className,
  variant = "default",
  duration,
  onDismiss,
  floating = true,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    /**
     * Auto-dismiss countdown in ms.
     * `undefined` uses the variant default; `false` keeps the alert until dismissed.
     */
    duration?: number | false;
    onDismiss?: () => void;
    /**
     * When true (default), render as a bottom-right floating toast so page layout
     * does not shift. Set false for in-flow placement (e.g. inside dialogs).
     */
    floating?: boolean;
  }) {
  const resolvedDuration =
    !onDismiss || duration === false
      ? null
      : typeof duration === "number"
        ? Math.max(0, duration)
        : DEFAULT_DURATION_MS[variant ?? "default"];

  const [epoch, setEpoch] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);
  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Restart the countdown whenever the alert content / duration changes.
  React.useEffect(() => {
    setEpoch((n) => n + 1);
  }, [children, variant, resolvedDuration]);

  React.useEffect(() => {
    if (resolvedDuration == null) return;
    if (resolvedDuration === 0) {
      onDismissRef.current?.();
      return;
    }
    const timer = window.setTimeout(() => {
      onDismissRef.current?.();
    }, resolvedDuration);
    return () => window.clearTimeout(timer);
  }, [epoch, resolvedDuration]);

  const node = (
    <div
      role="alert"
      className={cn(
        alertVariants({ variant }),
        floating && "pointer-events-auto w-[min(100%,24rem)] max-w-full",
        className,
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        {onDismiss ? (
          <button
            type="button"
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="关闭"
            onClick={() => onDismiss()}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {resolvedDuration != null && resolvedDuration > 0 ? (
        <span
          key={epoch}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current/35"
          style={{ animation: `alert-countdown ${resolvedDuration}ms linear forwards` }}
        />
      ) : null}
    </div>
  );

  if (!floating) return node;
  if (!mounted) return null;
  const host = getAlertHost();
  if (!host) return null;
  return createPortal(node, host);
}
