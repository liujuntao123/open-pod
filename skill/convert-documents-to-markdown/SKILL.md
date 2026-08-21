---
name: convert-documents-to-markdown
description: >
  Convert local PDF and EPUB files into a standard Markdown package
  (parts, full.md, images, manifest, result.zip) under the shared
  Open Pod convert data directory (`OPEN_POD_CONVERT_DATA_DIR`, default
  `~/.open-pod-convert/skill-jobs/`). Use this skill whenever the user
  wants PDF/EPUB → Markdown, 文档转 Markdown, 批量转换 PDF/EPUB,
  MinerU 解析 PDF, 转换失败恢复/重试, 结构验收, 或交付标准转换产物包 —
  even if they do not say the skill name, and even for plain EPUB
  chapter export. Prefer this over ad-hoc parsing, calling the convert
  web service, or the epub2md-cli skill. Do NOT use epub2md-cli for
  ordinary EPUB→Markdown unless the user explicitly names epub2md /
  epub2md-cli or asks for raw CLI / metadata / TOC / sections / unzip
  inspection without a standard conversion package.
---

# Convert documents to Markdown

Standalone companion skill for Open Pod document conversion. It does **not** call the convert web service, SQLite, or workspace packages. Outputs share the convert data root with the web app:

| Owner | Path under `$OPEN_POD_CONVERT_DATA_DIR` (default `~/.open-pod-convert`) |
|-------|------------------------------------------------------------------------|
| Web service | `jobs/` |
| This skill | `skill-jobs/<jobId>/` |

## Prerequisites

- Node.js ≥ 20
- For PDF: MinerU token via (first hit wins)
  1. `OPEN_POD_CONVERT_SKILL_MINERU_TOKEN`
  2. `OPEN_POD_CONVERT_MINERU_TOKEN`
  3. `$OPEN_POD_CONVERT_DATA_DIR/secrets.json` → `mineruApiToken`
- For EPUB: local `epub2md` resolved from this skill's `node_modules` (installed below)

### Install skill dependencies

Dependencies live **only** in this skill directory. Never install into the user's project.

```bash
node /home/admin1/.agents/skills/convert-documents-to-markdown/scripts/ensure-deps.mjs
# or: cd .../convert-documents-to-markdown && npm install
```

The convert CLI auto-runs `ensure-deps` on first use unless `--skip-install`.

Skill source of truth in the monorepo:

`/home/admin1/myspace/open-pod/skill/convert-documents-to-markdown/`

Discovered locally via symlink:

`/home/admin1/.agents/skills/convert-documents-to-markdown` → repo path above

## When to use / not use

| User intent | Skill |
|-------------|--------|
| PDF/EPUB → Markdown, batch convert, standard package, MinerU, retry, validation | **this skill** |
| Explicit `epub2md` / `epub2md-cli`, or raw `--info` / `--structure` / `--sections` / `--unzip` | `epub2md-cli` only |
| Plain “export EPUB chapters” without naming epub2md | **this skill** (not epub2md-cli) |

## Job layout

```text
skill-jobs/<jobId>/
├── input/                 # snapshot of source file
├── work/                  # intermediate + state.json + logs
├── output/
│   ├── markdown/
│   │   ├── full.md
│   │   └── parts/*.md
│   ├── images/
│   └── manifest.json
└── result.zip
```

- Every user-initiated convert creates a **new** `jobId` (never silent overwrite).
- Retry of failed PDF segments keeps the same `jobId` (`--retry`).
- Do not manage or clean `jobs/` (web service).

## Books archive (my-books)

