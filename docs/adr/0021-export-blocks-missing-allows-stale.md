# Chapter composition allows partial assembly; missing lines are skipped with confirmation

User-facing terms: **生成** = line TTS → line audio; **合成** = concatenate line audio into chapter audio; **下载** = save the composed chapter WAV to the user machine.

Chapter composition requires at least one line with a Line Audio slot. Empty slots do not hard-block the whole chapter: assembly skips missing lines in order and the UI must warn / confirm the skip count. Stale line audio (fingerprint mismatch) still does not hard-block: assembly may use the slot contents, but the UI must warn that text/voice/params changed since generate.

Zero playable line audio still hard-blocks composition. No silent skip of missing lines and no silent treatment of stale as fresh. A later “queue generate for missing/stale then compose” action remains compatible.

Code/API identifiers may still say `synthesize` / `export`; UI copy must use 生成 / 合成 / 下载.
