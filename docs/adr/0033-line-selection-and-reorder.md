# Line focus vs multi-select; reorder does not stale audio

The workbench distinguishes focus (current line) from multi-selection. “Synthesize current line” uses focus; “synthesize selected lines” uses the selection, falling back to the current line when the selection is empty.

v1 supports insert, delete, multi-select, and drag reorder. Merge/split lines are out of scope. Reorder only changes chapter order and must not change Audio Fingerprints—existing line audio remains fresh after reorder. Changing a line’s character binding can stale that line’s slot when a fingerprint mismatch appears.
