# MiMo v1: preset voices only; no design/clone pipeline

MiMo TTS adapter in v1 targets only `mimo-v2.5-tts` with preset voice ids (e.g. 冰糖, Chloe). Voice design (`mimo-v2.5-tts-voicedesign`) and voice clone (`mimo-v2.5-tts-voiceclone`) are out of scope for v1 — no design-prompt-as-voice-asset and no reference-audio upload/storage for MiMo.

Fish Audio remains single-speaker with `reference_id` (voice model id from Fish’s library). In-app zero-shot reference upload and Fish multi-speaker dialogue tags stay out of the v1 studio path. Multi-character production continues via Open Pod work characters × per-line synthesis.
