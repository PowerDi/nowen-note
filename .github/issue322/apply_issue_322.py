from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def regex_replace_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return updated


# ---------------------------------------------------------------------------
# Editor behavior and toolbar state
# ---------------------------------------------------------------------------
editor_path = "frontend/src/components/TiptapEditor.tsx"
editor = read(editor_path)

editor = replace_once(
    editor,
    'import { useTranslation } from "react-i18next";\n',
    'import { useTranslation } from "react-i18next";\n'
    'import { getActiveListType, type ActiveListType } from "@/lib/activeListType";\n',
    "TiptapEditor active-list import",
)

editor = replace_once(
    editor,
    '''        // 任务列表 / 普通列表：sink / lift
        if (isInTaskList()) {
          const ok = delta === 1
            ? editor.chain().focus().sinkListItem("taskItem").run()
            : editor.chain().focus().liftListItem("taskItem").run();
          if (ok) return true;
          // 若无法 sink/lift（例如已是最外层），退化为块级 indent
        } else if (isInBulletOrOrdered()) {
          const ok = delta === 1
            ? editor.chain().focus().sinkListItem("listItem").run()
            : editor.chain().focus().liftListItem("listItem").run();
          if (ok) {
            normalizeAdjacentLists(editor);
            return true;
          }
        }

        // 其余：调整块级 indent 属性
        return editor.chain().focus().changeIndent(delta).run();
''',
    '''        // 列表内的 Tab 只调整列表层级，不退化为块级视觉缩进。
        if (isInTaskList()) {
          if (delta === 1) {
            editor.chain().focus().sinkListItem("taskItem").run();
          } else {
            editor.chain().focus().liftListItem("taskItem").run();
          }
          return true;
        }
        if (isInBulletOrOrdered()) {
          const changed = delta === 1
            ? editor.chain().focus().sinkListItem("listItem").run()
            : editor.chain().focus().liftListItem("listItem").run();
          if (changed) normalizeAdjacentLists(editor);
          return true;
        }

        // 仅普通块级内容使用视觉缩进。
        return editor.chain().focus().changeIndent(delta).run();
''',
    "TiptapEditor Tab behavior",
)

editor = replace_once(
    editor,
    '  const [wordStats, setWordStats] = useState({ chars: 0, charsNoSpace: 0, words: 0 });\n',
    '  const [wordStats, setWordStats] = useState({ chars: 0, charsNoSpace: 0, words: 0 });\n'
    '  const [activeListType, setActiveListType] = useState<ActiveListType>(null);\n'
    '  const activeListTypeRef = useRef<ActiveListType>(null);\n'
    '  const syncActiveListType = useCallback((currentEditor: Editor | null) => {\n'
    '    const next = getActiveListType(currentEditor);\n'
    '    if (activeListTypeRef.current === next) return;\n'
    '    activeListTypeRef.current = next;\n'
    '    setActiveListType(next);\n'
    '  }, []);\n',
    "TiptapEditor active-list state",
)

editor = replace_once(
    editor,
    '''    onTransaction: ({ transaction }) => {
      mapAsyncInsertAnchors(asyncInsertAnchorsRef.current, transaction);
    },
''',
    '''    onCreate: ({ editor }) => {
      syncActiveListType(editor);
    },
    onTransaction: ({ editor, transaction }) => {
      mapAsyncInsertAnchors(asyncInsertAnchorsRef.current, transaction);
      syncActiveListType(editor);
    },
''',
    "TiptapEditor transaction subscription",
)

for node_name in ("bulletList", "orderedList", "taskList"):
    editor = replace_once(
        editor,
        f'isActive={{editor.isActive("{node_name}")}}',
        f'isActive={{activeListType === "{node_name}"}}',
        f"TiptapEditor {node_name} toolbar state",
    )

write(editor_path, editor)

write(
    "frontend/src/lib/activeListType.ts",
    '''export type ActiveListType = "bulletList" | "orderedList" | "taskList" | null;

interface EditorSelectionPath {
  depth: number;
  node: (depth: number) => { type: { name: string } };
}

interface EditorLike {
  state: {
    selection: {
      $from: EditorSelectionPath;
    };
  };
}

/** 返回光标最近的列表祖先，避免混合嵌套时多个列表状态同时命中。 */
export function getActiveListType(editor: EditorLike | null): ActiveListType {
  if (!editor) return null;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name;
    if (name === "bulletList" || name === "orderedList" || name === "taskList") {
      return name;
    }
  }
  return null;
}
''',
)

write(
    "frontend/src/lib/__tests__/activeListType.test.ts",
    '''import { describe, expect, it } from "vitest";
import { getActiveListType } from "@/lib/activeListType";

function editorWithPath(names: string[]) {
  return {
    state: {
      selection: {
        $from: {
          depth: names.length - 1,
          node: (depth: number) => ({ type: { name: names[depth] } }),
        },
      },
    },
  };
}

describe("getActiveListType", () => {
  it("returns the nearest list in mixed nested lists", () => {
    const editor = editorWithPath([
      "doc",
      "orderedList",
      "listItem",
      "bulletList",
      "listItem",
      "paragraph",
    ]);
    expect(getActiveListType(editor)).toBe("bulletList");
  });

  it("recognizes task lists and non-list selections", () => {
    expect(getActiveListType(editorWithPath(["doc", "taskList", "taskItem", "paragraph"]))).toBe("taskList");
    expect(getActiveListType(editorWithPath(["doc", "paragraph"]))).toBeNull();
    expect(getActiveListType(null)).toBeNull();
  });
});
''',
)


