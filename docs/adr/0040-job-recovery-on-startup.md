# On startup, mark leftover running jobs failed; keep queued

When the studio server process starts, any jobs left in `running` are marked `failed` with an interrupted/process-restart message. They are not automatically re-enqueued (avoids duplicate Fish charges). Jobs still `queued` remain queued and are consumed by the worker as usual.

Users re-trigger synthesis explicitly for interrupted lines.
