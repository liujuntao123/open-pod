# Flush autosave, then synthesize from an immutable snapshot

Before enqueueing synthesis, the client/server path must flush pending debounced autosave so the queue intent matches what the user sees. Each line job stores a Synthesis Snapshot (text, resolved voice identity, effective params) at enqueue time.

The worker uses only that snapshot for the provider call and for the fingerprint written with the slot. Editing the line while queued/running remains allowed. If the live editor state diverges after success, the new slot is immediately stale relative to current state (fingerprint mismatch)—no lock-during-run and no auto-cancel-on-edit.
