# Work provider kind is generate authority; rebind lives on the workbench

Line generate resolve and the job worker select the TTS adapter from the work’s provider kind (snapshotted at enqueue), not by opportunistically following a mismatched voice. Preconditions require: non-empty text, character voice bound, `voice.provider == work.provider`, and the builtin connection for that kind has an API key.

Workbench exposes work provider rebind with an explicit confirmation that states unbind/clear-override/stale consequences (domain rules in ADR-0047). Studio Settings only holds per-kind keys, not per-work binding. Create-time-only binding without later rebind was rejected as too rigid; voice-follows-generate (ignoring work kind) was rejected because it reintroduces mixed stacks and UI/API divergence.
