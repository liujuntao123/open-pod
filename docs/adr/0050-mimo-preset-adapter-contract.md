# MiMo preset adapter contract (official v2.5 TTS)

Source of truth for request shape: [MiMo speech synthesis v2.5](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5).

v1 implements only model `mimo-v2.5-tts` (preset voices). Voice design and voice clone models stay out of scope (ADR-0017).

**Identity (Voice.config / fingerprint):** `model` (fixed `mimo-v2.5-tts`) + `voice` (preset id → `audio.voice`). Canonical `voiceIdentity`: `{ provider: "mimo", model, voice }`.

**Parameter schema (overridable):** only `style_instruction` → optional `messages` entry with `role: user`. Empty/absent means omit the user message. Line text is always `role: assistant` content. Adapter does not auto-inject audio tags; tags in assistant text remain an advanced, text-embedded path only.

**Adapter-fixed:** base URL from builtin connection (`https://api.xiaomimimo.com/v1`), auth header `api-key`, non-streaming `audio.format: "wav"`, decode `message.audio.data` base64 to WAV bytes for the line-audio slot. Streaming/`pcm16` is not the v1 primary path.

**Preset catalog:** nine official voice ids (`mimo_default`, `冰糖`, `茉莉`, `苏打`, `白桦`, `Mia`, `Chloe`, `Milo`, `Dean`) as a read-only list in `packages/shared`, not a runtime remote list API.

UI keys, schema keys, and adapter request mapping must stay the same names—no display-only aliases.
