# Builtin Fish only; voices come from official library import

Open Pod no longer exposes custom provider connection management or manual local voice-library authoring for Fish. A single builtin Fish Audio connection is ensured at startup. Users only supply an API key.

Voices are obtained by importing entries from Fish’s official `GET /model` library. Local voice rows remain as imported assets bound to characters, but there is no “hand-enter reference_id as primary UX” surface.

Outbound Fish HTTP uses a proxy-aware client (default `http://127.0.0.1:7897` when env proxies are unset) to work under WSL/network constraints. Set `OPEN_POD_HTTP_PROXY=direct` to disable.
