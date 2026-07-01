import { describe, expect, it } from "vitest";
import { getNodeScreenRect, hitTestSelectionRect, rectsIntersect } from "../MindMapEditor";

const node = { id: "node-1", x: 200, y: 100, width: 80, height: 36 };

describe("mind map selection hit testing", () => {
  it("projects a layout node into canvas screen coordinates", () => {
    expect(getNodeScreenRect(node, { x: 100, y: 50 }, 1)).toEqual({
      x: 300,
      y: 150,
      width: 80,
      height: 36,
    });
  });

  it("hits a node with pan at zoom 1", () => {
    const ids = hitTestSelectionRect(
      { x: 250, y: 120, width: 140, height: 100 },
      [node],
      { x: 100, y: 50 },
      1,
    );

    expect(ids).toEqual(["node-1"]);
  });

  it("hits a node at zoom 0.6", () => {
    const ids = hitTestSelectionRect(
      { x: 220, y: 105, width: 70, height: 45 },
      [node],
      { x: 100, y: 50 },
      0.6,
    );

    expect(ids).toEqual(["node-1"]);
  });

  it("hits a node at zoom 1.5", () => {
    const ids = hitTestSelectionRect(
      { x: 390, y: 195, width: 80, height: 40 },
      [node],
      { x: 100, y: 50 },
      1.5,
    );

    expect(ids).toEqual(["node-1"]);
  });

  it("selects when the rectangle only partially covers the node", () => {
    expect(rectsIntersect({ x: 370, y: 170, width: 20, height: 20 }, getNodeScreenRect(node, { x: 100, y: 50 }, 1))).toBe(true);
  });

  it("does not select when the rectangle misses the node", () => {
    const ids = hitTestSelectionRect(
      { x: 10, y: 10, width: 40, height: 40 },
      [node],
      { x: 100, y: 50 },
      1,
    );

    expect(ids).toEqual([]);
  });

  it("hits after a reverse drag has been normalized", () => {
    const normalizedReverseDrag = { x: 280, y: 140, width: 80, height: 70 };
    const ids = hitTestSelectionRect(normalizedReverseDrag, [node], { x: 100, y: 50 }, 1);

    expect(ids).toEqual(["node-1"]);
  });
});
