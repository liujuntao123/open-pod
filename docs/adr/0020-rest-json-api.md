# HTTP contract is REST + JSON; jobs are polled

The web UI talks to the local server via resource-oriented REST JSON endpoints (works, chapters, lines, characters, voices, provider connections, jobs, export). Shared DTO/validation types live in `packages/shared`.

Synthesis and export remain asynchronous jobs persisted in SQLite. Clients observe job state by polling job resources (or list endpoints). Holding an HTTP request open until online TTS finishes is not the primary API. tRPC is rejected for v1 to keep curl-debuggable local APIs. SSE can be added later without changing the job domain model.
