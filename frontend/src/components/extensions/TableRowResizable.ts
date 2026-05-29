/**
 * TableRowResizable —— 带"行高拖拽"的 TableRow 扩展
 * ------------------------------------------------------------
 * 扩展自 @tiptap/extension-table 的 TableRow：
 *   1) 新增持久化 attribute `height`（数字，单位 px），渲染为 <tr style="height: Npx">
 *      → 让 TipTap schema 不会过滤掉它，存档/导出 HTML 都保留
 *   2) 注册一个 ProseMirror plugin，给每个 <tr> 底边加一个透明 5px 的拖拽热区：
 *        - hover 时 cursor 变 row-resize，并显示一条蓝色横线
 *        - mousedown → mousemove 实时算 newHeight = startHeight + dy
 *        - mouseup 一次性写入 transaction，避免拖拽过程产生大量 history
 *
 * 注意点：
 *   - 行高存在 <tr> 上，浏览器会让该行所有 td 同步撑高（td 默认 vertical-align: top）
 *   - 这是 min-height 语义：内容超出仍会撑开，符合用户直觉
 *   - Markdown 导出会丢 height（MD 表格语法不支持高度，无解）
 *   - schema 在所有"用 generateHTML/generateJSON"的旁路文件里也得换成本扩展，
 *     否则解析时 height 会被过滤
 *
 * 仅"主编辑器"需要拖拽插件，其他旁路（contentFormat / exportService 等）只
 * 需要 attribute schema 兼容即可，所以提供两份：
 *   - TableRowResizable: 包含拖拽 plugin（用于 TiptapEditor 主实例）
 *   - TableRowWithHeight: 仅 attribute schema（用于旁路 generateHTML/JSON）
 */

import { TableRow } from "@tiptap/extension-table";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const ROW_RESIZE_HANDLE_HEIGHT = 5; // 拖拽热区高度（px）
const MIN_ROW_HEIGHT = 24; // 最小行高，防止拖到看不见

/**
 * 仅 attribute 增强版（不带拖拽插件）。
 * 用于 generateHTML / generateJSON 的旁路 schema：
 *   - contentFormat.ts / exportService.ts / importService.ts /
 *     wordNoteService.ts / youdaoNoteService.ts
 * 必须用这个版本替换裸 TableRow，否则 height 会被 schema 过滤。
 */
export const TableRowWithHeight = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null as number | null,
        parseHTML: (element) => {
          // 1) style="height: 80px"
          const styleHeight = element.style.height;
          if (styleHeight) {
            const m = /^(\d+(?:\.\d+)?)/.exec(styleHeight);
            if (m) return Math.round(parseFloat(m[1]));
          }
          // 2) <tr height="80">（旧 HTML 兼容）
          const attrHeight = element.getAttribute("height");
          if (attrHeight) {
            const n = parseInt(attrHeight, 10);
            if (!Number.isNaN(n)) return n;
          }
          return null;
        },
        renderHTML: (attrs) => {
          if (attrs.height == null) return {};
          return { style: `height: ${attrs.height}px` };
        },
      },
    };
  },
});

/**
 * 拖拽手柄 ProseMirror plugin。
 * 通过单一 mousemove listener 检测鼠标是否落在某个 <tr> 底边的
 * ROW_RESIZE_HANDLE_HEIGHT 范围内，命中即标灰一条横线 + 切 cursor。
 */
