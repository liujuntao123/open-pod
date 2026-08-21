# First TTS adapters: MiMo TTS and Fish Audio

v1 ships two concrete online providers, not a generic OpenAI-compatible placeholder:

1. **MiMo TTS** — Xiaomi MiMo speech synthesis (`https://api.xiaomimimo.com/v1` style chat.completions). Models include `mimo-v2.5-tts` (preset voices), `mimo-v2.5-tts-voicedesign`, and `mimo-v2.5-tts-voiceclone`. Request shape uses assistant-message text, optional user-message style/design instructions, and `audio.voice` / `audio.format`. Auth uses MiMo API key headers. Docs: https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5

2. **Fish Audio TTS** — `POST https://api.fish.audio/v1/tts` with Bearer auth and `model` header (`s1` / `s2-pro` / `s2.1-pro` / `s2.1-pro-free`). Body centers on `text`, `reference_id` (or references), and prosody/sampling fields; response is audio bytes. Docs: https://docs.fish.audio/features/text-to-speech and OpenAPI TTS endpoint.

These APIs differ hard (chat+base64 vs dedicated TTS binary). That is exactly why Effective Params + per-provider Parameter Schema + adapters exist. Studio multi-character production remains line-level synthesis in Open Pod; Fish multi-speaker dialogue tags are not the script model.