Successful conversions are **also** promoted into a human-maintained library
(default: `~/myspace/my-books`, typically the git repo
https://github.com/liujuntao123/my-books).

```text
my-books/
├── README.md
├── .gitignore
└── books/
    └── <book-slug>/
        ├── input/           # source snapshot (PDF/EPUB)
        ├── output/          # markdown package
        │   ├── markdown/
        │   ├── images/
        │   └── manifest.json
        ├── result.zip
        ├── book.json
        └── README.md
```

- Runtime jobs remain under `skill-jobs/<jobId>/` (retry/debug).
- Archive folders put **input + output together** for long-term maintenance.
- Same title again creates `slug__<shortJobId>` unless you archive into an existing folder intentionally later.

### Env

| Variable | Purpose |
|----------|---------|
| `OPEN_POD_CONVERT_BOOKS_DIR` | Archive root (preferred) |
| `MY_BOOKS_DIR` | Alias for archive root |

Resolution: env → `~/myspace/my-books` if present → `~/my-books`.

### Commands

```bash
# Convert + archive (default) into my-books
node "$SKILL_ROOT/scripts/convert.mjs" "/path/to/book.epub"

# Convert + archive + git commit/push
node "$SKILL_ROOT/scripts/convert.mjs" "/path/to/book.pdf" --sync

# Disable archive for a one-off run
node "$SKILL_ROOT/scripts/convert.mjs" "/path/to/book.epub" --no-archive

# Promote an existing skill-job into books/
node "$SKILL_ROOT/scripts/convert.mjs" --archive-only <jobId>

# Commit & push archive only
node "$SKILL_ROOT/scripts/sync-books.mjs"
node "$SKILL_ROOT/scripts/sync-books.mjs" --message "add book X"
```

`--sync` requires git write access to the my-books remote. Prefer confirming with the user before pushing when running as an agent.

## Default behavior

- Output mode default: **split** (`markdown/parts/*` is authoritative; `full.md` is concatenated convenience).
- EPUB native merge/both only when user asks (`--output-mode merge|both`).
- No default semantic cleanup, chapter drop, or LLM rewrite.
- Structural validation must pass before reporting full success.

## Commands

Resolve `SKILL_ROOT` to this skill directory (symlink or repo path).

### Convert one or more files

```bash
node "$SKILL_ROOT/scripts/convert.mjs" "/path/to/book.pdf"
node "$SKILL_ROOT/scripts/convert.mjs" "/path/a.epub" "/path/b.pdf"
```

Useful flags:

```bash
--output-mode split|merge|both   # EPUB; default split
--ocr true|false                 # PDF; omit for auto text-layer probe
--language ch
--model-version pipeline|vlm
--assets localize|none
--data-dir /custom/convert-root
--books-dir /path/to/my-books
--archive / --no-archive      # default: archive succeeded|partial
--sync                        # git commit+push my-books after archive
--json
--skip-install
```

### Retry failed PDF segments (same jobId)

```bash
node "$SKILL_ROOT/scripts/convert.mjs" --retry <jobId>
```

Only after the user explicitly agrees. Do not auto-retry.

### Validate an existing package

```bash
node "$SKILL_ROOT/scripts/convert.mjs" --validate <jobId>
```

## Agent workflow

1. Confirm source path(s) and intent (convert vs inspect-only).
2. Ensure deps (`ensure-deps.mjs` or let convert auto-install).
3. For PDF without explicit OCR: CLI auto-detects; if uncertain, ask user and re-run with `--ocr true|false`.
4. Run `convert.mjs` with absolute paths.
5. Report using the CLI summary:
   - **succeeded**: jobId, skill-job paths, **archive bookDir** (`books/<slug>/`), part count, warnings
   - **partial**: not full success; list missing/failed segments; offer same-jobId retry; still archives by default
   - **failed**: reason + preserved `skill-jobs/<jobId>/`; no fake success; no archive
6. Batch: summarize `succeeded N / partial M / failed K`, then per-file.
7. When the user wants remote backup, run with `--sync` or `sync-books.mjs` (confirm before push if policy requires).

## Proxy (PDF / MinerU)

Selected once before submit, then pinned for the job:

1. `OPEN_POD_CONVERT_SKILL_PROXY_URL`
2. `HTTPS_PROXY` / `HTTP_PROXY`
3. Direct precheck
4. Fallback probe `http://127.0.0.1:7897`

Never switch proxy mid-job and blindly re-submit (billing risk).

## Security

- Never write token or proxy credentials into `manifest.json`, logs, or `result.zip`.
- Never put absolute local source paths into the delivered manifest (basename only).

## Routing note for epub2md-cli

Ordinary EPUB→Markdown belongs here. Only hand off to `epub2md-cli` when the user **explicitly** names it or requests raw inspect CLI behavior.

Design contract: monorepo `docs/convert-skill-design.md` and ADR-0068.
