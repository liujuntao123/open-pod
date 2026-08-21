# Chapter assembly inserts a fixed 300ms line gap in v1

When concatenating line audio into chapter audio, insert 300ms of silence between adjacent lines. The value is a studio-global constant for v1, not a provider param and not a fourth speech-param layer. Per-work/per-chapter/per-line gap editing is deferred.
