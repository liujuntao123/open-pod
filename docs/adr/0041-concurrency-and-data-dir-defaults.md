# Default TTS concurrency 1 (configurable); data dir ~/.open-pod

Online TTS worker concurrency defaults to 1 concurrent provider request and is configurable in studio settings/config to respect rate limits.

Studio data directory defaults to `~/.open-pod` (per-user). Path is overridable via config/env for dev. Do not default to an in-repo `./data` path that risks being committed. SQLite, secrets, line audio, and exports live under this root.
