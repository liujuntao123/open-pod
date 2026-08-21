# Single Node process: HTTP API plus in-process job worker

Synthesis and export jobs are persisted in SQLite and consumed by a worker loop inside the same Node process as the HTTP API. v1 does not require a separate worker process or Redis.

Concurrency is intentionally low and configurable (default 1–2 online TTS calls) to respect provider rate limits. The UI observes job progress via polling or SSE against DB-backed job state; refresh-safe status is mandatory.

Synchronous “hold HTTP open until TTS finishes” is rejected for batch chapter synthesis.
