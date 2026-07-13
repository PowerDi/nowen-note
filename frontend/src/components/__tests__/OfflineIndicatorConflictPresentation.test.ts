import { describe, expect, it } from "vitest";
import type { OfflineQueueItem } from "@/lib/offlineQueue";
import {
  getQueueItemNotePreview,
  getQueueItemNoteTitle,
  getQueueItemStatusMessage,
} from "../common/OfflineIndicator";

function conflictItem(overrides: Partial<OfflineQueueItem> = {}): OfflineQueueItem {
  return {
    id: "queue-1",
    type: "updateNote",
    noteId: "1a87b7d9-2d9d-40f4-b7e2-871ec488807e",
    url: "/notes/1a87b7d9-2d9d-40f4-b7e2-871ec488807e",
    method: "PUT",
    body: {
      title: "产品需求记录",
      content: "# 产品需求记录\n\n同步冲突处理方案",
      contentText: "同步冲突处理方案",
      version: 3,
    },
    localPayload: {
      title: "产品需求记录",
      content: "# 产品需求记录\n\n同步冲突处理方案",
      contentText: "同步冲突处理方案",
      version: 3,
    },
    enqueuedAt: Date.now(),
    retryCount: 0,
    conflict: true,
    blocked: true,
    errorCode: "VERSION_CONFLICT",
    message: "Version conflict detected. Auto overwrite was stopped. Please refresh or resolve from version history.",
    ...overrides,
  };
}

describe("OfflineIndicator conflict presentation", () => {
  it("shows the note title from the preserved local payload", () => {
    expect(getQueueItemNoteTitle(conflictItem())).toBe("产品需求记录");
  });

  it("shows a readable content preview instead of the note id", () => {
    expect(getQueueItemNotePreview(conflictItem())).toBe("同步冲突处理方案");
  });

  it("replaces persisted English conflict errors with a clear Chinese explanation", () => {
    expect(getQueueItemStatusMessage(conflictItem())).toBe("已停止自动覆盖，本地内容已保留，请处理版本冲突。");
  });

  it("falls back safely when old queue data has no title or content", () => {
    const item = conflictItem({ body: null, localPayload: null });
    expect(getQueueItemNoteTitle(item)).toBe("未命名笔记");
    expect(getQueueItemNotePreview(item)).toBe("");
  });
});
