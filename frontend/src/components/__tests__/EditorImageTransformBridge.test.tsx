import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { afterEach, describe, expect, it } from "vitest";
import "@/lib/imageNodeTransformBootstrap";
import {
  findImageTransformWrapper,
  updateImageAttributesAt,
} from "@/components/EditorImageTransformBridge";

describe("EditorImageTransformBridge", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("applies transforms to the inline-block image wrapper inside a React NodeView", () => {
    document.body.innerHTML = `
      <span class="react-renderer node-image">
        <span class="resizable-image-wrapper" style="display: inline-block">
          <img src="/image.png">
        </span>
      </span>
    `;
    const nodeView = document.querySelector<HTMLElement>(".react-renderer")!;
    const wrapper = document.querySelector<HTMLElement>(".resizable-image-wrapper")!;

    expect(findImageTransformWrapper(nodeView)).toBe(wrapper);
    expect(findImageTransformWrapper(nodeView)).not.toBe(nodeView);
  });

  it("keeps supporting a DOM node nested inside the image wrapper", () => {
    document.body.innerHTML = `
      <span class="resizable-image-wrapper"><img src="/image.png"></span>
    `;
    const image = document.querySelector<HTMLElement>("img")!;

    expect(findImageTransformWrapper(image)).toBe(
      document.querySelector(".resizable-image-wrapper"),
    );
  });

  it("updates a selected inline image without dispatching a focus transaction", () => {
    const editor = new Editor({
      extensions: [StarterKit, Image.configure({ inline: true })],
      content: {
        type: "doc",
        content: [{
          type: "paragraph",
          content: [{
            type: "image",
            attrs: { src: "/image.png", rotation: 0, flipX: false },
          }],
        }],
      },
    });

    expect(updateImageAttributesAt(editor, 1, { rotation: 90 })).toBe(true);
    expect(editor.state.doc.nodeAt(1)?.attrs.rotation).toBe(90);
    expect(editor.state.doc.nodeAt(1)?.attrs.src).toBe("/image.png");
    editor.destroy();
  });
});
