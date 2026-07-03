import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  cleanSiyuanMarkdown,
  enhanceSiyuanImageMap,
  inspectSiyuanZip,
  isSiyuanMarkdownZip,
  isSiyuanSyZip,
  readSiyuanMarkdownZip,
} from "@/lib/siyuanImportService";

async function makeZipFile(entries: Record<string, string | Uint8Array>, name = "siyuan-export.zip"): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], name, { type: "application/zip" });
}

describe("siyuanImportService", () => {
  it("detects a Markdown zip with an assets directory as a Siyuan Markdown export", () => {
    expect(isSiyuanMarkdownZip(["Notebook/Doc.md", "Notebook/assets/a.png"])).toBe(true);
    expect(isSiyuanMarkdownZip(["Notebook/Doc.md"])).toBe(false);
  });

  it("detects Siyuan .sy packages separately", () => {
    expect(isSiyuanSyZip(["data/20240101000000.sy"])).toBe(true);
    expect(isSiyuanSyZip(["Notebook/Doc.md"])).toBe(false);
  });

  it("detects Siyuan Markdown content markers even without assets", async () => {
    const file = await makeZipFile({
      "Notebook/Doc.md": "段落\n{: id=\"20240101000000-abcdefg\"}\n",
    });

    const inspection = await inspectSiyuanZip(file);

    expect(inspection.hasMarkdownFiles).toBe(true);
    expect(inspection.isSiyuanMarkdownZip).toBe(true);
  });

  it("cleans block attributes and safely degrades links and block refs", () => {
    const cleaned = cleanSiyuanMarkdown([
      "# 标题 {: id=\"heading-id\"}",
      "",
      "正文 ((20240101000000-abcdefg \"引用文字\")) 和 [[双链笔记]]",
      "{: id=\"block-id\" updated=\"20240101000000\"}",
      "",
      "#标签#",
    ].join("\n"));

    expect(cleaned).toContain("# 标题");
    expect(cleaned).not.toContain("{: id=");
    expect(cleaned).toContain("引用文字");
    expect(cleaned).toContain("[双链笔记](");
    expect(cleaned).toContain("#标签#");
  });

  it("adds assets image aliases relative to the note path", () => {
    const enhanced = enhanceSiyuanImageMap(
      {
        "Notebook/assets/a.png": "data:image/png;base64,aaa",
      },
      "Notebook/Doc.md",
    );

    expect(enhanced?.["assets/a.png"]).toBe("data:image/png;base64,aaa");
    expect(enhanced?.["a.png"]).toBe("data:image/png;base64,aaa");
  });

  it("reads Siyuan Markdown zip files as ImportFileInfo while preserving hierarchy", async () => {
    const file = await makeZipFile({
      "Notebook/Section/Doc.md": [
        "# Doc",
        "",
        "![pic](assets/a.png)",
        "",
        "((20240101000000-abcdefg))",
        "{: id=\"block-id\"}",
      ].join("\n"),
      "Notebook/Section/assets/a.png": new Uint8Array([1, 2, 3]),
    });

    const result = await readSiyuanMarkdownZip(file);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].source).toBe("siyuan");
    expect(result.files[0].title).toBe("Doc");
    expect(result.files[0].notebookPath).toContain("Notebook");
    expect(result.files[0].notebookPath).toContain("Section");
    expect(result.files[0].content).not.toContain("{: id=");
    expect(result.files[0].content).toContain("[块引用:");
    expect(result.files[0].imageMap?.["assets/a.png"]).toMatch(/^data:image\/png;base64,/);
  });

  it("reports .sy files without treating a sy-only zip as Markdown import", async () => {
    const file = await makeZipFile({
      "data/20240101000000.sy": JSON.stringify({ Type: "NodeDocument" }),
    });

    const inspection = await inspectSiyuanZip(file);

    expect(inspection.hasSyFiles).toBe(true);
    expect(inspection.hasMarkdownFiles).toBe(false);
    expect(inspection.isSiyuanMarkdownZip).toBe(false);
  });
});
