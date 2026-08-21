# v1 preview is per-line slot audio in the studio UI

Preview plays the WAV in the line’s audio slot. No slot → control disabled. Stale slot → still playable with stale indicator. While a line job is running, keep playing the previous slot if present.

When a new synthesis for that line succeeds during preview of the same line, interrupt and switch to the new file (better for voice/param trials). Continuous chapter playback from a line is deferred; chapter listening in v1 is via export or a later feature.