function rowResizePlugin(): Plugin {
  // 把可视手柄做成单例 DOM，hover 时 absolute 定位到对应行底边
  let handleEl: HTMLDivElement | null = null;
  // 拖拽中的状态
  let dragging: {
    rowEl: HTMLTableRowElement;
    rowPos: number; // <tr> 在 doc 中的位置
    startY: number;
    startHeight: number;
    view: EditorView;
  } | null = null;

  function ensureHandle(view: EditorView): HTMLDivElement {
    if (handleEl) return handleEl;
    const el = document.createElement("div");
    el.className = "tiptap-row-resize-handle";
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.height = `${ROW_RESIZE_HANDLE_HEIGHT}px`;
    el.style.zIndex = "20";
    el.style.cursor = "row-resize";
    el.style.background = "transparent";
    el.style.display = "none";
    // 挂到编辑器外层（view.dom 的 offsetParent 上），避免被 contenteditable 截获
    const parent = (view.dom as HTMLElement).offsetParent || document.body;
    parent.appendChild(el);
    handleEl = el;
    return el;
  }

  function hideHandle() {
    if (handleEl) handleEl.style.display = "none";
  }

  function findRowAtY(target: HTMLElement, clientX: number, clientY: number): HTMLTableRowElement | null {
    // 找到鼠标点下方所属的 <tr>：先看 elementFromPoint，再向上回溯
    const node = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!node) return null;
    const tr = node.closest("tr") as HTMLTableRowElement | null;
    if (!tr) return null;
    if (!target.contains(tr)) return null;
    return tr;
  }

  function getRowDocPos(view: EditorView, rowEl: HTMLTableRowElement): number | null {
    // 让 prosemirror 帮我们算 <tr> 节点在 doc 中的位置
    // 取 <tr> 第一个文本子节点的 posAtDOM 然后回溯到 row 起点
    const rect = rowEl.getBoundingClientRect();
    const posAtCoords = view.posAtCoords({ left: rect.left + 1, top: rect.top + 1 });
    if (!posAtCoords) return null;
    const $pos = view.state.doc.resolve(posAtCoords.pos);
    // 向上找 tableRow 节点
    for (let depth = $pos.depth; depth >= 0; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === "tableRow") {
        return $pos.before(depth);
      }
    }
    return null;
  }

  return new Plugin({
    key: new PluginKey("tableRowResize"),
    view: (view) => {
      const onMouseMove = (e: MouseEvent) => {
        // 拖拽中：实时改 DOM 高度，等到 mouseup 再写 doc
        if (dragging) {
          const dy = e.clientY - dragging.startY;
          const next = Math.max(MIN_ROW_HEIGHT, dragging.startHeight + dy);
          dragging.rowEl.style.height = `${next}px`;
          return;
        }
        // 非拖拽：检测是否 hover 在某行底边
        const target = view.dom as HTMLElement;
        const rowEl = findRowAtY(target, e.clientX, e.clientY);
        if (!rowEl) {
          hideHandle();
          return;
        }
        const rect = rowEl.getBoundingClientRect();
        const distFromBottom = rect.bottom - e.clientY;
        if (distFromBottom < 0 || distFromBottom > ROW_RESIZE_HANDLE_HEIGHT + 2) {
          hideHandle();
          return;
        }
        // 命中 → 显示手柄
        const handle = ensureHandle(view);
        const parent = handle.parentElement!;
        const parentRect = parent.getBoundingClientRect();
        handle.style.display = "block";
        handle.style.top = `${rect.bottom - parentRect.top - ROW_RESIZE_HANDLE_HEIGHT / 2}px`;
        handle.style.left = `${rect.left - parentRect.left}px`;
        handle.style.width = `${rect.width}px`;
        // 记录待拖拽的行（mousedown 时可能 elementFromPoint 不准）
        handle.dataset.rowTop = String(rect.top);
        handle.dataset.rowHeight = String(rect.height);
        // 用闭包变量缓存
        (handle as any)._rowEl = rowEl;
      };

      const onMouseDown = (e: MouseEvent) => {
        if (!handleEl || handleEl.style.display === "none") return;
        const rowEl = (handleEl as any)._rowEl as HTMLTableRowElement | undefined;
        if (!rowEl) return;
        // 仅当鼠标在手柄区域内才开始拖拽
        const handleRect = handleEl.getBoundingClientRect();
        if (
          e.clientX < handleRect.left ||
          e.clientX > handleRect.right ||
          e.clientY < handleRect.top - 2 ||
          e.clientY > handleRect.bottom + 2
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const pos = getRowDocPos(view, rowEl);
        if (pos == null) return;
        dragging = {
          rowEl,
          rowPos: pos,
          startY: e.clientY,
          startHeight: rowEl.getBoundingClientRect().height,
          view,
        };
        document.body.style.cursor = "row-resize";
        // 拖拽时禁用文本选择，避免误选
        document.body.style.userSelect = "none";
      };

      const onMouseUp = (e: MouseEvent) => {
        if (!dragging) return;
        const dy = e.clientY - dragging.startY;
        const finalHeight = Math.max(MIN_ROW_HEIGHT, Math.round(dragging.startHeight + dy));
        const { rowPos, view: v } = dragging;
        // 一次性写 transaction
        const node = v.state.doc.nodeAt(rowPos);
        if (node && node.type.name === "tableRow") {
          const tr = v.state.tr.setNodeMarkup(rowPos, undefined, {
            ...node.attrs,
            height: finalHeight,
          });
          v.dispatch(tr);
        }
        // 清掉行内 inline style，让 schema 渲染接管
        dragging.rowEl.style.height = "";
        dragging = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        hideHandle();
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mousedown", onMouseDown, true);
      window.addEventListener("mouseup", onMouseUp, true);

      return {
        destroy() {
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mousedown", onMouseDown, true);
          window.removeEventListener("mouseup", onMouseUp, true);
          if (handleEl && handleEl.parentElement) {
            handleEl.parentElement.removeChild(handleEl);
          }
          handleEl = null;
          dragging = null;
        },
      };
    },
  });
}

/**
 * 主编辑器版本：attribute + 拖拽 plugin。
 * 在 TiptapEditor.tsx 里替换原裸 TableRow。
 */
export const TableRowResizable = TableRowWithHeight.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      rowResizePlugin(),
    ];
  },
});

export default TableRowResizable;
