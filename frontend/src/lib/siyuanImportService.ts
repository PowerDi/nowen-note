import type { ImportFileInfo } from "./importService";
import { readMarkdownFromZipWithMeta } from "./importService";

export interface SiyuanZipInspection {
  entries: string[];
  hasMarkdownFiles: boolean;
  hasSyFiles: boolean;
  isSiyuanMarkdownZip: boolean;
}

export interface SiyuanImportResult {
  files: ImportFileInfo[];
  warnings: string[];
}

const MARKDOWN_EXT_RE = /\.(md|markdown)$/i;
const SIYUAN_SY_EXT_RE = /\.sy$/i;
const ASSETS_SEGMENT_RE = /(^|\/)assets\//i;
const SIYUAN_MARKER_RE =
  /(^|\n)\s*\{:\s+[^}]*\}\s*(?=\n|$)|\(\([^)]+?\)\)|\[\[[^\]]+?\]\]|!\[[^\]]*]\((?:\.{0,2}\/)?assets\//i;

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isHiddenZipEntry(path: string): boolean {
  const normalized = normalizeZipPath(path);
  return normalized.includes("__MACOSX/") || normalized.split("/").some((part) => part.startsWith("."));
}

function isMarkdownEntry(path: string): boolean {
  return MARKDOWN_EXT_RE.test(path);
}

function isSyEntry(path: string): boolean {
  return SIYUAN_SY_EXT_RE.test(path);
}

function hasAssetsDir(entries: string[]): boolean {
  return entries.some((entry) => ASSETS_SEGMENT_RE.test(normalizeZipPath(entry)));
}

export function isSiyuanMarkdownZip(entries: string[]): boolean {
  const visibleEntries = entries.map(normalizeZipPath).filter((entry) => !isHiddenZipEntry(entry));
  const hasMarkdown = visibleEntries.some(isMarkdownEntry);
  if (!hasMarkdown) return false;

  // Common Siyuan Markdown exports keep note-local resources under assets/.
  // Content-based detection is handled by inspectSiyuanZip/readSiyuanMarkdownZip.
  return hasAssetsDir(visibleEntries);
}

export function isSiyuanSyZip(entries: string[]): boolean {
  const visibleEntries = entries.map(normalizeZipPath).filter((entry) => !isHiddenZipEntry(entry));
  return visibleEntries.some(isSyEntry);
}

export async function inspectSiyuanZip(file: File): Promise<SiyuanZipInspection> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.keys(zip.files).map(normalizeZipPath);
  const visibleFiles = entries.filter((entry) => !zip.files[entry]?.dir && !isHiddenZipEntry(entry));
  const hasMarkdownFiles = visibleFiles.some(isMarkdownEntry);
  const hasSyFiles = visibleFiles.some(isSyEntry);

  let isSiyuan = isSiyuanMarkdownZip(entries);
  if (!isSiyuan && hasMarkdownFiles) {
    const markdownEntries = visibleFiles.filter(isMarkdownEntry).slice(0, 12);
    for (const entry of markdownEntries) {
      const zipEntry = zip.file(entry);
      if (!zipEntry) continue;
      try {
        const text = await zipEntry.async("text");
        if (SIYUAN_MARKER_RE.test(text)) {
          isSiyuan = true;
          break;
        }
      } catch {
        // Ignore unreadable individual files; the generic importer will surface real failures.
      }
    }
  }

  return {
    entries,
    hasMarkdownFiles,
    hasSyFiles,
    isSiyuanMarkdownZip: isSiyuan && hasMarkdownFiles,
  };
}

export function cleanSiyuanMarkdown(markdown: string): string {
  return markdown
    // Drop standalone block attributes: {: id="..." updated="..." }
    .replace(/^[ \t]*\{:\s+[^}\r\n]*\}[ \t]*(?:\r?\n|$)/gm, "")
    // Drop trailing inline block attributes after headings/paragraphs.
    .replace(/[ \t]+\{:\s+[^}\r\n]*\}(?=\r?\n|$)/g, "")
    // Degrade block refs to readable text. Prefer the exported display text when present.
    .replace(/\(\(([^)\s]+)(?:\s+"([^"]*)")?\)\)/g, (_match, id: string, label?: string) =>
      label?.trim() ? label.trim() : `[块引用:${id}]`,
    )
    // Degrade document links to normal Markdown links so they remain clickable/editable text.
    .replace(/\[\[([^\]\r\n]+)\]\]/g, (_match, target: string) => {
      const label = target.trim();
      return label ? `[${label}](${encodeURI(label)})` : "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function enhanceSiyuanImageMap(
  imageMap: Record<string, string> | undefined,
  notePath: string,
): Record<string, string> | undefined {
  if (!imageMap) return imageMap;

  const enhanced: Record<string, string> = { ...imageMap };
  const normalizedNotePath = normalizeZipPath(notePath);
  const noteDir = normalizedNotePath.split("/").slice(0, -1).join("/");

  const addAlias = (alias: string, dataUri: string) => {
    const normalized = normalizeZipPath(alias).replace(/^\.\//, "").replace(/^\/+/, "");
    if (!normalized || enhanced[normalized]) return;
    enhanced[normalized] = dataUri;
  };

  for (const [rawPath, dataUri] of Object.entries(imageMap)) {
    const path = normalizeZipPath(rawPath);
    const fileName = path.split("/").pop();
    if (!fileName) continue;

    addAlias(fileName, dataUri);
    const assetsIndex = path.toLowerCase().lastIndexOf("/assets/");
    const assetsTail = assetsIndex >= 0
      ? path.slice(assetsIndex + 1)
      : path.toLowerCase().startsWith("assets/")
      ? path
      : "";
    if (assetsTail) {
      addAlias(assetsTail, dataUri);
      addAlias(`./${assetsTail}`, dataUri);
      addAlias(`../${assetsTail}`, dataUri);
    }

    if (noteDir && path.startsWith(`${noteDir}/`)) {
      const relativeToNote = path.slice(noteDir.length + 1);
      addAlias(relativeToNote, dataUri);
      addAlias(`./${relativeToNote}`, dataUri);
    }
  }

  return enhanced;
}

export async function readSiyuanMarkdownZip(file: File): Promise<SiyuanImportResult> {
  const inspection = await inspectSiyuanZip(file);
  const warnings: string[] = [];
  if (inspection.hasSyFiles) {
    warnings.push("siyuanSyNotSupported");
  }

  const { files } = await readMarkdownFromZipWithMeta(file);
  const cleanedFiles = files
    .filter((info) => info.source === "md" || info.name.match(MARKDOWN_EXT_RE))
    .map((info) => ({
      ...info,
      source: "siyuan",
      content: cleanSiyuanMarkdown(info.content),
      imageMap: enhanceSiyuanImageMap(info.imageMap, info.name),
    }));

  return { files: cleanedFiles, warnings };
}
