import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskQuickAdd } from "../TaskQuickAdd";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  api: {
    taskAttachments: {
      upload: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

function QuickAddHarness({ value }: { value: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [title, setTitle] = React.useState(value);
  return (
    <TaskQuickAdd
      value={title}
      onChange={setTitle}
      onSubmit={vi.fn().mockResolvedValue(true)}
      inputRef={inputRef}
    />
  );
}

describe("TaskQuickAdd", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T10:00:00"));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("highlights recognized quick-add tokens", async () => {
    await act(async () => {
      root.render(<QuickAddHarness value="明天12:50提醒我上班" />);
    });

    const tokens = Array.from(host.querySelectorAll<HTMLElement>("[data-recognized-token='true']"));
    expect(tokens.map((token) => token.textContent)).toEqual(["明天12:50提醒我"]);
    expect(tokens[0].className).toContain("text-accent-primary");
  });

  it("highlights recognized repeat tokens", async () => {
    await act(async () => {
      root.render(<QuickAddHarness value="每个工作日 写日报" />);
    });

    const tokens = Array.from(host.querySelectorAll<HTMLElement>("[data-recognized-token='true']"));
    expect(tokens.map((token) => token.textContent)).toEqual(["每个工作日"]);
  });

  it("highlights recognized English tokens", async () => {
    await act(async () => {
      root.render(<QuickAddHarness value="tomorrow 12:50 remind me to work" />);
    });

    const tokens = Array.from(host.querySelectorAll<HTMLElement>("[data-recognized-token='true']"));
    expect(tokens.map((token) => token.textContent)).toEqual(["tomorrow", "12:50", "remind me to"]);
  });
});