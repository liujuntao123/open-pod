# Fish voices are manual reference_id entries with optional test synthesize

Creating a Fish voice in Studio Settings is manual: display name, `reference_id`, model header choice, and default schema params. v1 does not browse Fish’s remote voice library via OAuth/cookie.

An optional Voice Test action synthesizes a fixed short phrase with the current config for smoke-checking the connection and id. Test audio is ephemeral—not a line audio slot. Test failure does not hard-block saving the voice config.
