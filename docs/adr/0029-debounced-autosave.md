# Workbench metadata uses debounced autosave

Structured script lines, work characters, and parameter overrides persist via debounced autosave from the workbench (order of ~400ms after edits). There is no explicit Save as the primary path in v1.

Autosave writes metadata only—never triggers synthesis. Line audio slots and job records are written by the server on synthesis/export success paths, not by the editor autosave channel. On navigation away from a chapter/work, flush pending debounced writes first. Autosave failure keeps the editor dirty and surfaces an error for retry.
