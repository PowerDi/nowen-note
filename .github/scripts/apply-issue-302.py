from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    source = p.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    p.write_text(source.replace(old, new, 1), encoding="utf-8")


def replace_between(path: str, start_marker: str, end_marker: str, replacement: str, label: str) -> None:
    p = Path(path)
    source = p.read_text(encoding="utf-8")
    start = source.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker not found")
    end = source.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{label}: end marker not found")
    p.write_text(source[:start] + replacement + source[end:], encoding="utf-8")


# The first diagnostic run already created backend security/routes/tests and the
# foreground-color helper/tests. Resume from the first unmatched confirm.tsx edit.
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    'export interface ChoiceOptions extends Omit<ConfirmOptions, "confirmText"> {\n',
    'export interface ChoiceOptions extends ConfirmOptions {\n',
    "choice options inherit confirm metadata",
)
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    '''  | {
      kind: "prompt";
      id: number;
      options: PromptOptions;
      resolve: (value: string | null) => void;
    };
''',
    '''  | {
      kind: "prompt";
      id: number;
      options: PromptOptions;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "choice";
      id: number;
      options: ChoiceOptions;
      resolve: (value: string | null) => void;
    };
''',
    "choice stack item",
)
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    '''export function useConfirm() {
  return confirm;
}
export function usePrompt() {
  return prompt;
}
''',
    '''export function choose(options: ChoiceOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const item: Omit<StackItem, "id"> = { kind: "choice", options, resolve };
    if (dispatcher) {
      dispatcher.push(item);
      return;
    }
    let bound = false;
    const bind = (_id: number) => { bound = true; };
    pending.push({ item, bind });
    setTimeout(() => {
      if (!bound && !dispatcher) {
        const idx = pending.findIndex((entry) => entry.item === item);
        if (idx >= 0) pending.splice(idx, 1);
        const fallback = window.confirm(
          [options.title, typeof options.description === "string" ? options.description : ""]
            .filter(Boolean)
            .join("\\n\\n"),
        );
        resolve(fallback ? options.choices[0]?.value ?? null : null);
      }
    }, 100);
  });
}

export function useConfirm() {
  return confirm;
}
export function usePrompt() {
  return prompt;
}
export function useChoice() {
  return choose;
}
''',
    "choice command API",
)
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    '''  const isPrompt = item.kind === "prompt";
  const promptOpts = isPrompt ? (item.options as PromptOptions) : null;
  const [value, setValue] = React.useState(promptOpts?.defaultValue ?? "");
''',
    '''  const isPrompt = item.kind === "prompt";
  const isChoice = item.kind === "choice";
  const promptOpts = isPrompt ? (item.options as PromptOptions) : null;
  const choiceOpts = isChoice ? (item.options as ChoiceOptions) : null;
  const [value, setValue] = React.useState(promptOpts?.defaultValue ?? "");
''',
    "choice dialog mode",
)
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    '''      if (isPrompt) inputRef.current?.focus();
      else if (danger) cancelBtnRef.current?.focus();
      else confirmBtnRef.current?.focus();
''',
    '''      if (isPrompt) inputRef.current?.focus();
      else if (isChoice || danger) cancelBtnRef.current?.focus();
      else confirmBtnRef.current?.focus();
''',
    "choice focus behavior",
)
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    '''  }, [isPrompt, danger]);
''',
    '''  }, [isPrompt, isChoice, danger]);
''',
    "choice focus dependencies",
)
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    '''          if (e.key === "Enter" && (isPrompt || !danger)) {
''',
    '''          if (e.key === "Enter" && !isChoice && (isPrompt || !danger)) {
''',
    "choice enter behavior",
)
replace_once(
    "frontend/src/components/ui/confirm.tsx",
    '''        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-app-bg/40 border-t border-app-border">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            {cancelText || "取消"}
          </Button>
          <Button
            ref={confirmBtnRef}
            type="button"
            size="sm"
            variant={danger ? "destructive" : "default"}
            onClick={submit}
            className={cn(
              danger &&
                "bg-red-500 hover:bg-red-500/90 text-white border-transparent",
            )}
          >
            {confirmText || "确定"}
          </Button>
        </div>
''',
    '''        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 bg-app-bg/40 border-t border-app-border">
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            {cancelText || "取消"}
          </Button>
          {isChoice ? (
            choiceOpts!.choices.map((choice) => (
              <Button
                key={choice.value}
                type="button"
                size="sm"
                variant={choice.variant || "default"}
                onClick={() => onConfirm(choice.value)}
              >
                {choice.label}
              </Button>
            ))
          ) : (
            <Button
              ref={confirmBtnRef}
              type="button"
              size="sm"
              variant={danger ? "destructive" : "default"}
              onClick={submit}
              className={cn(
                danger &&
                  "bg-red-500 hover:bg-red-500/90 text-white border-transparent",
              )}
            >
              {confirmText || "确定"}
            </Button>
          )}
        </div>
''',
    "choice footer",
)

