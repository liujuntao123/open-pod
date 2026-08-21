#!/usr/bin/env node
/**
 * Ensure Skill-local node_modules are installed.
 * Only touches this skill directory — never the user's project.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, "..");
const require = createRequire(path.join(skillRoot, "package.json"));

const REQUIRED = ["epub2md", "jszip", "pdf-lib", "undici"];

export function skillRootDir() {
  return skillRoot;
}

export function checkDeps() {
  const missing = [];
  for (const name of REQUIRED) {
    try {
      require.resolve(name);
    } catch {
      missing.push(name);
    }
  }
  return { ok: missing.length === 0, missing, skillRoot };
}

function runNpmInstall() {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["install", "--no-fund", "--no-audit"], {
      cwd: skillRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install failed with exit code ${code} (cwd=${skillRoot})`));
    });
  });
}

export async function ensureDeps({ install = true } = {}) {
  let status = checkDeps();
  if (status.ok) return status;
  if (!install) {
    const err = new Error(
      `Skill dependencies missing: ${status.missing.join(", ")}. Run: cd ${skillRoot} && npm install`,
    );
    err.code = "MISSING_DEPS";
    throw err;
  }
  console.error(`[convert-skill] Installing dependencies in ${skillRoot}…`);
  await runNpmInstall();
  status = checkDeps();
  if (!status.ok) {
    throw new Error(
      `After npm install, still missing: ${status.missing.join(", ")}. Check network and Node >= 20.`,
    );
  }
  return status;
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
  ensureDeps()
    .then((s) => {
      console.log(JSON.stringify({ ok: true, skillRoot: s.skillRoot }, null, 2));
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
