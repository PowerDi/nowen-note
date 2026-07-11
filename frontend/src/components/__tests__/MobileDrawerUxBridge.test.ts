// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  annotateMobileDrawerControls,
  getSidebarSearchInput,
  shouldCloseDrawerAfterSearchBlur,
  shouldCloseDrawerOnSearchEnter,
} from "@/components/MobileDrawerUxBridge";

describe("MobileDrawerUxBridge helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("closes on a committed Enter but not while an IME is composing", () => {
    expect(shouldCloseDrawerOnSearchEnter({ key: "Enter", isComposing: false, keyCode: 13 }, "测试")).toBe(true);
    expect(shouldCloseDrawerOnSearchEnter({ key: "Enter", isComposing: true, keyCode: 13 }, "ce shi")).toBe(false);
    expect(shouldCloseDrawerOnSearchEnter({ key: "Enter", isComposing: false, keyCode: 229 }, "测试")).toBe(false);
    expect(shouldCloseDrawerOnSearchEnter({ key: "Enter", isComposing: false, keyCode: 13 }, "   ")).toBe(false);
    expect(shouldCloseDrawerOnSearchEnter({ key: "ArrowDown", isComposing: false, keyCode: 40 }, "测试")).toBe(false);
  });

  it("recognizes only the sidebar search input", () => {
    const search = document.createElement("input");
    search.setAttribute("data-sidebar-search", "");
    const ordinary = document.createElement("input");

    expect(getSidebarSearchInput(search)).toBe(search);
    expect(getSidebarSearchInput(ordinary)).toBeNull();
    expect(getSidebarSearchInput(document.createElement("button"))).toBeNull();
  });

  it("keeps the drawer open when the search bridge restores focus", () => {
    const input = document.createElement("input");

    expect(shouldCloseDrawerAfterSearchBlur("关键词", input, input)).toBe(false);
    expect(shouldCloseDrawerAfterSearchBlur("关键词", input, document.body)).toBe(true);
    expect(shouldCloseDrawerAfterSearchBlur("", input, document.body)).toBe(false);
  });

  it("marks menu headers and the mobile rail close control for safe-area styling", () => {
    document.body.innerHTML = `
      <header id="note-header"><button id="menu"><svg class="lucide lucide-menu"></svg></button></header>
      <div id="rail" class="flex md:hidden h-full">
        <button id="close"><svg class="lucide lucide-x"></svg></button>
        <button><svg class="lucide lucide-settings"></svg></button>
      </div>
    `;

    annotateMobileDrawerControls(document);

    expect(document.querySelector("#menu")?.hasAttribute("data-mobile-drawer-trigger")).toBe(true);
    expect(document.querySelector("#note-header")?.hasAttribute("data-mobile-safe-topbar")).toBe(true);
    expect(document.querySelector("#rail")?.hasAttribute("data-mobile-drawer-rail")).toBe(true);
    expect(document.querySelector("#close")?.hasAttribute("data-mobile-drawer-close")).toBe(true);
  });
});
