# MiMo stays on the shared workbench; deepen dialect + style_instruction LLM

MiMo works use the **same Work Bench** as Fish: script step (including file upload / batch upload), start production, line generate, chapter compose. Provider-specific differences are limited to:

1. Voice pick (MiMo presets)
2. Character param UI (`style_instruction`, optional LLM templates)
3. Script performance dialect — MiMo script generation emits assistant-side tags in line text (`(开心)`, `[叹气]`, …), not Fish S2 bracket process tags

Character-level performance remains `style_instruction` (user channel). Line text may contain MiMo audio tags; the adapter sends them as `role: assistant` content and does not invent tags.

A dedicated dual-zone MiMo page, JSON “performance script package” APIs, director-dimension merge, and tag-inserter catalog were explored and **removed** to avoid forking the product IA. Prefer shared shell + dialect prompts over a second workbench.
