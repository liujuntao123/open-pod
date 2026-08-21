# Synthesis actions: explicit enqueue with hard preconditions

Users only synthesize via explicit actions. v1 primary actions are “current line” and “selected lines”. “Whole chapter” and “missing/stale only” are the same line-job enqueue rules with different filters, not new job types.

Preconditions before enqueue: non-empty line text, work character bound to a voice, provider connection usable. Fail closed in the UI (disable/explain)—do not enqueue doomed jobs. Empty lines in a multi-line action are skipped without creating jobs.

If a line already has a queued or running line-synthesis job, additional clicks for that line are ignored (no duplicate enqueue). Provider/HTTP failures mark the job failed with a truncated readable error and do not auto-retry. Only succeeded jobs overwrite the line audio slot and fingerprint; failed jobs leave any previous slot intact.
