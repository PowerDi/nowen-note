import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NoteTabsBar from "../NoteTabsBar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  state: {
    openNoteTabs: [
      {
        id: "note-1",
        title: "笔记一",
        notebookId: "notebook-1",
        workspaceId: null,
        contentFormat: "tiptap-json",
        updatedAt: "2026-07-14T08:00:00.000Z",
      },
      {
        id: "note-2",
        title: "笔记二",
        notebookId: "notebook-1",
        workspaceId: null,
        contentFormat: "markdown",
        updatedAt: "2026-07-14T09:00:00.000Z",
      },
    ],
    activeNote: {
      id: "note-1",
      title: "笔记一",
      notebookId: "notebook-1",
    },
    noteLoading: false,
    notebooks: [],
    selectedNotebookId: null,
  },
  actions: {
    setNoteLoading: vi.fn(),
    setActiveNote: vi.fn(),
    setMobileView: vi.fn(),
    openNoteTab: vi.fn(),
    closeNoteTab: vi.fn(),
    setNoteTabs: vi.fn(),
    clearNoteTabs: vi.fn(),
    updateNoteTab: vi.fn(),
    splitEditor: vi.fn(),
    closeEditorSplit: vi.fn(),
    clearEditorSplits: vi.fn(),
    addNoteToList: vi.fn(),
    refreshNotebooks: vi.fn(),
    refreshNotes: vi.fn(),
  },
  api: {
    getNote: vi.fn(),
    createNote: vi.fn(),
  },
}));

vi.mock("@/store/AppContext", () => ({
  useApp: () => ({ state: mocks.state }),
  useAppActions: () => mocks.actions,
}));

vi.mock("@/lib/api", () => ({ api: mocks.api }));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) =>
      params?.count === undefined ? key : `${key}:${params.count}`,
  }),
}));

describe("NoteTabsBar 全部标签列表", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.api.getNote.mockResolvedValue({
      id: "note-2",
      title: "笔记二",
      notebookId: "notebook-1",
      workspaceId: null,
      contentFormat: "markdown",
      updatedAt: "2026-07-14T09:00:00.000Z",
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<NoteTabsBar />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  async function openSwitcher() {
    const button = document.querySelector<HTMLButtonElement>(
      '[aria-label="editorTabs.allOpenedTabs"]',
    );
    expect(button).not.toBeNull();
    await act(async () => {
      button!.click();
    });
  }

  it("从固定入口展开全部标签并标记当前标签", async () => {
    await openSwitcher();

    const menu = document.querySelector('[data-testid="note-tabs-switcher"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("笔记一");
    expect(menu?.textContent).toContain("笔记二");
    expect(menu?.querySelector('[data-note-tab-id="note-1"]')?.getAttribute("aria-current"))
      .toBe("page");
  });

  it("从列表切换笔记后收起列表", async () => {
    await openSwitcher();

    const target = document.querySelector<HTMLButtonElement>('[data-note-tab-id="note-2"]');
    expect(target).not.toBeNull();
    await act(async () => {
      target!.click();
      await Promise.resolve();
    });

    expect(mocks.api.getNote).toHaveBeenCalledWith("note-2");
    expect(mocks.actions.setActiveNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: "note-2" }),
    );
    expect(document.querySelector('[data-testid="note-tabs-switcher"]')).toBeNull();
  });

  it("支持关闭列表中的标签并用 Escape 收起", async () => {
    await openSwitcher();

    const closeButton = document.querySelector<HTMLButtonElement>(
      '[data-close-note-tab-id="note-2"]',
    );
    expect(closeButton).not.toBeNull();
    await act(async () => {
      closeButton!.click();
    });
    expect(mocks.actions.closeNoteTab).toHaveBeenCalledWith("note-2");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector('[data-testid="note-tabs-switcher"]')).toBeNull();
  });
});
