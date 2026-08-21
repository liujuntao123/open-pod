# Script LLM performance dialect follows work provider

Structured script layout (`角色名：台词`, fullwidth colon import) stays provider-agnostic. The optional performance-markup dialect inside line text does not.

Script generation prompts switch by the work’s TTS provider kind:

- **Fish:** keep the existing Fish S2 square-bracket cue style in the system prompt.
- **MiMo:** emit official-style assistant-side tags in line text (`(开心)`, `[叹气]`, …). Character-level performance remains `style_instruction` (parameter cascade / user channel), not pasted into the script body. Do not emit Fish S2 process tags (`[思考]`, `[停顿]`, …).

A single Fish-oriented prompt for all works was rejected: it would stamp Fish tags into MiMo assistant content and fight the MiMo adapter contract. Clean-only MiMo dialogue with tags as a hidden advanced path was rejected once we decided LLM should actively help with MiMo tags (ADR-0067).
