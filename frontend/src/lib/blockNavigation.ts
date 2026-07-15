import { parseInternalNoteHref } from "@/lib/noteLinkSyntax";

const STORAGE_KEY = "nowen.pendingBlockNavigation";
const EVENT_NAME = "nowen:block-navigation";
const OPEN_EVENT = "nowen:open-note-link";

export interface BlockNavigationRequest {
  noteId: string;
  blockId: string;
  createdAt: number;
}

export function requestBlockNavigation(noteId: string, blockId: string): void {
  const request: BlockNavigationRequest = { noteId, blockId, createdAt: Date.now() };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(request)); } catch {}
  window.dispatchEvent(new CustomEvent<BlockNavigationRequest>(EVENT_NAME, { detail: request }));
}

export function consumeBlockNavigation(noteId: string): BlockNavigationRequest | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const request = JSON.parse(raw) as BlockNavigationRequest;
    if (request.noteId !== noteId || Date.now() - request.createdAt > 30_000) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return request;
  } catch {
    return null;
  }
}

export function subscribeBlockNavigation(listener: (request: BlockNavigationRequest) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<BlockNavigationRequest>).detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function openInternalNoteLink(href: string): boolean {
  const parsed = parseInternalNoteHref(href);
  if (!parsed) return false;
  if (parsed.blockId) requestBlockNavigation(parsed.noteId, parsed.blockId);
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { ...parsed, href } }));
  return true;
}

export function subscribeOpenInternalNoteLink(
  listener: (detail: { noteId: string; blockId: string | null; href: string }) => void,
): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<any>).detail);
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
