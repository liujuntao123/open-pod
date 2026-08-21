# Parameter cascade: Voice → Work Character → Line

Readable performance needs layered control. Effective synthesis params are computed only from:

1. Voice defaults (from voice config / provider schema defaults)
2. Work Character parameter override (partial map)
3. Line parameter override (partial map)

Later layers win on key conflict. Overrides are partial maps of schema-declared keys only — never a full copy of a provider-private request body as the sole store. v1 has no chapter-level or work-level speech-param layer; do not invent silent fourth layers in UI state.

Provider schema defines which keys exist and how they validate; cascade only merges values, it does not redefine schema.
