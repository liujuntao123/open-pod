# Single-slot line audio; manual synthesize only; fingerprint marks stale

Each line has at most one Line Audio slot. Synthesis never runs as a side effect of editing text, voice, or params — only on explicit user action (single line, selection, or chapter batch as many line jobs).

On successful synthesize, overwrite that line’s slot and store the Audio Fingerprint of what was rendered. Fingerprint includes normalized text, resolved voice identity, canonical Effective Params, and adapter/result format version — not chapter order.

If the slot still has audio but the fingerprint no longer matches the current script/params, the audio is Stale: still usable for preview/assembly so the user is not left silent, but UI must show stale until the user synthesizes again (which overwrites the slot). No multi-version history browser in v1.
