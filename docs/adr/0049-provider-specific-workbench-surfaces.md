# Shared workbench shell; provider-specific voice and param surfaces

The workbench keeps one shell for script editing, generate/compose actions, jobs, and BGM. Only provider-coupled sub-surfaces swap by the work’s TTS provider kind: voice pick/import (Fish official library modal vs MiMo preset picker), and character/line param forms driven by that provider’s Parameter Schema.

Two full workbench page forks were rejected (duplication and drift). UI field keys must be the same keys declared in the provider Parameter Schema and consumed by the adapter when building the engine request—no parallel display-only vocabulary that the adapter reinterprets ad hoc.

MiMo preset voices: read-only catalog in the adapter/shared package; selecting a preset lazily ensures a local Voice row (deduped by voice identity) then binds the work character. No MiMo design/clone pipeline (ADR-0017). Fish keeps official-library import into the local voice library (ADR-0043).

MiMo script generation uses a provider-aware performance dialect that embeds MiMo audio tags in line text; character style still uses `style_instruction` (ADR-0052, ADR-0067).
