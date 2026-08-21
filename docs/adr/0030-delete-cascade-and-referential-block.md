# Deletes cascade for content trees; block when references remain

Deleting a line, chapter, or work removes metadata and the corresponding audio files (line slots / export artifacts) immediately. v1 has no trash/recycle bin and no global undo stack; destructive actions may use a confirm dialog.

Work characters, voices, and provider connections use referential integrity blocks:

- Cannot delete a work character while any line still references it
- Cannot delete a voice while any work character still references it
- Cannot delete a provider connection while any voice still uses it

Users must rebind or remove dependents first. Silent cascade-nulling of references is rejected for v1 to avoid accidental cast breakage.
