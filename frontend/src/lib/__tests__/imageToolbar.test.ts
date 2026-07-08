import { describe, expect, it, vi } from "vitest";
import {
  buildReplacedImageAttrs,
  getImageCopySource,
  getImageDownloadFilename,
  getImageToolbarPosition,
  isImageReplaceTargetNode,
} from "@/lib/imageToolbar";

describe("imageToolbar", () => {
  it("replaces src while preserving persisted image attributes", () => {
    expect(
      buildReplacedImageAttrs(
        {
          src: "/api/attachments/old",
          alt: "示例图",
          title: "图片标题",
          width: 420,
          height: null,
        },
        "/api/attachments/new",
      ),
    ).toEqual({
      src: "/api/attachments/new",
      alt: "示例图",
      title: "图片标题",
      width: 420,
      height: null,
    });
  });

  it("copies the persisted image src instead of a resolved absolute url", () => {
    expect(getImageCopySource({ src: "/api/attachments/image-id" })).toBe("/api/attachments/image-id");
  });

  it("guards replacement against stale non-image targets", () => {
    expect(isImageReplaceTargetNode({ type: { name: "image" } })).toBe(true);
    expect(isImageReplaceTargetNode({ type: { name: "paragraph" } })).toBe(false);
    expect(isImageReplaceTargetNode(null)).toBe(false);
  });

  it("uses title or alt as download filename before falling back to timestamp", () => {
    expect(getImageDownloadFilename({ title: "  标题.png  ", alt: "替代文本" })).toBe("标题.png");
    expect(getImageDownloadFilename({ alt: "  替代文本  " })).toBe("替代文本");

    vi.setSystemTime(new Date("2026-07-08T00:00:00Z"));
    expect(getImageDownloadFilename({})).toBe("nowen-image-1783468800000");
    vi.useRealTimers();
  });

  it("places the image toolbar above the image when there is enough room", () => {
    expect(
      getImageToolbarPosition(
        { top: 240, bottom: 640, left: 100, right: 900, width: 800 },
        { width: 1200, height: 800 },
      ),
    ).toEqual({ top: 192, left: 360 });
  });

  it("places the image toolbar below the image when the image is near the top", () => {
    expect(
      getImageToolbarPosition(
        { top: 24, bottom: 424, left: 100, right: 900, width: 800 },
        { width: 1200, height: 800 },
      ),
    ).toEqual({ top: 432, left: 360 });
  });
});