replace_once(
    "frontend/src/lib/api.impl.ts",
    '''    /** 远程图片本地化：下载远程图片并上传为本地附件（PASTE-REMOTE-IMAGE-LOCALIZE-01） */
    importRemoteImage: (
      noteId: string,
      url: string,
      source?: string,
    ): Promise<{ url: string; deduplicated?: boolean }> =>
      request<{ url: string; deduplicated?: boolean }>("/attachments/import-remote-image", {
        method: "POST",
        body: JSON.stringify({ noteId, url, source }),
      }),
''',
    '''    /** 远程图片本地化：服务端安全下载并保存为当前笔记的附件。 */
    importRemoteImage: (
      noteId: string,
      url: string,
      source?: string,
    ): Promise<{
      id: string;
      url: string;
      mimeType: string;
      size: number;
      filename: string;
      category: "image";
      deduplicated?: boolean;
      accessUrls?: Record<string, string>;
    }> =>
      request<{
        id: string;
        url: string;
        mimeType: string;
        size: number;
        filename: string;
        category: "image";
        deduplicated?: boolean;
        accessUrls?: Record<string, string>;
      }>("/attachments/import-remote-image", {
        method: "POST",
        body: JSON.stringify({ noteId, url, source }),
      }).then((payload) => {
        registerAttachmentAccessResponse(payload);
        return payload;
      }),
''',
    "remote image API response",
)

replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    'import { prompt as promptDialog } from "@/components/ui/confirm";\n',
    'import { choose as chooseDialog, prompt as promptDialog } from "@/components/ui/confirm";\n',
    "choice dialog import",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    'import { replaceDataUrlImagesWithAttachments } from "@/lib/rtfImageUploader";\n',
    'import { replaceDataUrlImagesWithAttachments } from "@/lib/rtfImageUploader";\nimport { shouldLocalizeUrl } from "@/lib/remoteImageLocalizer";\nimport {\n  analyzeRiskyForegroundColors,\n  normalizeLegacyFontColors,\n  stripExplicitForegroundColors,\n} from "@/lib/pasteForegroundColor";\n',
    "paste color and remote image imports",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    '  const [replacingImage, setReplacingImage] = useState(false);\n',
    '  const [replacingImage, setReplacingImage] = useState(false);\n  const [localizingSelectedImage, setLocalizingSelectedImage] = useState(false);\n',
    "remote image action state",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    '''          const text = event.clipboardData?.getData("text/plain") || "";
          // SEC-XSS-01-D: 剪贴板 HTML 进入任何处理路径前先清洗
          const html = sanitizeForPaste(event.clipboardData?.getData("text/html") || "");
''',
    '''          const text = event.clipboardData?.getData("text/plain") || "";
          // 先把旧式 <font color> 转为 span style，再进入统一 XSS 清洗。
          // 这样既能检测固定前景色，也能在用户选择“保留原颜色”时继续由 TextStyleKit 承载。
          const rawHtml = event.clipboardData?.getData("text/html") || "";
          const html = sanitizeForPaste(normalizeLegacyFontColors(rawHtml));
''',
    "paste raw HTML normalization",
)

