import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveDataDir,
  skillJobsDir,
  serviceJobsDir,
  jobPaths,
  newJobId,
  ensureSkillDataLayout,
  assertNotServiceJobsPath,
} from "../scripts/lib/paths.mjs";

describe("paths", () => {
  it("defaults data dir to ~/.open-pod-convert", () => {
    const d = resolveDataDir({});
    assert.equal(d, path.join(os.homedir(), ".open-pod-convert"));
  });

  it("honors OPEN_POD_CONVERT_DATA_DIR", () => {
    const d = resolveDataDir({ OPEN_POD_CONVERT_DATA_DIR: "/tmp/my-convert" });
    assert.equal(d, "/tmp/my-convert");
  });

  it("creates skill-jobs but not jobs/", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "convert-skill-"));
    const { skillJobs } = ensureSkillDataLayout(root);
    assert.ok(fs.existsSync(skillJobs));
    assert.equal(fs.existsSync(serviceJobsDir(root)), false);
    assert.equal(skillJobs, path.join(root, "skill-jobs"));
  });

  it("job layout uses skill-jobs/<id>/{input,work,output}", () => {
    const id = newJobId();
    const p = jobPaths(id, "/data");
    assert.equal(p.jobRoot, path.join("/data", "skill-jobs", id));
    assert.equal(p.inputDir, path.join(p.jobRoot, "input"));
    assert.equal(p.workDir, path.join(p.jobRoot, "work"));
    assert.equal(p.outputDir, path.join(p.jobRoot, "output"));
    assert.equal(p.resultZip, path.join(p.jobRoot, "result.zip"));
  });

  it("new job ids are unique", () => {
    assert.notEqual(newJobId(), newJobId());
  });

  it("refuses writing under service jobs/", () => {
    assert.throws(
      () => assertNotServiceJobsPath("/data/jobs/abc", "/data"),
      /must not write under service jobs/,
    );
    assert.doesNotThrow(() =>
      assertNotServiceJobsPath("/data/skill-jobs/abc", "/data"),
    );
  });
});
