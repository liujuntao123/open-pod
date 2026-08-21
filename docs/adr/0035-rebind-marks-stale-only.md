# Voice rebind and voice default edits only mark stale

Changing a work character’s bound voice, or changing a voice’s identity/default params such that Effective Params/fingerprint diverge, marks affected lines’ slots stale when audio exists. v1 does not auto-enqueue resynthesis and does not bulk-clear slots on rebind.

Users resynthesize explicitly (current/selected/filtered). Export rules still apply: missing blocks, stale warns.
