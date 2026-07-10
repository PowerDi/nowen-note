import { findMobileImageSheet } from "@/lib/imageExperience";

const INSTALL_KEY = "__NOWEN_MOBILE_IMAGE_FOCUS_GUARD__" as const;

type GuardedWindow = Window & typeof globalThis & {
  [INSTALL_KEY]?: () => void;
};

/**
 * Release text-input focus as soon as the existing mobile image action sheet appears.
 * Android WebView can reopen the IME while a contenteditable still owns focus even after
 * Keyboard.hide(), so blur is required in addition to the native keyboard request.
 */
export function blurFocusedEditorForImageSheet(doc: Document = document): boolean {
  if (!findMobileImageSheet(doc)) return false;

  const active = doc.activeElement;
  if (active instanceof HTMLElement && typeof active.blur === "function") {
    active.blur();
  }

  const editor = doc.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"]');
  if (editor && editor !== active && typeof editor.blur === "function") {
    editor.blur();
  }

  return true;
}

export function installMobileImageFocusGuard(): void {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) return;
  const guardedWindow = window as GuardedWindow;
  if (guardedWindow[INSTALL_KEY]) return;

  let currentSheet: HTMLElement | null = null;
  let frame = 0;

  const reconcile = () => {
    frame = 0;
    const sheet = findMobileImageSheet(document)?.root || null;
    if (sheet && sheet !== currentSheet) {
      currentSheet = sheet;
      blurFocusedEditorForImageSheet(document);
    } else if (!sheet) {
      currentSheet = null;
    }
  };

  const schedule = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(reconcile);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();

  guardedWindow[INSTALL_KEY] = () => {
    if (frame) cancelAnimationFrame(frame);
    observer.disconnect();
    delete guardedWindow[INSTALL_KEY];
  };
}