# ---------------------------------------------------------------------------
# Shared marker CSS for editor and public share view
# ---------------------------------------------------------------------------
css_path = "frontend/src/index.css"
css = read(css_path)

editor_list_css = '''.ProseMirror ul {
  padding-left: 1.6em;
  margin: 0.75rem 0;
  list-style: none !important;
  --nowen-ul-marker: "•";
  --nowen-ul-marker-size: 1.1em;
  --nowen-ul-marker-top: 0;
}

/* 无序列表符号显式覆盖 1～9 层；更深层级沿用第 9 层样式。 */
.ProseMirror ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.ProseMirror ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
.ProseMirror ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.ProseMirror ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.ProseMirror ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
.ProseMirror ul ul ul ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.ProseMirror ul ul ul ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.ProseMirror ul ul ul ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }

.ProseMirror ul > li:not([data-type="taskItem"]):not(.task-list-item) {
  position: relative;
}

.ProseMirror ul > li:not([data-type="taskItem"]):not(.task-list-item)::before {
  content: var(--nowen-ul-marker);
  position: absolute;
  left: -1.2em;
  top: var(--nowen-ul-marker-top);
  color: var(--pm-text);
  font-size: var(--nowen-ul-marker-size);
  line-height: 1;
}

.ProseMirror ul.contains-task-list > li.task-list-item::before,
.ProseMirror ul[data-type="taskList"] > li[data-type="taskItem"]::before {
  content: none !important;
}

.ProseMirror ol {
  padding-left: 1.6em;
  margin: 0.75rem 0;
  list-style-type: decimal !important;
  -webkit-padding-start: 1.6em;
}

.ProseMirror ol > li {
  display: list-item !important;
  list-style-type: decimal !important;
}

/* 确保嵌套有序列表仅影响自己的直接列表项。 */
.ProseMirror ol > li > ol > li {
  list-style-type: lower-alpha !important;
}

.ProseMirror ol > li > ol > li > ol > li {
  list-style-type: lower-roman !important;
}

'''

css = regex_replace_once(
    css,
    r'\.ProseMirror ul \{.*?(?=\.ProseMirror li:not\(\[data-type="taskItem"\]\) \{)',
    editor_list_css,
    "index.css editor list region",
)
css = css.replace(".ProseMirror ol li {", ".ProseMirror ol > li {")

shared_list_css = '''.shared-note-content ul,
.shared-note-content ol {
  margin: 0.85em 0;
  padding-left: 1.6em;
}
.shared-note-content ul {
  list-style: none !important;
  --nowen-ul-marker: "•";
  --nowen-ul-marker-size: 1.1em;
  --nowen-ul-marker-top: 0;
}
.shared-note-content ol { list-style: decimal; }
.shared-note-content ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.shared-note-content ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
.shared-note-content ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.shared-note-content ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.shared-note-content ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
.shared-note-content ul ul ul ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.shared-note-content ul ul ul ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
.shared-note-content ul ul ul ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }

.shared-note-content ul > li:not([data-type="taskItem"]):not(.task-list-item) {
  position: relative;
}

.shared-note-content ul > li:not([data-type="taskItem"]):not(.task-list-item)::before {
  content: var(--nowen-ul-marker);
  position: absolute;
  left: -1.2em;
  top: var(--nowen-ul-marker-top);
  font-size: var(--nowen-ul-marker-size);
  line-height: 1;
}

.shared-note-content ul.contains-task-list > li.task-list-item::before,
.shared-note-content ul[data-type="taskList"] > li[data-type="taskItem"]::before {
  content: none !important;
}
'''

css = regex_replace_once(
    css,
    r'\.shared-note-content ul,\n\.shared-note-content ol \{.*?(?=\.shared-note-content li \{)',
    shared_list_css,
    "index.css shared list region",
)
write(css_path, css)


