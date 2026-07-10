import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, "utf8");
}

function replaceOnce(source, search, replacement, label) {
  const next = typeof search === "string"
    ? source.replace(search, replacement)
    : source.replace(search, replacement);
  if (next === source) throw new Error(`Issue #198 codemod failed: ${label}`);
  return next;
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Issue #198 codemod failed: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

// ---------------------------------------------------------------------------
// MarkdownEditor: live preview, remembered mode, mapped split scroll sync.
// ---------------------------------------------------------------------------
const editorPath = "frontend/src/components/MarkdownEditor.tsx";
let editor = read(editorPath);

editor = replaceOnce(
  editor,
  'import { clampMarkdownSplitPercent } from "@/lib/markdownSplitPane";',
  'import { clampMarkdownSplitPercent } from "@/lib/markdownSplitPane";\nimport { attachMarkdownSplitScrollSync } from "@/lib/markdownScrollSync";\nimport { markdownLivePreviewExtension } from "@/lib/markdownLivePreview";',
  "MarkdownEditor helper imports",
);

editor = replaceOnce(
  editor,
  '  const { prefs: userPrefs } = useUserPreferences();',
  '  const { prefs: userPrefs, setPref } = useUserPreferences();',
  "MarkdownEditor preference setter",
);

editor = replaceOnce(
  editor,
  '  const editableCompartmentRef = useRef(new Compartment());',
  '  const editableCompartmentRef = useRef(new Compartment());\n  const livePreviewCompartmentRef = useRef(new Compartment());',
  "MarkdownEditor live preview compartment",
);

editor = replaceOnce(
  editor,
  '        editableCompartmentRef.current.of(EditorView.editable.of(editable)),',
  '        editableCompartmentRef.current.of(EditorView.editable.of(editable)),\n        livePreviewCompartmentRef.current.of(viewModeRef.current === "live" ? markdownLivePreviewExtension : []),',
  "MarkdownEditor initial live extension",
);

const editableEffectAnchor = `  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(
        EditorView.editable.of(editable)
      ),
    });
  }, [editable]);`;

editor = replaceOnce(
  editor,
  editableEffectAnchor,
  `${editableEffectAnchor}

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: livePreviewCompartmentRef.current.reconfigure(
        viewMode === "live" ? markdownLivePreviewExtension : [],
      ),
    });
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "split") return;
    const view = viewRef.current;
    const previewRoot = previewRootRef.current;
    if (!view || !previewRoot) return;

    let cleanup = () => {};
    const frame = window.requestAnimationFrame(() => {
      cleanup = attachMarkdownSplitScrollSync(view, previewRoot);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      cleanup();
    };
  }, [viewMode, previewMarkdown, sourcePaneWidthPercent]);`,
  "MarkdownEditor mode effects",
);

const splitHandlerMarker = '  const handleSplitResizerPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {';
editor = replaceOnce(
  editor,
  splitHandlerMarker,
  `  const changeViewMode = useCallback((nextMode: MarkdownViewMode) => {
    const view = viewRef.current;
    if (view && (nextMode === "preview" || nextMode === "split")) {
      setPreviewMarkdown(view.state.doc.toString());
    }
    setViewMode(nextMode);
    setPref("markdownDefaultViewMode", nextMode);
  }, [setPref]);

${splitHandlerMarker}`,
  "MarkdownEditor remembered mode helper",
);

const switcherStart = '          {/* MARKDOWN-PREVIEW-MODE-01: 视图模式切换 */}';
const toolbarEnd = '        </div>\n      )}';
const switcher = `          {/* Markdown view modes: source / live / preview / split */}
          <div className="ml-auto flex items-center gap-0.5 rounded-md border border-app-border overflow-hidden">
            <button
              type="button"
              onClick={() => changeViewMode("source")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
                viewMode === "source" ? "bg-accent-primary/10 text-accent-primary" : "text-tx-tertiary hover:text-tx-secondary hover:bg-app-hover",
              )}
              title={tr("markdown.view.source") || "源码"}
            >
              <FileCode size={12} />
              <span className="hidden sm:inline">{tr("markdown.view.source") || "源码"}</span>
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("live")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
                viewMode === "live" ? "bg-accent-primary/10 text-accent-primary" : "text-tx-tertiary hover:text-tx-secondary hover:bg-app-hover",
              )}
              title={tr("markdown.view.live") || "实时预览"}
            >
              <Sparkles size={12} />
              <span className="hidden sm:inline">{tr("markdown.view.live") || "实时预览"}</span>
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("preview")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
                viewMode === "preview" ? "bg-accent-primary/10 text-accent-primary" : "text-tx-tertiary hover:text-tx-secondary hover:bg-app-hover",
              )}
              title={tr("markdown.view.preview") || "预览"}
            >
              <Eye size={12} />
              <span className="hidden sm:inline">{tr("markdown.view.preview") || "预览"}</span>
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("split")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
                viewMode === "split" ? "bg-accent-primary/10 text-accent-primary" : "text-tx-tertiary hover:text-tx-secondary hover:bg-app-hover",
              )}
              title={tr("markdown.view.split") || "分屏"}
            >
              <Columns2 size={12} />
              <span className="hidden sm:inline">{tr("markdown.view.split") || "分屏"}</span>
            </button>
          </div>
`;
editor = replaceBetween(editor, switcherStart, toolbarEnd, switcher, "MarkdownEditor mode switcher");

const contentStart = '      {/* editor content area - source/preview/split */}';
const statusStart = '      {/* 状态栏：字数统计（与 TiptapEditor 对齐） */}';
const contentArea = `      {/* editor content area - source/live/preview/split */}
      <div className={cn(
        "flex-1 min-h-0",
        viewMode === "split" ? "flex overflow-hidden" : "overflow-auto px-4 md:px-8"
      )} ref={splitContainerRef} style={{ paddingBottom: viewMode !== "split" ? "var(--keyboard-height, 0px)" : undefined }}>
        {/* CodeMirror owns its own scroller; avoid a nested pane scrollbar. */}
        <div className={cn(
          viewMode === "split" ? "min-h-0 overflow-hidden px-4 md:px-8 shrink-0" : "h-full",
          viewMode === "preview" && "hidden"
        )} style={viewMode === "split" ? { width: \`${'${sourcePaneWidthPercent}'}%\` } : undefined}>
          <div ref={hostRef} className="nowen-md-editor h-full" style={{ minHeight: "100%" }} />
        </div>
        {viewMode === "split" && (
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(sourcePaneWidthPercent)}
            onPointerDown={handleSplitResizerPointerDown}
            className="group relative flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center bg-app-hover/70 transition-colors hover:bg-accent-primary/10 active:bg-accent-primary/15"
            title={tr("markdown.view.resizeSplit") || "拖拽调整分屏宽度"}
          >
            <span className="h-full w-px bg-app-border transition-colors group-hover:bg-accent-primary/80" />
            <span className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-app-border bg-app-surface shadow-sm transition-colors group-hover:border-accent-primary/70 group-hover:bg-accent-primary/10" />
          </button>
        )}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={cn(
            viewMode === "split" ? "min-h-0 overflow-hidden px-4 md:px-8 shrink-0" : "h-full"
          )} style={viewMode === "split" ? { width: \`${'${100 - sourcePaneWidthPercent}'}%\` } : undefined}>
            <MarkdownPreview
              markdown={previewMarkdown}
              className="h-full"
              compact={viewMode === "split"}
              containerRef={previewRootRef}
              onTaskCheckboxChange={editable ? handlePreviewTaskCheckboxChange : undefined}
            />
          </div>
        )}
      </div>

`;
editor = replaceBetween(editor, contentStart, statusStart, contentArea, "MarkdownEditor content area");

if (!editor.includes('changeViewMode("live")') || !editor.includes("attachMarkdownSplitScrollSync")) {
  throw new Error("Issue #198 codemod verification failed for MarkdownEditor");
}
write(editorPath, editor);

// ---------------------------------------------------------------------------
// Per-user preference contract (frontend, backend and API types).
// ---------------------------------------------------------------------------
const prefsPath = "frontend/src/hooks/useUserPreferences.tsx";
let prefs = read(prefsPath);
prefs = replaceOnce(prefs, 'export type MarkdownViewMode = "source" | "preview" | "split";', 'export type MarkdownViewMode = "source" | "live" | "preview" | "split";', "frontend MarkdownViewMode union");
prefs = replaceOnce(
  prefs,
  '      parsed.markdownDefaultViewMode === "source" ||\n      parsed.markdownDefaultViewMode === "preview" ||',
  '      parsed.markdownDefaultViewMode === "source" ||\n      parsed.markdownDefaultViewMode === "live" ||\n      parsed.markdownDefaultViewMode === "preview" ||',
  "frontend live preference normalization",
);
write(prefsPath, prefs);

const backendPrefsPath = "backend/src/routes/user-preferences.ts";
let backendPrefs = read(backendPrefsPath);
backendPrefs = replaceOnce(backendPrefs, 'type MarkdownViewMode = "source" | "preview" | "split";', 'type MarkdownViewMode = "source" | "live" | "preview" | "split";', "backend MarkdownViewMode union");
backendPrefs = replaceOnce(
  backendPrefs,
  '      raw.markdownDefaultViewMode === "source" ||\n      raw.markdownDefaultViewMode === "preview" ||',
  '      raw.markdownDefaultViewMode === "source" ||\n      raw.markdownDefaultViewMode === "live" ||\n      raw.markdownDefaultViewMode === "preview" ||',
  "backend live preference normalization",
);
write(backendPrefsPath, backendPrefs);

const apiPath = "frontend/src/lib/api.ts";
let api = read(apiPath);
api = api.replaceAll('"source" | "preview" | "split"', '"source" | "live" | "preview" | "split"');
write(apiPath, api);

// SettingsModal uses a literal mode list in current releases. Extend whichever
// representation is present without making this optional UI enhancement block the fix.
const settingsPath = "frontend/src/components/SettingsModal.tsx";
let settings = read(settingsPath);
settings = settings.replaceAll('["source", "preview", "split"]', '["source", "live", "preview", "split"]');
settings = settings.replaceAll("['source', 'preview', 'split']", "['source', 'live', 'preview', 'split']");
write(settingsPath, settings);

console.log("Issue #198 Markdown experience enhancements applied.");
