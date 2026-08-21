/**
 * Build user-facing completion report objects (JSON-serializable).
 */
export function buildJobReport({
  jobId,
  sourceName,
  sourceType,
  status,
  jobRoot,
  partCount,
  pageCount,
  warnings = [],
  missingRanges = [],
  failedSegments = [],
  error,
  validation,
}) {
  const base = {
    jobId,
    sourceName,
    sourceType,
    status,
    jobRoot,
    outputs: {
      partsDir: `${jobRoot}/output/markdown/parts/`,
      fullMd: `${jobRoot}/output/markdown/full.md`,
      resultZip: `${jobRoot}/result.zip`,
      manifest: `${jobRoot}/output/manifest.json`,
    },
    partCount,
    pageCount,
    warnings: [...warnings],
  };

  if (status === "partial") {
    base.missingRanges = missingRanges;
    base.failedSegments = failedSegments;
    base.nextSteps = [
      "This is partial success, not full success.",
      "Successful content and placeholders were retained.",
      `Retry failed segments on the same jobId with: convert.mjs --retry ${jobId}`,
      "Do not auto-retry unless the user explicitly agrees.",
    ];
  }

  if (status === "failed" || (validation && !validation.ok)) {
    base.error = error || (validation?.errors || []).join("; ");
    base.sitePreserved = true;
    base.nextSteps = [
      `Inspect preserved job directory: ${jobRoot}`,
      "Do not treat incomplete package as success.",
      "After user agrees: retry recoverable steps on same jobId, or reconvert as a new job.",
    ];
    if (validation && !validation.ok) {
      base.validationErrors = validation.errors;
      base.status = "failed";
      base.validationFailed = true;
    }
  }

  return base;
}

export function buildBatchReport(jobReports) {
  const summary = { succeeded: 0, partial: 0, failed: 0, cancelled: 0 };
  for (const r of jobReports) {
    const s = r.status;
    if (s === "succeeded") summary.succeeded++;
    else if (s === "partial") summary.partial++;
    else if (s === "cancelled") summary.cancelled++;
    else summary.failed++;
  }
  return { summary, jobs: jobReports };
}

export function formatReportText(report) {
  if (report.summary) {
    const { succeeded, partial, failed, cancelled } = report.summary;
    const lines = [
      `Batch: succeeded ${succeeded} / partial ${partial} / failed ${failed}` +
        (cancelled ? ` / cancelled ${cancelled}` : ""),
      "",
    ];
    for (const j of report.jobs) {
      lines.push(formatSingle(j));
      lines.push("");
    }
    return lines.join("\n").trim() + "\n";
  }
  return formatSingle(report) + "\n";
}

function formatSingle(j) {
  const lines = [
    `status: ${j.status}`,
    `jobId: ${j.jobId}`,
    `source: ${j.sourceName} (${j.sourceType || "?"})`,
    `jobRoot: ${j.jobRoot}`,
  ];
  if (j.partCount != null) lines.push(`parts: ${j.partCount}`);
  if (j.pageCount != null) lines.push(`pages: ${j.pageCount}`);
  if (j.outputs) {
    lines.push(`partsDir: ${j.outputs.partsDir}`);
    lines.push(`fullMd: ${j.outputs.fullMd}`);
    lines.push(`resultZip: ${j.outputs.resultZip}`);
  }
  if (j.warnings?.length) {
    lines.push("warnings:");
    for (const w of j.warnings) lines.push(`  - ${w}`);
  }
  if (j.missingRanges?.length) {
    lines.push(`missingRanges: ${JSON.stringify(j.missingRanges)}`);
  }
  if (j.failedSegments?.length) {
    lines.push(`failedSegments: ${JSON.stringify(j.failedSegments)}`);
  }
  if (j.error) lines.push(`error: ${j.error}`);
  if (j.validationErrors?.length) {
    lines.push("validationErrors:");
    for (const e of j.validationErrors) lines.push(`  - ${e}`);
  }
  if (j.archive?.bookDir) {
    lines.push(`archiveBookDir: ${j.archive.bookDir}`);
    lines.push(`archiveInput: ${j.archive.inputDir}`);
    lines.push(`archiveOutput: ${j.archive.outputDir}`);
  }
  if (j.archiveError) lines.push(`archiveError: ${j.archiveError}`);
  if (j.nextSteps?.length) {
    lines.push("nextSteps:");
    for (const s of j.nextSteps) lines.push(`  - ${s}`);
  }
  return lines.join("\n");
}
