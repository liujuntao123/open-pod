# TypeScript full-stack local studio

v1 is a TypeScript monorepo: Node backend (HTTP API + synthesis worker) with SQLite, and a React + Vite web UI. Shared types may live in a workspace package.

Python/Go backends were rejected for v1 to keep one language across editor UX, API, and online-TTS HTTP adapters. Local model inference is out of scope; the backend is an orchestrator and file/job owner, not a training runtime.
