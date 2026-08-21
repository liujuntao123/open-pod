# Fish default model is s2.1-pro-free; voice library uses GET /model

Fish TTS model header defaults to `s2.1-pro-free` for new voices and adapter fallbacks.

Official voice library listing is available via `GET https://api.fish.audio/model` (Bearer auth) with pagination/filter query params. Open Pod proxies this through provider connections and treats item `_id` as the TTS `reference_id` for import into the local voice library. Manual reference_id entry remains supported.
