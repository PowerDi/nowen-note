import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import {
  handleReliableExportDownload,
  reliableExportTestUtils,
  stageReliableGeneratedExport,
  validatePreparedMarkdownNotes,
} from "../src/services/reliableExportJobs";

test("cumulative inline asset quota is enforced", () => {
  const notes = [{
    id: "note-1",
    title: "quota",
    notebookName: null,
    createdAt: "2026-07-12",
    updatedAt: "2026-07-12",
    markdown: "body",
    inlineAssets: [
      { relPath: "assets/a.bin", base64: Buffer.from("abc").toString("base64") },
      { relPath: "assets/b.bin", base64: Buffer.from("def").toString("base64") },
    ],
  }];

  assert.throws(
    () => validatePreparedMarkdownNotes(notes, { maxInlineAssetBytes: 5 }),
    (error: any) => error?.code === "INLINE_ASSETS_TOO_LARGE" && error?.status === 413,
  );
});

test("download capability token is one-time and removes its temporary job", async () => {
  const body = new Response(new TextEncoder().encode("markdown")).body;
  assert.ok(body);
  const staged = await stageReliableGeneratedExport({
    userId: "user-export-hardening",
    filename: "note.md",
    contentType: "text/markdown",
    body,
  });

  const app = new Hono();
  app.get("/download/:token", handleReliableExportDownload);
  const first = await app.request(`/download/${staged.downloadToken}`);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("x-nowen-reliable-export"), "1");
  assert.equal(await first.text(), "markdown");

  const replay = await app.request(`/download/${staged.downloadToken}`);
  assert.equal(replay.status, 404);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(reliableExportTestUtils.getJobCount(), 0);
});
