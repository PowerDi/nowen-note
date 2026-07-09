import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "../MarkdownPreview";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("MarkdownPreview task checkboxes", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("emits the clicked task index and next checked state", async () => {
    const onTaskCheckboxChange = vi.fn();

    await act(async () => {
      root.render(
        <React.StrictMode>
          <MarkdownPreview
            markdown={"- [x] done\n- [ ] todo"}
            onTaskCheckboxChange={onTaskCheckboxChange}
          />
        </React.StrictMode>,
      );
    });

    const checkboxes = host.querySelectorAll<HTMLInputElement>("input[type='checkbox']");
    expect(checkboxes).toHaveLength(2);

    await act(async () => {
      checkboxes[1].click();
    });

    expect(onTaskCheckboxChange).toHaveBeenCalledWith(1, true);
  });
});
