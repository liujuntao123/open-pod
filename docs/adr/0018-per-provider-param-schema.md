# Per-provider parameter schemas; no unified emotion enum

Effective params are provider-specific keys declared by each adapter’s Parameter Schema. The UI renders and validates from that schema. There is no cross-provider semantic layer (e.g. a global emotion enum) that adapters must map into.

Examples for v1:

- **MiMo (preset):** voice id + optional `style_instruction` (natural-language performance control → user message). `style_instruction` may be set at voice default, work-character override, or line override.
- **Fish Audio:** `reference_id`, model header choice, and documented sampling/prosody fields (speed, volume, temperature, etc.).

Engine-specific tags embedded in line text are not the primary control path in v1. Adapters own request/response translation only.