new_html_branch = r'''          // 5) 只有 HTML 没有多行纯文本（如从网页复制的富文本片段）：解析插入
          //    先归一化：把 <div>/<br> 伪多行段落拆成真正的多个 <p>，
          //    避免后续块级操作（toggleHeading 等）误把整段转换。
          if (html && html.trim().length > 0) {
            console.log("[paste-diag] PATH=html (normalize + parseSlice)");
            let htmlForParse = html;
            try {
              const rtf = event.clipboardData?.getData("text/rtf") || "";
              if (rtf.length > 0 && /\\(pngblip|jpegblip)/.test(rtf)) {
                const rtfImages = extractImagesFromRtf(rtf);
                if (rtfImages.length > 0) {
                  htmlForParse = mergeRtfImagesIntoHtml(html, rtfImages);
                  console.log("[paste-diag] RTF images extracted=", rtfImages.length);
                }
              }
            } catch (err) {
              console.warn("[paste-diag] RTF image extraction failed:", err);
            }

            const insertPreparedHtml = (preparedHtml: string) => {
              if (view.isDestroyed) return;
              const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
              const tempDiv = document.createElement("div");
              const normalized = normalizePastedHtmlForBlocks(preparedHtml);
              tempDiv.innerHTML = normalized.html;
              try {
                const rawImgs = (preparedHtml.match(/<img[^>]*>/gi) || []).length;
                const normalizedImgs = tempDiv.querySelectorAll("img").length;
                const firstSrc = tempDiv.querySelector("img")?.getAttribute("src") || "";
                console.log("[paste-diag] raw html <img>=", rawImgs,
                  " normalized <img>=", normalizedImgs,
                  " isWord=", normalized.isWordSource,
                  " stats=", normalized.imageStats,
                  " firstSrcHead=", firstSrc.slice(0, 80));
              } catch {}
              const slice = parser.parseSlice(tempDiv);
              try {
                let imgCountInSlice = 0;
                slice.content.descendants((node) => {
                  if (node.type.name === "image") imgCountInSlice += 1;
                });
                console.log("[paste-diag] PM slice image nodes=", imgCountInSlice);
              } catch {}
              view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
              if (normalized.imageStats.failed > 0) {
                const msgKey = normalized.isWordSource
                  ? "tiptap.wordImagesNotPastable"
                  : "tiptap.imagesNotLoaded";
                showPasteToast("error", t(msgKey, { count: normalized.imageStats.failed }), 6000);
              }
            };

            const colorRisk = analyzeRiskyForegroundColors(htmlForParse);
            if (colorRisk.total > 0) {
              const pasteAnchor = captureAsyncInsertAnchor(view);
              asyncInsertAnchorsRef.current.add(pasteAnchor);
              void chooseDialog({
                title: t("tiptap.pasteColorRiskTitle", { defaultValue: "检测到可能影响主题阅读的文字颜色" }),
                description: t("tiptap.pasteColorRiskDescription", {
                  defaultValue: "粘贴内容中有 {{count}} 处固定文字颜色（偏黑 {{dark}} 处、偏白 {{light}} 处）。切换深色或浅色主题后，这些文字可能与背景融为一体。",
                  count: colorRisk.total,
                  dark: colorRisk.dark,
                  light: colorRisk.light,
                }),
                cancelText: t("common.cancel"),
                choices: [
                  {
                    value: "keep",
                    label: t("tiptap.pasteColorKeepAndPaste", { defaultValue: "保留原颜色并粘贴" }),
                    variant: "outline",
                  },
                  {
                    value: "strip",
                    label: t("tiptap.pasteColorRemoveAndPaste", { defaultValue: "移除文字颜色并粘贴" }),
                    variant: "default",
                  },
                ],
              }).then((choice) => {
                if (!choice || view.isDestroyed) return;
                if (!restoreAsyncInsertAnchor(view, pasteAnchor)) return;
                insertPreparedHtml(choice === "strip"
                  ? stripExplicitForegroundColors(htmlForParse)
                  : htmlForParse);
              }).finally(() => {
                releaseAsyncInsertAnchor(asyncInsertAnchorsRef.current, pasteAnchor);
              });
              return true;
            }

            insertPreparedHtml(htmlForParse);
            return true;
          }

'''
replace_between(
    "frontend/src/components/TiptapEditor.tsx",
    '          // 5) 只有 HTML 没有多行纯文本（如从网页复制的富文本片段）：解析插入\n',
    '          // 6) 单行纯文本或其他：直接插入\n',
    new_html_branch,
    "HTML paste color warning branch",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    '''  const handleCopySelectedImageSrc = useCallback(async () => {
''',
    '''  const handleLocalizeSelectedImage = useCallback(async () => {
    if (!editor || localizingSelectedImage) return;
    const currentNote = noteRef.current;
    if (!currentNote?.id) {
      toast.error(t("tiptap.imageLocalizeFailed", { defaultValue: "网络图片转存失败" }));
      return;
    }
    const selection = editor.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return;
    const originalSrc = String(selection.node.attrs.src || "").trim();
    if (!shouldLocalizeUrl(originalSrc)) return;
    const preferredPos = selection.from;

    setLocalizingSelectedImage(true);
    toast.info(t("tiptap.imageLocalizing", { defaultValue: "正在转存网络图片..." }));
    try {
      const result = await api.attachments.importRemoteImage(currentNote.id, originalSrc, "image-action");
      if (editor.isDestroyed) return;
      let targetPos: number | null = null;
      const preferredNode = editor.state.doc.nodeAt(preferredPos);
      if (isImageReplaceTargetNode(preferredNode) && String(preferredNode.attrs.src || "") === originalSrc) {
        targetPos = preferredPos;
      } else {
        const matches: number[] = [];
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "image" && String(node.attrs.src || "") === originalSrc) matches.push(pos);
        });
        if (matches.length === 1) targetPos = matches[0];
      }
      if (targetPos == null) {
        toast.error(t("tiptap.imageLocalizeTargetChanged", { defaultValue: "原图片位置已变化，请重新选择后转存" }));
        return;
      }
      const targetNode = editor.state.doc.nodeAt(targetPos);
      if (!isImageReplaceTargetNode(targetNode)) return;
      let transaction = editor.state.tr.setNodeMarkup(targetPos, undefined, { ...targetNode.attrs, src: result.url });
      try { transaction = transaction.setSelection(NodeSelection.create(transaction.doc, targetPos)); } catch {}
      editor.view.dispatch(transaction.scrollIntoView());
      toast.success(t("tiptap.imageLocalizeSuccess", { defaultValue: "网络图片已转存为本地附件" }));
    } catch (error) {
      console.error("Localize selected image failed:", error);
      const detail = (error as Error)?.message || "";
      toast.error(detail || t("tiptap.imageLocalizeFailed", { defaultValue: "网络图片转存失败" }));
    } finally {
      setLocalizingSelectedImage(false);
    }
  }, [editor, localizingSelectedImage, t]);

  const selectedImageCanLocalize = (() => {
    if (!editor) return false;
    const selection = editor.state.selection;
    return selection instanceof NodeSelection
      && selection.node.type.name === "image"
      && shouldLocalizeUrl(String(selection.node.attrs.src || ""));
  })();

  const handleCopySelectedImageSrc = useCallback(async () => {
''',
    "selected image localize handler",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    '''          <ToolbarButton title={t("tiptap.imageDownload")} onClick={() => { void handleDownloadSelectedImage(); }}>
            <Download size={14} />
          </ToolbarButton>
          <ToolbarButton
            title={t("tiptap.imageReplace")}
''',
    '''          <ToolbarButton title={t("tiptap.imageDownload")} onClick={() => { void handleDownloadSelectedImage(); }}>
            <Download size={14} />
          </ToolbarButton>
          {selectedImageCanLocalize && (
            <ToolbarButton
              title={t("tiptap.imageLocalize", { defaultValue: "转存为附件" })}
              disabled={localizingSelectedImage}
              onClick={() => { void handleLocalizeSelectedImage(); }}
            >
              <Paperclip size={14} />
            </ToolbarButton>
          )}
          <ToolbarButton
            title={t("tiptap.imageReplace")}
''',
    "desktop image localize action",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    '''            {[
              { key: "view", label: t("tiptap.imageViewLarge"), icon: ExternalLink, action: handlePreviewSelectedImage },
              { key: "download", label: t("tiptap.imageDownload"), icon: Download, action: () => { void handleDownloadSelectedImage(); } },
              { key: "replace", label: t("tiptap.imageReplace"), icon: Upload, action: handleReplaceSelectedImage, disabled: replacingImage },
''',
    '''            {[
              { key: "view", label: t("tiptap.imageViewLarge"), icon: ExternalLink, action: handlePreviewSelectedImage },
              { key: "download", label: t("tiptap.imageDownload"), icon: Download, action: () => { void handleDownloadSelectedImage(); } },
              ...(selectedImageCanLocalize ? [{
                key: "localize",
                label: t("tiptap.imageLocalize", { defaultValue: "转存为附件" }),
                icon: Paperclip,
                action: () => { void handleLocalizeSelectedImage(); },
                disabled: localizingSelectedImage,
              }] : []),
              { key: "replace", label: t("tiptap.imageReplace"), icon: Upload, action: handleReplaceSelectedImage, disabled: replacingImage },
''',
    "mobile image localize action",
)
replace_once(
    "frontend/src/i18n/locales/zh-CN.json",
    '''    "imageDownloadFailed": "图片下载失败",
    "imageReplace": "替换图片",
''',
    '''    "imageDownloadFailed": "图片下载失败",
    "imageLocalize": "转存为附件",
    "imageLocalizing": "正在转存网络图片...",
    "imageLocalizeSuccess": "网络图片已转存为本地附件",
    "imageLocalizeFailed": "网络图片转存失败",
    "imageLocalizeTargetChanged": "原图片位置已变化，请重新选择后转存",
    "pasteColorRiskTitle": "检测到可能影响主题阅读的文字颜色",
    "pasteColorRiskDescription": "粘贴内容中有 {{count}} 处固定文字颜色（偏黑 {{dark}} 处、偏白 {{light}} 处）。切换深色或浅色主题后，这些文字可能与背景融为一体。",
    "pasteColorRemoveAndPaste": "移除文字颜色并粘贴",
    "pasteColorKeepAndPaste": "保留原颜色并粘贴",
    "imageReplace": "替换图片",
''',
    "Chinese issue 302 strings",
)
replace_once(
    "frontend/src/i18n/locales/en.json",
    '''    "imageDownloadFailed": "Image download failed",
    "imageReplace": "Replace image",
''',
    '''    "imageDownloadFailed": "Image download failed",
    "imageLocalize": "Save as attachment",
    "imageLocalizing": "Saving remote image...",
    "imageLocalizeSuccess": "Remote image saved as a local attachment",
    "imageLocalizeFailed": "Failed to save remote image",
    "imageLocalizeTargetChanged": "The original image position changed. Select it again to save it.",
    "pasteColorRiskTitle": "Text colors may become unreadable after switching themes",
    "pasteColorRiskDescription": "The pasted content contains {{count}} fixed foreground color(s): {{dark}} very dark and {{light}} very light. They may blend into the background in dark or light mode.",
    "pasteColorRemoveAndPaste": "Remove text colors and paste",
    "pasteColorKeepAndPaste": "Keep original colors and paste",
    "imageReplace": "Replace image",
''',
    "English issue 302 strings",
)

print("issue 302 follow-up patch applied")
