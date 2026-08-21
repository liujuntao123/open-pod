# Official favorites are read-only; previews use sample audio

Local `voice_favorites` storage and write APIs were removed. The Favorites tab reads Fish official list items where `liked || marked` is true. There is no documented public favorite-write endpoint in Fish OpenAPI.

Voice preview prefers the model’s official sample audio URL (`samples[].audio`). If absent, the studio synthesizes a short phrase with that `reference_id` and streams a temporary WAV.

Default explore language filter is Chinese (`language=zh`).
