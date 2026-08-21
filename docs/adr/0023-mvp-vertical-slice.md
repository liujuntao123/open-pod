# v1 first vertical slice: Fish Audio first, end-to-end audio

The first shippable cut is intentionally thin:

- First online TTS adapter: **Fish Audio** (`POST /v1/tts`, single-speaker `reference_id`)
- Work / chapter / structured line CRUD
- Work characters bound to voices
- Manual single-line synthesize + preview
- Chapter export of full-track audio (with missing-audio hard block)

Deliberately deferred in this cut: MiMo adapter, marked-text import, chapter-wide batch queue UX polish, book-level export niceties, desktop shell, voice design/clone.

Architecture still follows earlier ADRs (shared/server/web, param cascade, fingerprint single-slot, REST jobs) so MiMo and batch/import land as additive work after the loop can produce real audio.
