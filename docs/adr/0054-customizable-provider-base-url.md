# Customizable builtin TTS provider base URLs

Studio keeps a single builtin Provider Connection per TTS kind (`fish`, `mimo`). Users may now override each connection’s `base_url` in Settings (in addition to the API key). Defaults remain the official endpoints:

- Fish Audio: `https://api.fish.audio`
- MiMo TTS: `https://api.xiaomimimo.com/v1`

Empty / null base URL on save resets to the kind’s default. Startup `ensureBuiltin` no longer force-resets a customized `base_url` (it only ensures the connection row exists and keeps the display name in sync).

This exists because some plans expose different API hosts—for example MiMo Token Plan—without changing request shape. Multi-connection management and per-work base-URL overrides remain out of scope.
