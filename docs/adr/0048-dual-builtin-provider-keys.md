# Dual builtin provider connections; settings are per-kind API keys

Studio ensures exactly one builtin Provider Connection for each supported TTS provider kind (`fish`, `mimo`). Users configure the API key (and see connection readiness) in Studio Settings as two parallel sections—not a multi-connection manager.

This extends ADR-0043’s Fish-only builtin model to MiMo with the same shape. Binding works to a provider kind (ADR-0047) resolves to that kind’s builtin connection for secrets and outbound calls. Multi-connection lists and per-work connection overrides remain out of scope.

Superseded in part by ADR-0054: each builtin connection’s `base_url` is now user-editable in Settings (defaults unchanged); still not multi-connection CRUD.
