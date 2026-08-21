#!/usr/bin/env node
/**
 * Commit and push the books archive (my-books git repo).
 *
 * Usage:
 *   node scripts/sync-books.mjs
 *   node scripts/sync-books.mjs --message "add book X"
 *   node scripts/sync-books.mjs --no-push
 *   node scripts/sync-books.mjs --dir /path/to/my-books
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBooksRepoScaffold, resolveBooksDir } from "./lib/archive.mjs";

function parseArgs(argv) {
  const args = { message: null, push: true, dir: null, remote: "origin", branch: null };
  const a = [...argv];
  while (a.length) {
    const x = a.shift();
    if (x === "--message" || x === "-m") args.message = a.shift();
    else if (x === "--no-push") args.push = false;
    else if (x === "--dir") args.dir = a.shift();
    else if (x === "--remote") args.remote = a.shift();
    else if (x === "--branch") args.branch = a.shift();
    else if (x === "--help" || x === "-h") args.help = true;
    else throw new Error(`Unknown option: ${x}`);
  }
  return args;
}

function run(cmd, cargs, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cargs, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function ensureGitRepo(booksDir, remoteUrl) {
  const gitDir = path.join(booksDir, ".git");
  if (!fs.existsSync(gitDir)) {
    let r = await run("git", ["init", "-b", "main"], booksDir);
    if (r.code !== 0) throw new Error(`git init failed: ${r.stderr || r.stdout}`);
  }
  const remotes = await run("git", ["remote"], booksDir);
  if (!remotes.stdout.split("\n").map((s) => s.trim()).includes("origin")) {
    const url = remoteUrl || "https://github.com/liujuntao123/my-books.git";
    const r = await run("git", ["remote", "add", "origin", url], booksDir);
    if (r.code !== 0) throw new Error(`git remote add failed: ${r.stderr || r.stdout}`);
  }
}

export async function syncBooks(opts = {}) {
  const booksDir = path.resolve(opts.dir || resolveBooksDir());
  await ensureBooksRepoScaffold(booksDir);
  await ensureGitRepo(booksDir, opts.remoteUrl);

  // identity fallback for empty env (local only)
  await run("git", ["config", "user.email"], booksDir).then(async (r) => {
    if (!r.stdout.trim()) {
      await run(
        "git",
        ["config", "user.email", process.env.GIT_AUTHOR_EMAIL || "liujuntao123@users.noreply.github.com"],
        booksDir,
      );
      await run(
        "git",
        ["config", "user.name", process.env.GIT_AUTHOR_NAME || "liujuntao123"],
        booksDir,
      );
    }
  });

  let r = await run("git", ["add", "-A"], booksDir);
  if (r.code !== 0) throw new Error(`git add failed: ${r.stderr || r.stdout}`);

  r = await run("git", ["status", "--porcelain"], booksDir);
  if (!r.stdout.trim()) {
    return {
      booksDir,
      committed: false,
      pushed: false,
      message: "nothing to commit",
    };
  }

  const message =
    opts.message ||
    `archive: sync books ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  r = await run("git", ["commit", "-m", message], booksDir);
  if (r.code !== 0) throw new Error(`git commit failed: ${r.stderr || r.stdout}`);

  let pushed = false;
  let pushDetail = null;
  if (opts.push !== false) {
    // detect branch
    let branch = opts.branch;
    if (!branch) {
      const b = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], booksDir);
      branch = b.stdout.trim() || "main";
    }
    // try pull --rebase first if remote has history
    await run("git", ["fetch", opts.remote || "origin"], booksDir);
    const push = await run(
      "git",
      ["push", "-u", opts.remote || "origin", branch],
      booksDir,
    );
    if (push.code !== 0) {
      // empty remote / no upstream: try again with --set-upstream already used
      throw new Error(`git push failed: ${push.stderr || push.stdout}`);
    }
    pushed = true;
    pushDetail = push.stdout || push.stderr;
  }

  return {
    booksDir,
    committed: true,
    pushed,
    message,
    pushDetail,
  };
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    // realpath both sides: argv[1] may be a symlinked skill path while
    // import.meta.url always resolves to the real file location.
    return (
      fs.realpathSync(path.resolve(process.argv[1])) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
})();

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/sync-books.mjs [--message msg] [--no-push] [--dir path]`);
    process.exit(0);
  }
  if (args.dir) process.env.OPEN_POD_CONVERT_BOOKS_DIR = path.resolve(args.dir);
  syncBooks({
    dir: args.dir,
    message: args.message,
    push: args.push,
    branch: args.branch,
    remote: args.remote,
  })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
