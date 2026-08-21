# Synthesize per line; assemble chapters from line audio

TTS runs at line granularity. Each successful synthesis produces Line Audio, which is the cache and retry unit. Chapter Audio is assembled by concatenating a chapter’s line audio in script order, applying a line-gap policy between lines.

User actions like “synthesize selection” or “synthesize chapter” enqueue many line jobs, not a different synthesis domain object. “Export chapter/work” is an assembly/export job that depends on required line audio being ready.

v1 preview is single-line or selected lines; chapter/work export is concatenation. Multi-track mix engineering is out of scope for v1.