# ---------------------------------------------------------------------------
# Printable/PDF and PNG export CSS
# ---------------------------------------------------------------------------
export_path = "frontend/src/lib/exportServiceCore.ts"
export_source = read(export_path)
export_source = regex_replace_once(
    export_source,
    r'    \.content ul, \.content ol \{ padding-left: 1\.4em; margin: 8px 0; \}\n'
    r'.*?'
    r'    \.content ul\[data-type="taskList"\] li > div \{ flex: 1; \}\n',
    '''    .content ul, .content ol { padding-left: 1.6em; margin: 8px 0; }
    .content ul { list-style: none !important; --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .content ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .content ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
    .content ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .content ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .content ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
    .content ul ul ul ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .content ul ul ul ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .content ul ul ul ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
    .content ul > li:not([data-type="taskItem"]):not(.task-list-item) { position: relative; }
    .content ul > li:not([data-type="taskItem"]):not(.task-list-item)::before { content: var(--nowen-ul-marker); position: absolute; left: -1.2em; top: var(--nowen-ul-marker-top); font-size: var(--nowen-ul-marker-size); line-height: 1; }
    .content ul.contains-task-list > li.task-list-item::before,
    .content ul[data-type="taskList"] > li[data-type="taskItem"]::before { content: none !important; }
    .content ul[data-type="taskList"], .content ul.contains-task-list { list-style: none; padding-left: 0.5em; }
    .content li[data-type="taskItem"], .content li.task-list-item { list-style: none; }
    .content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; margin: 4px 0; }
    .content ul[data-type="taskList"] li > label { user-select: none; }
    .content ul[data-type="taskList"] li > div { flex: 1; }
    .content input[type="checkbox"] { margin-right: 8px; }
''',
    "exportServiceCore list CSS",
)
write(export_path, export_source)

image_path = "frontend/src/lib/noteImageExportCore.ts"
image_source = read(image_path)
image_source = regex_replace_once(
    image_source,
    r'    \.nowen-note-image-export-body ul, \.nowen-note-image-export-body ol \{ margin: 10px 0; padding-left: 1\.65em; \}\n'
    r'.*?'
    r'    \.nowen-note-image-export-body input\[type="checkbox"\] \{ width: 15px; height: 15px; margin: 5px 0 0; accent-color: #4f7cff; \}\n',
    '''    .nowen-note-image-export-body ul, .nowen-note-image-export-body ol { margin: 10px 0; padding-left: 1.6em; }
    .nowen-note-image-export-body ul { list-style: none !important; --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .nowen-note-image-export-body ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .nowen-note-image-export-body ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
    .nowen-note-image-export-body ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .nowen-note-image-export-body ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .nowen-note-image-export-body ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
    .nowen-note-image-export-body ul ul ul ul ul ul ul { --nowen-ul-marker: "•"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .nowen-note-image-export-body ul ul ul ul ul ul ul ul { --nowen-ul-marker: "◦"; --nowen-ul-marker-size: 1.1em; --nowen-ul-marker-top: 0; }
    .nowen-note-image-export-body ul ul ul ul ul ul ul ul ul { --nowen-ul-marker: "▪"; --nowen-ul-marker-size: 1.2em; --nowen-ul-marker-top: -0.05em; }
    .nowen-note-image-export-body ul > li:not([data-type="taskItem"]):not(.task-list-item) { position: relative; }
    .nowen-note-image-export-body ul > li:not([data-type="taskItem"]):not(.task-list-item)::before { content: var(--nowen-ul-marker); position: absolute; left: -1.2em; top: var(--nowen-ul-marker-top); font-size: var(--nowen-ul-marker-size); line-height: 1; }
    .nowen-note-image-export-body ul.contains-task-list > li.task-list-item::before,
    .nowen-note-image-export-body ul[data-type="taskList"] > li[data-type="taskItem"]::before { content: none !important; }
    .nowen-note-image-export-body li { margin: 4px 0; }
    .nowen-note-image-export-body li > p { margin: 2px 0; }
    .nowen-note-image-export-body ul[data-type="taskList"], .nowen-note-image-export-body ul.contains-task-list { padding-left: 0.5em; list-style: none; }
    .nowen-note-image-export-body li[data-type="taskItem"], .nowen-note-image-export-body li.task-list-item, .nowen-note-image-export-body ul[data-type="taskList"] > li { display: flex; gap: 9px; align-items: flex-start; list-style: none; }
    .nowen-note-image-export-body input[type="checkbox"] { width: 15px; height: 15px; margin: 5px 0 0; accent-color: #4f7cff; }
''',
    "noteImageExportCore list CSS",
)
write(image_path, image_source)

write(
    "frontend/src/lib/__tests__/listMarkerRegression.test.ts",
    '''import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf-8");

describe("list marker regressions", () => {
  it("excludes both Tiptap and GFM task items from custom markers", () => {
    for (const path of [
      "src/index.css",
      "src/lib/exportServiceCore.ts",
      "src/lib/noteImageExportCore.ts",
    ]) {
      const source = read(path);
      expect(source).toContain(':not([data-type="taskItem"]):not(.task-list-item)::before');
      expect(source).toContain("ul.contains-task-list > li.task-list-item::before");
    }
  });

  it("keeps ordered markers scoped to direct children", () => {
    const source = read("src/index.css");
    expect(source).toContain(".ProseMirror ol > li");
    expect(source).not.toContain(".ProseMirror ol li {");
  });

  it("updates toolbar state only when the nearest list type changes", () => {
    const source = read("src/components/TiptapEditor.tsx");
    expect(source).not.toContain("selectionTick");
    expect(source).toContain("activeListTypeRef.current === next");
  });
});
''',
)

print("Issue #322 source migration applied successfully")
