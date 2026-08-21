# SQLite for metadata; filesystem for audio

Authoritative studio metadata (works, chapters, structured lines, work characters, voices, provider connection metadata, jobs, line-audio slot indexes/fingerprints) lives in SQLite under the studio data directory. Line audio and export artifacts are ordinary files; the DB stores references (paths) and fingerprints, not audio blobs as the default.

JSON-per-work as the system of record was rejected for v1 because line jobs, stale state, and batch synthesis need straightforward queries and transactions. Human-readable backup/export can be added later without changing the primary store.
