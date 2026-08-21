# New works default to Fish; existing works backfill Fish

Every work has a required TTS provider kind. New works default to `fish` (user may choose `mimo` at create). Existing rows without a kind are migrated to `fish`, matching the only production path shipped so far.

Leaving works unbound was rejected: the workbench needs a single provider surface authority. Inferring kind from character voices was rejected for migration because historical data is Fish-only and inference is ambiguous for unbound casts.
