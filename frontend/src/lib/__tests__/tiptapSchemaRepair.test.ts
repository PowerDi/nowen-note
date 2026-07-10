import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import "@/lib/imageNodeTransformBootstrap";
import { tiptapExtensions } from "@/lib/importService";
import { repairTiptapJson } from "@/lib/tiptapSchemaRepair";

describe("repairTiptapJson", () => {
  it("wraps a legacy root image in a paragraph for the inline image schema", () => {
    const repaired = repairTiptapJson({
      type: "doc",
      content: [{
        type: "image",
        attrs: {
          src: "/api/attachments/image-id",
          alt: null,
          title: null,
          width: 791,
          height: null,
          rotation: 90,
          flipX: true,
        },
      }],
    }) as any;

    expect(repaired.content).toHaveLength(1);
    expect(repaired.content[0].type).toBe("paragraph");
    expect(repaired.content[0].content[0]).toMatchObject({
      type: "image",
      attrs: {
        src: "/api/attachments/image-id",
        width: 791,
        rotation: 90,
        flipX: true,
      },
    });

    const editor = new Editor({ extensions: tiptapExtensions, content: repaired });
    expect(() => editor.state.doc.check()).not.toThrow();
    editor.destroy();
  });
});
