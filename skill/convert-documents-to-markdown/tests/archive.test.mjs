import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveBooksDir,
  bookSlugFromSourceName,
  resolveBookDir,
  archiveJobToBooks,
  booksCollectionDir,
  ensureBooksRepoScaffold,
} from "../scripts/lib/archive.mjs";
import { zipDirectory } from "../scripts/lib/package-zip.js";

describe("archive paths", () => {
  it("slug strips extension and sanitizes", () => {
    assert.equal(bookSlugFromSourceName("Hello World.pdf"), "Hello_World");
    assert.equal(bookSlugFromSourceName("Book [Annotated].epub"), "Book_Annotated");
  });

  it("honors OPEN_POD_CONVERT_BOOKS_DIR", () => {
    const d = resolveBooksDir({ OPEN_POD_CONVERT_BOOKS_DIR: "/tmp/my-books-x" });
    assert.equal(d, "/tmp/my-books-x");
  });

  it("versions book dir when slug already exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "books-"));
    const coll = booksCollectionDir(root);
    fs.mkdirSync(path.join(coll, "MyBook"), { recursive: true });
    const a = resolveBookDir(root, "MyBook.pdf", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.match(a.bookDir, /MyBook__aaaaaaaa$/);
    const b = resolveBookDir(root, "Other.pdf", "id");
    assert.equal(path.basename(b.bookDir), "Other");
  });
});

describe("archiveJobToBooks", () => {
  it("copies input and output into books/<slug>/", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arch-"));
    const jobRoot = path.join(tmp, "job");
    const booksDir = path.join(tmp, "my-books");
    fs.mkdirSync(path.join(jobRoot, "input"), { recursive: true });
    fs.mkdirSync(path.join(jobRoot, "output", "markdown", "parts"), { recursive: true });
    fs.writeFileSync(path.join(jobRoot, "input", "Demo.epub"), "epub-bytes");
    fs.writeFileSync(path.join(jobRoot, "output", "markdown", "full.md"), "# Demo\n");
    fs.writeFileSync(path.join(jobRoot, "output", "markdown", "parts", "001.md"), "# Demo\n");
    fs.writeFileSync(
      path.join(jobRoot, "output", "manifest.json"),
      JSON.stringify({ jobId: "j1", status: "succeeded" }),
    );
    await zipDirectory(path.join(jobRoot, "output"), path.join(jobRoot, "result.zip"));

    const r = await archiveJobToBooks({
      jobRoot,
      jobId: "j1",
      sourceName: "Demo.epub",
      sourceType: "epub",
      status: "succeeded",
      booksDir,
    });

    assert.equal(r.slug, "Demo");
    assert.ok(fs.existsSync(path.join(r.bookDir, "input", "Demo.epub")));
    assert.ok(fs.existsSync(path.join(r.bookDir, "output", "markdown", "full.md")));
    assert.ok(fs.existsSync(path.join(r.bookDir, "result.zip")));
    assert.ok(fs.existsSync(path.join(r.bookDir, "book.json")));
    assert.ok(fs.existsSync(path.join(r.bookDir, "README.md")));
    assert.ok(fs.existsSync(path.join(booksDir, "README.md")));
    assert.ok(fs.existsSync(path.join(booksDir, "books", "README.md")));

    // job still preserved
    assert.ok(fs.existsSync(path.join(jobRoot, "input", "Demo.epub")));
  });

  it("refuses failed status", async () => {
    await assert.rejects(
      () =>
        archiveJobToBooks({
          jobRoot: "/tmp/x",
          jobId: "j",
          sourceName: "a.pdf",
          sourceType: "pdf",
          status: "failed",
          booksDir: "/tmp/y",
        }),
      /succeeded\|partial/,
    );
  });
});

describe("ensureBooksRepoScaffold", () => {
  it("is idempotent", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scaf-"));
    await ensureBooksRepoScaffold(root);
    await ensureBooksRepoScaffold(root);
    assert.ok(fs.existsSync(path.join(root, ".gitignore")));
  });
});
