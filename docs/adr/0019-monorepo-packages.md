# TypeScript monorepo: shared, server, web

Repository layout:

- `packages/shared` — pure domain/types and pure functions (effective-param merge, audio fingerprint, script import parsing). No Node I/O, no React.
- `apps/server` — HTTP API, SQLite, filesystem audio, job worker, MiMo/Fish provider adapters.
- `apps/web` — React + Vite UI only; talks to server over HTTP.

Dependency rule: web does not import server internals or open SQLite; provider adapters live on the server side. Shared is the only cross-cutting package for contracts used by both ends.
