#!/usr/bin/env node
/**
 * convert-documents-to-markdown CLI
 *
 * Usage:
 *   node scripts/convert.mjs <file> [more files...]
 *   node scripts/convert.mjs --retry <jobId>
 *   node scripts/convert.mjs --validate <jobId>
 *   node scripts/convert.mjs --archive-only <jobId>
 *
 * Options:
 *   --output-mode split|merge|both   (EPUB; default split)
 *   --ocr true|false                 (PDF; omit for auto)
 *   --language ch                    (PDF MinerU language)
 *   --model-version pipeline|vlm
 *   --assets localize|none
 *   --data-dir <path>                (overrides OPEN_POD_CONVERT_DATA_DIR)
 *   --books-dir <path>               (overrides OPEN_POD_CONVERT_BOOKS_DIR / my-books)
 *   --archive / --no-archive         (default: archive succeeded|partial into books/)
 *   --sync                           (git commit+push my-books after archive)
 *   --skip-install                   (do not auto npm install)
 *   --json                           (machine-readable report only)
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDeps } from "./ensure-deps.mjs";
import {
  ensureSkillDataLayout,
  jobPaths,
  newJobId,
  resolveDataDir,
  assertNotServiceJobsPath,
} from "./lib/paths.mjs";
import { resolveMineruToken, redactSecrets } from "./lib/credentials.mjs";
import { selectProxyRoute } from "./lib/proxy.mjs";
import { detectPdfTextLayer, resolveOcrChoice } from "./lib/ocr-detect.mjs";
import { validateConversionPackage } from "./lib/validate.mjs";
import {
  buildJobReport,
  buildBatchReport,
  formatReportText,
} from "./lib/report.mjs";
import { archiveJobToBooks, resolveBooksDir } from "./lib/archive.mjs";
import { syncBooks } from "./sync-books.mjs";
import { nowIso } from "./lib/util.js";
import { detectSourceType } from "./lib/types.js";
import {
  runPdfPipeline,
  runEpubPipeline,
  retryFailedPdfSegments,
} from "./lib/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    files: [],
    retry: null,
    validate: null,
    archiveOnly: null,
    outputMode: "split",
    ocr: undefined,
    language: "ch",
    modelVersion: "pipeline",
    assets: "localize",
    dataDir: undefined,
    booksDir: undefined,
    archive: true,
    sync: false,
    skipInstall: false,
    json: false,
  };
  const a = [...argv];
  while (a.length) {
    const x = a.shift();
    if (x === "--retry") args.retry = a.shift();
    else if (x === "--validate") args.validate = a.shift();
    else if (x === "--archive-only") args.archiveOnly = a.shift();
    else if (x === "--output-mode") args.outputMode = a.shift();
    else if (x === "--ocr") {
      const v = a.shift();
      if (v === "true" || v === "1") args.ocr = true;
      else if (v === "false" || v === "0") args.ocr = false;
      else throw new Error(`--ocr expects true|false, got ${v}`);
    } else if (x === "--language") args.language = a.shift();
    else if (x === "--model-version") args.modelVersion = a.shift();
    else if (x === "--assets") args.assets = a.shift();
    else if (x === "--data-dir") args.dataDir = a.shift();
    else if (x === "--books-dir") args.booksDir = a.shift();
    else if (x === "--archive") args.archive = true;
    else if (x === "--no-archive") args.archive = false;
    else if (x === "--sync") args.sync = true;
    else if (x === "--skip-install") args.skipInstall = true;
    else if (x === "--json") args.json = true;
    else if (x === "--help" || x === "-h") args.help = true;
    else if (x.startsWith("-")) throw new Error(`Unknown option: ${x}`);
    else args.files.push(x);
  }
  return args;
}

function logLine(jobPathsObj, msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fsSync.appendFileSync(jobPathsObj.logPath, line);
  } catch {
    // ignore
  }
  if (!process.env.CONVERT_SKILL_QUIET) {
    console.error(line.trimEnd());
  }
}

async function writeState(paths, state) {
  await fs.mkdir(paths.workDir, { recursive: true });
  await fs.writeFile(paths.statePath, JSON.stringify(state, null, 2), "utf8");
}

async function readState(paths) {
  return JSON.parse(await fs.readFile(paths.statePath, "utf8"));
}

function enrichManifest(manifest, extra) {
  return {
    schemaVersion: 1,
    producer: "convert-skill",
    ...manifest,
    ...extra,
  };
}

async function persistEnrichedManifest(outDir, manifest) {
  const p = path.join(outDir, "manifest.json");
  await fs.writeFile(p, JSON.stringify(manifest, null, 2), "utf8");
}

async function copyInputSnapshot(sourcePath, inputDir) {
  await fs.mkdir(inputDir, { recursive: true });
  const base = path.basename(sourcePath);
  const dest = path.join(inputDir, base);
  await fs.copyFile(sourcePath, dest);
  return dest;
}


async function maybeArchive(report, args) {
  if (!args.archive) return report;
  if (!report?.jobId || !report?.jobRoot) return report;
  if (!["succeeded", "partial"].includes(report.status)) return report;
  try {
    const archived = await archiveJobToBooks({
      jobRoot: report.jobRoot,
      jobId: report.jobId,
      sourceName: report.sourceName,
      sourceType: report.sourceType,
      status: report.status,
      booksDir: args.booksDir || resolveBooksDir(),
    });
    report.archive = {
      booksDir: archived.booksDir,
      bookDir: archived.bookDir,
      slug: archived.slug,
      inputDir: archived.inputDir,
      outputDir: archived.outputDir,
      resultZip: archived.resultZip,
    };
  } catch (err) {
    report.archiveError = String(err.message || err);
  }
  return report;
}

async function convertOneFile(sourcePath, opts, dataDir) {
  const abs = path.resolve(sourcePath);
  await fs.access(abs);
  const sourceName = path.basename(abs);
  const sourceType = detectSourceType(sourceName);
  if (!sourceType) {
    throw new Error(`Unsupported source type: ${sourceName} (v1: pdf|epub)`);
  }

  const jobId = newJobId();
  const paths = jobPaths(jobId, dataDir);
  assertNotServiceJobsPath(paths.jobRoot, dataDir);
  ensureSkillDataLayout(dataDir);
  await fs.mkdir(paths.inputDir, { recursive: true });
  await fs.mkdir(paths.workDir, { recursive: true });

  const inputSnapshot = await copyInputSnapshot(abs, paths.inputDir);
  const createdAt = nowIso();

  let isOcr = opts.ocr;
  let ocrMeta = null;
  if (sourceType === "pdf") {
    const detection = await detectPdfTextLayer(inputSnapshot);
    const choice = resolveOcrChoice(opts.ocr, detection);
    ocrMeta = choice;
    if (choice.needsUserInput) {
      const err = new Error(
        "OCR mode uncertain for this PDF. Re-run with --ocr true or --ocr false.",
      );
      err.code = "OCR_UNCERTAIN";
      err.detection = detection;
      throw err;
    }
    isOcr = choice.isOcr;
  }

  let proxyRoute = { proxyEnabled: false, proxyUrl: undefined, source: "n/a" };
  let tokenInfo = { token: undefined, source: null };
  if (sourceType === "pdf") {
    tokenInfo = resolveMineruToken(process.env, dataDir);
    if (!tokenInfo.token) {
      throw new Error(
        "No MinerU token. Set OPEN_POD_CONVERT_SKILL_MINERU_TOKEN, OPEN_POD_CONVERT_MINERU_TOKEN, or secrets.json mineruApiToken.",
      );
    }
    proxyRoute = await selectProxyRoute(process.env);
    if (proxyRoute.warning) logLine(paths, proxyRoute.warning);
  }

  const state = {
    jobId,
    sourceType,
    sourceName,
    sourcePath: inputSnapshot,
    originalPath: abs,
    status: "running",
    createdAt,
    options: {
      sourceType,
      sourceName,
      outputMode: opts.outputMode,
      isOcr,
      modelVersion: opts.modelVersion,
      language: opts.language,
      assets: opts.assets,
    },
    proxy: {
      enabled: proxyRoute.proxyEnabled,
      url: proxyRoute.proxyUrl ? "[set]" : null,
      source: proxyRoute.source,
    },
    tokenSource: tokenInfo.source,
    ocr: ocrMeta
      ? {
          isOcr,
          source: ocrMeta.source,
          confidence: ocrMeta.detection?.confidence,
          signals: ocrMeta.detection?.signals,
        }
      : null,
    segments: [],
    attempts: 1,
  };
  await writeState(paths, state);
  logLine(paths, `start job ${jobId} type=${sourceType} source=${sourceName}`);

  const ac = new AbortController();
  const onSig = () => ac.abort();
  process.once("SIGINT", onSig);
  process.once("SIGTERM", onSig);

  try {
    const input = {
      jobId,
      sourcePath: inputSnapshot,
      workDir: paths.workDir,
      options: state.options,
      mineruToken: tokenInfo.token,
      proxyEnabled: proxyRoute.proxyEnabled,
      proxyUrl: proxyRoute.proxyUrl,
      createdAt,
    };

    const hooks = {
      signal: ac.signal,
      onProgress: (p) => logLine(paths, `${p.phase}: ${p.message}`),
    };

    let result;
    if (sourceType === "pdf") {
      result = await runPdfPipeline(input, hooks);
    } else {
      result = await runEpubPipeline(input, hooks);
    }

    // Move pipeline output from workDir/output to jobRoot/output layout
    // pipeline writes to workDir/output and workDir/result.zip — design wants jobRoot/output and jobRoot/result.zip
    await finalizeLayout(paths, result);

    const manifest = enrichManifest(result.manifest, {
      sourceDigest: {
        originalPathBasename: sourceName,
        // no absolute path
      },
      attempts: 1,
      ocrDecision: state.ocr,
      proxySource: proxyRoute.source,
      tokenSource: tokenInfo.source,
    });
    // strip any accidental secrets
    const manifestText = redactSecrets(JSON.stringify(manifest, null, 2), tokenInfo.token);
    await fs.writeFile(path.join(paths.outputDir, "manifest.json"), manifestText, "utf8");

    // re-zip after manifest enrich (zip was built earlier under work/)
    const { zipDirectory } = await import("./lib/package-zip.js");
    await zipDirectory(paths.outputDir, paths.resultZip);

    const validation = await validateConversionPackage(paths.jobRoot);
    let status = result.status;
    if (!validation.ok && status === "succeeded") {
      status = "failed";
    }

    state.status = status;
    state.segments = result.segments;
    state.finishedAt = nowIso();
    state.validation = { ok: validation.ok, errors: validation.errors, warnings: validation.warnings };
    // persist segment fullMd for retry
    state.segmentsFull = result.segments.map((s) => ({
      index: s.index,
      pageRanges: s.pageRanges,
      start: s.start,
      end: s.end,
      state: s.state,
      errMsg: s.errMsg,
      fullMd: s.fullMd,
      dataId: s.dataId,
    }));
    await writeState(paths, state);

    const report = buildJobReport({
      jobId,
      sourceName,
      sourceType,
      status: validation.ok ? status : "failed",
      jobRoot: paths.jobRoot,
      partCount: manifest.parts?.length,
      pageCount: manifest.pageCount,
      warnings: [...(manifest.warnings || []), ...(validation.warnings || [])],
      missingRanges: manifest.missingRanges || [],
      failedSegments: (manifest.segments || []).filter((s) => s.state === "failed"),
      error: validation.ok ? undefined : validation.errors.join("; "),
      validation,
    });
    logLine(paths, `done status=${report.status}`);
    return await maybeArchive(report, opts);
  } catch (err) {
    if (err.name === "AbortError") {
      state.status = "cancelled";
      state.error = "cancelled";
      await writeState(paths, state);
      return buildJobReport({
        jobId,
        sourceName,
        sourceType,
        status: "cancelled",
        jobRoot: paths.jobRoot,
        error: "cancelled",
        warnings: [],
      });
    }
    state.status = "failed";
    state.error = redactSecrets(String(err.message || err), tokenInfo.token);
    state.finishedAt = nowIso();
    await writeState(paths, state);
    logLine(paths, `failed: ${state.error}`);
    return buildJobReport({
      jobId,
      sourceName,
      sourceType,
      status: "failed",
      jobRoot: paths.jobRoot,
      error: state.error,
      warnings: [],
    });
  } finally {
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }
}

/**
 * Pipeline writes to workDir/output and workDir/result.zip.
 * Design layout uses jobRoot/output and jobRoot/result.zip.
 */
