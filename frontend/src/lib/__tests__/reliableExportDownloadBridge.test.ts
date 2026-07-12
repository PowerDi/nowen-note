import { describe, expect, it } from "vitest";
import {
  extractLegacyDownloadToken,
  isReliableExportFilename,
} from "@/lib/reliableExportDownloadBridge";

describe("reliableExportDownloadBridge", () => {
  it("recognizes every affected export type", () => {
    expect(isReliableExportFilename("note.md")).toBe(true);
    expect(isReliableExportFilename("note.markdown")).toBe(true);
    expect(isReliableExportFilename("notebook.zip")).toBe(true);
    expect(isReliableExportFilename("note.pdf")).toBe(true);
    expect(isReliableExportFilename("note.docx")).toBe(true);
    expect(isReliableExportFilename("cover.png")).toBe(false);
  });

  it("extracts only synthetic legacy fallback tokens", () => {
    expect(extractLegacyDownloadToken("https://note.test/api/export/download/legacy-export-123"))
      .toBe("legacy-export-123");
    expect(extractLegacyDownloadToken("https://note.test/api/export/download/real-token"))
      .toBeNull();
  });
});
