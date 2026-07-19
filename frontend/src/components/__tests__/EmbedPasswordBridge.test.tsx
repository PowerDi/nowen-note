// @vitest-environment jsdom

import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmbedPasswordBridge, { isControlledSameOriginEmbed } from "@/components/EmbedPasswordBridge";

const roots: Array<ReturnType<typeof createRoot>> = [];

async function mountBridge() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  root.render(<EmbedPasswordBridge />);
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function appendPreviewIframe(src: string) {
  const preview = document.createElement("div");
  preview.className = "nowen-md-preview";
  const frame = document.createElement("iframe");
  frame.src = src;
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  preview.appendChild(frame);
  document.body.appendChild(preview);
  return frame;
}

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("EmbedPasswordBridge", () => {
  it("recognizes only controlled same-origin routes for script-enabled DOM access", () => {
    expect(isControlledSameOriginEmbed(new URL("http://localhost/embed/unlock"), "http://localhost")).toBe(true);
    expect(isControlledSameOriginEmbed(new URL("http://localhost/note/123"), "http://localhost")).toBe(false);
    expect(isControlledSameOriginEmbed(new URL("https://example.com/embed"), "http://localhost")).toBe(false);
  });

  it("fills an accessible same-origin password field and exposes a manual fallback", async () => {
    await mountBridge();
    const iframe = appendPreviewIframe("http://localhost/embed/unlock?password=secret-284");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const input = iframe.contentDocument?.createElement("input");
    expect(input).toBeTruthy();
    input!.type = "password";
    iframe.contentDocument!.body.appendChild(input!);
    iframe.dispatchEvent(new Event("load"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(input!.value).toBe("secret-284");
    expect(iframe.getAttribute("sandbox")).toContain("allow-same-origin");
    expect(iframe.parentElement?.textContent).toContain("密码已填写");
    expect(iframe.parentElement?.textContent).toContain("复制密码");
  });

  it("sends a password-free capability offer to an ordinary cross-origin frame", async () => {
    await mountBridge();
    const iframe = appendPreviewIframe("https://example.com/embed?pwd=hidden-value");
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
    iframe.dispatchEvent(new Event("load"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(postMessage).toHaveBeenCalled();
    const offers = postMessage.mock.calls.map((call) => call[0] as any);
    expect(offers.some((message) => message?.type === "nowen:embed-password-offer")).toBe(true);
    expect(offers.every((message) => !("password" in message))).toBe(true);
    expect(iframe.parentElement?.textContent).toContain("页面确认后");
  });
});