async function finalizeLayout(paths, result) {
  const workOut = result.outDir;
  const workZip = result.zipPath;
  // if already correct, skip
  if (path.resolve(workOut) === path.resolve(paths.outputDir)) {
    return;
  }
  await fs.rm(paths.outputDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(paths.outputDir), { recursive: true });
  // rename/move
  try {
    await fs.rename(workOut, paths.outputDir);
  } catch {
    // cross-device: copy
    await fs.cp(workOut, paths.outputDir, { recursive: true });
    await fs.rm(workOut, { recursive: true, force: true });
  }
  if (workZip && path.resolve(workZip) !== path.resolve(paths.resultZip)) {
    try {
      await fs.rename(workZip, paths.resultZip);
    } catch {
      await fs.copyFile(workZip, paths.resultZip);
      await fs.rm(workZip, { force: true });
    }
  }
  result.outDir = paths.outputDir;
  result.zipPath = paths.resultZip;
}

async function retryJob(jobId, dataDir, opts) {
  const paths = jobPaths(jobId, dataDir);
  const state = await readState(paths);
  if (state.sourceType !== "pdf") {
    throw new Error("Only PDF jobs support segment retry");
  }
  if (!state.segmentsFull?.length) {
    throw new Error("No persisted segments to retry for this job");
  }

  const tokenInfo = resolveMineruToken(process.env, dataDir);
  if (!tokenInfo.token) throw new Error("No MinerU token for retry");

  // Pin proxy from original job if available; else re-select once
  let proxyRoute = {
    proxyEnabled: !!state.proxy?.enabled,
    proxyUrl: undefined,
    source: state.proxy?.source || "reselect",
  };
  if (!state.proxy?.source || state.proxy.source === "n/a") {
    proxyRoute = await selectProxyRoute(process.env);
  } else if (state.proxy.enabled) {
    // re-resolve URL from env using same priority without switching mid-flight semantics
    const sel = await selectProxyRoute(process.env);
    proxyRoute = sel;
  }

  state.attempts = (state.attempts || 1) + 1;
  state.status = "running";
  await writeState(paths, state);
  logLine(paths, `retry attempt ${state.attempts}`);

  // pipeline expects workDir with output under it for image reload — stage
  const stageWork = paths.workDir;
  // ensure previous output images visible at workDir/output
  const stagedOut = path.join(stageWork, "output");
  if (path.resolve(paths.outputDir) !== path.resolve(stagedOut)) {
    await fs.rm(stagedOut, { recursive: true, force: true });
    try {
      await fs.symlink(paths.outputDir, stagedOut);
    } catch {
      await fs.cp(paths.outputDir, stagedOut, { recursive: true });
    }
  }

  const input = {
    jobId,
    sourcePath: state.sourcePath,
    workDir: stageWork,
    options: state.options,
    mineruToken: tokenInfo.token,
    proxyEnabled: proxyRoute.proxyEnabled,
    proxyUrl: proxyRoute.proxyUrl,
    createdAt: state.createdAt,
    previousSegments: state.segmentsFull,
  };

  const ac = new AbortController();
  const result = await retryFailedPdfSegments(input, {
    signal: ac.signal,
    onProgress: (p) => logLine(paths, `${p.phase}: ${p.message}`),
  });

  await finalizeLayout(paths, result);

  const manifest = enrichManifest(result.manifest, {
    attempts: state.attempts,
    producer: "convert-skill",
    schemaVersion: 1,
  });
  await fs.writeFile(
    path.join(paths.outputDir, "manifest.json"),
    redactSecrets(JSON.stringify(manifest, null, 2), tokenInfo.token),
    "utf8",
  );
  const { zipDirectory } = await import("./lib/package-zip.js");
  await zipDirectory(paths.outputDir, paths.resultZip);

  const validation = await validateConversionPackage(paths.jobRoot);
  let status = result.status;
  if (!validation.ok && status === "succeeded") status = "failed";

  state.status = status;
  state.segmentsFull = result.segments.map((s) => ({
    index: s.index,
    pageRanges: s.pageRanges,
    start: s.start,
    end: s.end,
    state: s.state,
    errMsg: s.errMsg,
    fullMd: s.fullMd,
    dataId: s.dataId,
  }));
  state.finishedAt = nowIso();
  state.validation = { ok: validation.ok, errors: validation.errors };
  await writeState(paths, state);

  const report = buildJobReport({
    jobId,
    sourceName: state.sourceName,
    sourceType: state.sourceType,
    status: validation.ok ? status : "failed",
    jobRoot: paths.jobRoot,
    partCount: manifest.parts?.length,
    pageCount: manifest.pageCount,
    warnings: manifest.warnings || [],
    missingRanges: manifest.missingRanges || [],
    failedSegments: (manifest.segments || []).filter((s) => s.state === "failed"),
    error: validation.ok ? undefined : validation.errors.join("; "),
    validation,
  });
  return await maybeArchive(report, opts);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.files.length && !args.retry && !args.validate && !args.archiveOnly)) {
    console.log(`Usage:
  node scripts/convert.mjs <file> [files...]
  node scripts/convert.mjs --retry <jobId>
  node scripts/convert.mjs --validate <jobId>
  node scripts/convert.mjs --archive-only <jobId>
  node scripts/convert.mjs <file> --sync

Options: --archive/--no-archive (default archive), --books-dir, --sync

See SKILL.md for full workflow.`);
    process.exit(args.help ? 0 : 1);
  }

  if (!args.skipInstall) {
    await ensureDeps({ install: true });
  } else {
    await ensureDeps({ install: false });
  }

  if (args.dataDir) {
    process.env.OPEN_POD_CONVERT_DATA_DIR = path.resolve(args.dataDir);
  }
  if (args.booksDir) {
    process.env.OPEN_POD_CONVERT_BOOKS_DIR = path.resolve(args.booksDir);
    args.booksDir = path.resolve(args.booksDir);
  } else {
    args.booksDir = resolveBooksDir();
  }
  const dataDir = resolveDataDir();
  ensureSkillDataLayout(dataDir);

  if (args.validate) {
    const paths = jobPaths(args.validate, dataDir);
    const validation = await validateConversionPackage(paths.jobRoot);
    const out = { jobId: args.validate, jobRoot: paths.jobRoot, ...validation };
    console.log(args.json ? JSON.stringify(out, null, 2) : JSON.stringify(out, null, 2));
    process.exit(validation.ok ? 0 : 2);
  }

  if (args.archiveOnly) {
    const paths = jobPaths(args.archiveOnly, dataDir);
    let state = {};
    try {
      state = JSON.parse(await fs.readFile(paths.statePath, "utf8"));
    } catch {
      // fall back to manifest
    }
    let status = state.status;
    let sourceName = state.sourceName;
    let sourceType = state.sourceType;
    if (!sourceName) {
      const manifestPath = path.join(paths.outputDir, "manifest.json");
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      status = status || manifest.status;
      sourceName = manifest.sourceName;
      sourceType = manifest.sourceType;
    }
    const report = await maybeArchive(
      {
        jobId: args.archiveOnly,
        jobRoot: paths.jobRoot,
        sourceName,
        sourceType,
        status: status || "succeeded",
      },
      args,
    );
    if (args.sync && report.archive) {
      report.sync = await syncBooks({
        dir: args.booksDir,
        message: `archive: ${report.archive.slug || sourceName}`,
      });
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.archive ? 0 : 1);
  }

  if (args.retry) {
    const report = await retryJob(args.retry, dataDir, args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(formatReportText(report));
      console.log(JSON.stringify(report, null, 2));
    }
    process.exit(report.status === "succeeded" ? 0 : report.status === "partial" ? 3 : 1);
  }

  const reports = [];
  for (const f of args.files) {
    try {
      const r = await convertOneFile(f, args, dataDir);
      reports.push(r);
    } catch (err) {
      if (err.code === "OCR_UNCERTAIN") {
        reports.push({
          status: "failed",
          sourceName: path.basename(f),
          sourceType: "pdf",
          jobId: null,
          jobRoot: null,
          error: err.message,
          detection: err.detection,
          nextSteps: ["Re-run with --ocr true or --ocr false"],
        });
        continue;
      }
      reports.push({
        status: "failed",
        sourceName: path.basename(f),
        jobId: null,
        jobRoot: null,
        error: String(err.message || err),
      });
    }
  }

  const batch = reports.length === 1 ? reports[0] : buildBatchReport(reports);

  if (args.sync) {
    const archived = reports.filter((r) => r.archive?.slug);
    const msg =
      archived.length === 1
        ? `archive: ${archived[0].archive.slug}`
        : `archive: sync ${archived.length} book(s)`;
    try {
      const syncResult = await syncBooks({
        dir: args.booksDir,
        message: msg,
      });
      if (batch.summary) batch.sync = syncResult;
      else batch.sync = syncResult;
    } catch (err) {
      if (batch.summary) batch.syncError = String(err.message || err);
      else batch.syncError = String(err.message || err);
    }
  }

  if (args.json) console.log(JSON.stringify(batch, null, 2));
  else {
    console.log(formatReportText(batch));
    if (batch.archive?.bookDir || reports.some((r) => r.archive)) {
      const arch = batch.archive || reports.map((r) => r.archive).filter(Boolean);
      console.log("archive:", JSON.stringify(arch, null, 2));
    }
    if (batch.sync) console.log("sync:", JSON.stringify(batch.sync, null, 2));
    if (batch.syncError) console.log("syncError:", batch.syncError);
    console.log("---");
    console.log(JSON.stringify(batch, null, 2));
  }

  if (reports.every((r) => r.status === "succeeded")) process.exit(0);
  if (reports.some((r) => r.status === "partial")) process.exit(3);
  process.exit(1);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    // realpath both sides: argv[1] may be a symlinked skill path while
    // import.meta.url always resolves to the real file location.
    return (
      fsSync.realpathSync(path.resolve(process.argv[1])) ===
      fsSync.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
})();
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { convertOneFile, retryJob, parseArgs };
