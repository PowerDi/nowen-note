import { describe, expect, it } from "vitest";
import * as syncEngine from "@/lib/syncEngine";
import {
  countVersionConflicts,
  findLocallyDeletedQueuedNoteIds,
} from "@/lib/syncEngine";

describe("syncEngine sync summary", () => {
  it("counts only version-conflict queue entries as conflicts", () => {
    expect(countVersionConflicts([
      { conflict: true },
      { errorCode: "VERSION_CONFLICT" },
      { errorCode: "NETWORK_ERROR" },
      {},
    ])).toBe(2);
  });

  it("finds queued notes that the local cache already marks as trashed", () => {
    expect(findLocallyDeletedQueuedNoteIds(
      [
        { id: "trashed-conflict", isTrashed: 1 },
        { id: "active-conflict", isTrashed: 0 },
        { id: "trashed-without-queue", isTrashed: 1 },
      ],
      [
        { noteId: "trashed-conflict" },
        { noteId: "active-conflict" },
      ],
    )).toEqual(["trashed-conflict"]);
  });

  it("cleans only conflicts that the server confirms are deleted or trashed", async () => {
    const findServerDeletedQueuedNoteIds = (
      syncEngine as typeof syncEngine & {
        findServerDeletedQueuedNoteIds?: (
          remoteNoteIds: ReadonlySet<string>,
          queuedItems: Array<{ noteId: string; type: string; conflict?: boolean; errorCode?: string }>,
          fetchNote: (noteId: string) => Promise<{ isTrashed?: number }>,
        ) => Promise<string[]>;
      }
    ).findServerDeletedQueuedNoteIds ?? (async () => []);
    const lookedUp: string[] = [];

    const removed = await findServerDeletedQueuedNoteIds(
      new Set(["listed-conflict"]),
      [
        { noteId: "listed-conflict", type: "updateNote", conflict: true },
        { noteId: "deleted-conflict", type: "updateNote", errorCode: "VERSION_CONFLICT" },
        { noteId: "trashed-conflict", type: "updateNote", conflict: true },
        { noteId: "active-conflict", type: "updateNote", conflict: true },
        { noteId: "network-failure", type: "updateNote", conflict: true },
        { noteId: "offline-create", type: "createNote" },
      ],
      async (noteId) => {
        lookedUp.push(noteId);
        if (noteId === "deleted-conflict") throw Object.assign(new Error("not found"), { status: 404 });
        if (noteId === "trashed-conflict") return { isTrashed: 1 };
        if (noteId === "active-conflict") return { isTrashed: 0 };
        throw Object.assign(new Error("temporary failure"), { status: 503 });
      },
    );

    expect(removed).toEqual(["deleted-conflict", "trashed-conflict"]);
    expect(lookedUp).toEqual([
      "deleted-conflict",
      "trashed-conflict",
      "active-conflict",
      "network-failure",
    ]);
  });
});
