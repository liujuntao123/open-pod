# Layered error UX; Chinese UI copy in v1

Errors are presented by layer:

- Preconditions → disable controls with inline guidance
- Job failures → `failed` job state + short message + per-line marker; user may re-enqueue; no auto-retry
- Autosave failures → persistent banner until success/retry
- Export missing audio → hard block dialog listing lines
- Export stale audio → confirm warning, then allow

v1 does not build a global error-code product surface, push notifications, or undo stack. Studio UI copy is Chinese; code/logs may be English. i18n switching is deferred.
