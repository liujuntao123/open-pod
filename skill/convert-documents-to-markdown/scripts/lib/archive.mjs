import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { safeFilename } from "./util.js";

/**
 * Books archive root (human-maintained library, typically the my-books git repo).
 *
 * Resolution order:
 * 1. OPEN_POD_CONVERT_BOOKS_DIR
 * 2. MY_BOOKS_DIR
 * 3. ~/myspace/my-books  (if exists)
 * 4. ~/my-books
 */
export function resolveBooksDir(env = process.env) {
  const fromEnv =
    env.OPEN_POD_CONVERT_BOOKS_DIR?.trim() || env.MY_BOOKS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const candidates = [
    path.join(os.homedir(), "myspace", "my-books"),
    path.join(os.homedir(), "my-books"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export function booksCollectionDir(booksDir = resolveBooksDir()) {
  return path.join(booksDir, "books");
}

/** Folder slug from source filename (no extension). */
export function bookSlugFromSourceName(sourceName) {
  const base = path.basename(sourceName, path.extname(sourceName));
  const slug =
    safeFilename(base, 80)
      .replace(/^\.+/, "")
      .replace(/[_.-]+$/g, "") || "book";
  return slug;
}

/**
 * Pick a unique book directory under books/.
 * If slug exists and forceReuse is false, append short jobId suffix.
 */
export function resolveBookDir(booksDir, sourceName, jobId, opts = {}) {
  const collection = booksCollectionDir(booksDir);
  const slug = bookSlugFromSourceName(sourceName);
  const preferred = path.join(collection, slug);
  if (opts.forceReuse || !fs.existsSync(preferred)) {
    return { bookDir: preferred, slug, reused: fs.existsSync(preferred) };
  }
  // same title again → versioned folder
  const short = String(jobId || "job").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const versioned = path.join(collection, `${slug}__${short}`);
  return { bookDir: versioned, slug: `${slug}__${short}`, reused: false };
}

export function bookLayout(bookDir) {
  return {
    bookDir,
    inputDir: path.join(bookDir, "input"),
    outputDir: path.join(bookDir, "output"),
    resultZip: path.join(bookDir, "result.zip"),
    metaPath: path.join(bookDir, "book.json"),
    readmePath: path.join(bookDir, "README.md"),
  };
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  await fsp.cp(src, dest, { recursive: true, force: true });
}

/**
 * Promote a finished skill-job into the books archive:
 * books/<slug>/{input,output,result.zip,book.json,README.md}
 *
 * Does not delete the skill-job. Overwrites archive outputs for the chosen bookDir.
 */
export async function archiveJobToBooks(params) {
  const {
    jobRoot,
    jobId,
    sourceName,
    sourceType,
    status,
    booksDir = resolveBooksDir(),
    forceReuse = false,
  } = params;

  if (!jobRoot) throw new Error("archiveJobToBooks: jobRoot required");
  if (!["succeeded", "partial"].includes(status)) {
    throw new Error(`archive only for succeeded|partial, got ${status}`);
  }

  const jobInput = path.join(jobRoot, "input");
  const jobOutput = path.join(jobRoot, "output");
  const jobZip = path.join(jobRoot, "result.zip");

  for (const p of [jobInput, jobOutput]) {
    try {
      await fsp.access(p);
    } catch {
      throw new Error(`missing job path for archive: ${p}`);
    }
  }

  fs.mkdirSync(booksCollectionDir(booksDir), { recursive: true });
  const { bookDir, slug } = resolveBookDir(booksDir, sourceName, jobId, {
    forceReuse,
  });
  const layout = bookLayout(bookDir);

  await fsp.mkdir(layout.inputDir, { recursive: true });
  await fsp.rm(layout.outputDir, { recursive: true, force: true });

  // input: copy all snapshots
  const inputs = await fsp.readdir(jobInput);
  for (const name of inputs) {
    await fsp.copyFile(path.join(jobInput, name), path.join(layout.inputDir, name));
  }
  await copyDir(jobOutput, layout.outputDir);

  try {
    await fsp.access(jobZip);
    await fsp.copyFile(jobZip, layout.resultZip);
  } catch {
    // optional
  }

  const meta = {
    schemaVersion: 1,
    slug,
    jobId,
    sourceName,
    sourceType,
    status,
    archivedAt: new Date().toISOString(),
    skillJobRoot: jobRoot,
    paths: {
      input: "input/",
      output: "output/",
      resultZip: "result.zip",
      manifest: "output/manifest.json",
    },
  };
  await fsp.writeFile(layout.metaPath, JSON.stringify(meta, null, 2), "utf8");
  await fsp.writeFile(
    layout.readmePath,
    renderBookReadme(meta),
    "utf8",
  );

  // ensure repo root README / gitignore exist when booksDir is a git repo root
  await ensureBooksRepoScaffold(booksDir);

  return {
    booksDir,
    bookDir,
    slug,
    metaPath: layout.metaPath,
    inputDir: layout.inputDir,
    outputDir: layout.outputDir,
    resultZip: layout.resultZip,
  };
}

function renderBookReadme(meta) {
  return `# ${meta.sourceName}

| Field | Value |
|-------|-------|
| slug | \`${meta.slug}\` |
| type | ${meta.sourceType} |
| status | ${meta.status} |
| jobId | \`${meta.jobId}\` |
| archivedAt | ${meta.archivedAt} |

## Layout

- \`input/\` — source snapshot (PDF/EPUB)
- \`output/\` — markdown package (\`markdown/parts\`, \`markdown/full.md\`, \`images\`, \`manifest.json\`)
- \`result.zip\` — zip of \`output/\`
- \`book.json\` — archive metadata

Produced by Open Pod skill \`convert-documents-to-markdown\`.
`;
}

export async function ensureBooksRepoScaffold(booksDir) {
  await fsp.mkdir(booksDir, { recursive: true });
  await fsp.mkdir(booksCollectionDir(booksDir), { recursive: true });

  const gitignore = path.join(booksDir, ".gitignore");
  if (!fs.existsSync(gitignore)) {
    await fsp.writeFile(
      gitignore,
      [
        "# local / OS",
        ".DS_Store",
        "Thumbs.db",
        "*.tmp",
        ".env",
        ".env.*",
        "",
        "# editor",
        ".idea/",
        ".vscode/",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  const readme = path.join(booksDir, "README.md");
  if (!fs.existsSync(readme)) {
    await fsp.writeFile(
      readme,
      `# my-books

Personal archive of documents converted to Markdown via Open Pod
\`convert-documents-to-markdown\`.

## Layout

\`\`\`text
books/
  <book-slug>/
    input/           # original PDF / EPUB snapshot
    output/          # markdown package
      markdown/
        full.md
        parts/*.md
      images/
      manifest.json
    result.zip
    book.json
    README.md
\`\`\`

Each book folder is self-contained for maintenance and git history.

## Sync

From the convert skill:

\`\`\`bash
node scripts/sync-books.mjs
# or after convert:
node scripts/convert.mjs book.pdf --sync
\`\`\`

Environment:

- \`OPEN_POD_CONVERT_BOOKS_DIR\` / \`MY_BOOKS_DIR\` — override archive root (this repo)
`,
      "utf8",
    );
  }

  const booksReadme = path.join(booksCollectionDir(booksDir), "README.md");
  if (!fs.existsSync(booksReadme)) {
    await fsp.writeFile(
      booksReadme,
      `# books\n\nOne directory per converted document. See root README.\n`,
      "utf8",
    );
  }
}
