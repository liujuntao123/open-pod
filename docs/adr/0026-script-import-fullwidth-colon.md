# Script import uses fixed full-width colon marking

v1 marked-text import parses lines as `角色名：台词` with the **full-width colon `：` only** — half-width `:` is not accepted as a role separator.

Rules:

- Match display name before `：` to a work character; if missing, auto-create a work character without a bound voice
- `旁白` / `narrator` (case-insensitive) map to the narrator work character
- Blank lines are dropped
- Lines without the prefix become narrator lines
- Import is one-shot into structured lines; no two-way sync with the source text

Bracket styles and multi-dialect separators are out of scope for v1.
