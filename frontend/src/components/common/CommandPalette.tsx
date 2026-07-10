/**
 * CommandPalette —— Cmd-K 全局搜索弹窗
 * ----------------------------------------------------------------------------
 * Sidebar 搜索负责持久化浏览，并由 SearchCenter 展示完整结果页；Cmd-K 仍然保持
 * “即用即走”的快速跳转语义。两套入口共用同一个后端搜索接口，但互不改变对方状态。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search as SearchIcon, FileText, Loader2 } from "lucide-react";
import { useAppActions } from "@/store/AppContext";
import { api } from "@/lib/api";
import { highlightTextNode, sanitizeSearchHtml } from "@/lib/searchHighlight";
import type { SearchResult } from "@/types";
import SearchCenter from "@/components/SearchCenter";

export interface CommandPaletteProps {
  /** 由外部控制开合；App 层一个 useState 即可 */
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const actions = useAppActions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setActiveIdx(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      const request = new AbortController();
      abortRef.current?.abort();
      abortRef.current = request;
      try {
        const rows = await api.search(normalized);
        if (request.signal.aborted) return;
        setResults(rows);
        setActiveIdx(0);
      } catch (error) {
        if (request.signal.aborted) return;
        console.warn("[CommandPalette] search failed:", error);
        setResults([]);
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }, 200);
  }, [open, query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!open) window.dispatchEvent(new CustomEvent("nowen:open-command-palette"));
      } else if (open && event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const jumpTo = useCallback(async (id: string) => {
    try {
      const note = await api.getNote(id);
      if (note) {
        actions.setActiveNote(note);
        actions.setMobileView("editor");
      }
    } catch (error) {
      console.error("[CommandPalette] open note failed:", error);
    } finally {
      onClose();
    }
  }, [actions, onClose]);

  const onInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIdx((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIdx((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIdx];
      if (result) void jumpTo(result.id);
    }
  }, [activeIdx, jumpTo, results]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, results]);

  const paletteBody = useMemo(() => {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 z-[200] flex items-start justify-center px-4 pt-[15vh]"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
        <div
          className="relative w-full max-w-[640px] overflow-hidden rounded-xl border border-app-border bg-app-elevated shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="全局搜索"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-app-border px-4 py-3">
            <SearchIcon size={18} className="shrink-0 text-tx-tertiary" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="搜索笔记标题与内容…"
              className="flex-1 bg-transparent text-sm text-tx-primary outline-none placeholder:text-tx-tertiary"
              autoComplete="off"
              spellCheck={false}
            />
            {loading && <Loader2 size={16} className="animate-spin text-tx-tertiary" />}
            <kbd className="hidden h-5 items-center rounded border border-app-border px-1.5 text-[10px] text-tx-tertiary sm:inline-flex">
              Esc
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
            {results.length === 0 && query.trim() && !loading && (
              <div className="px-4 py-6 text-center text-sm text-tx-tertiary">
                未找到与 &ldquo;{query}&rdquo; 匹配的笔记
              </div>
            )}
            {!query.trim() && (
              <div className="px-4 py-6 text-center text-sm text-tx-tertiary">
                输入关键词开始搜索（↑↓ 选择，Enter 打开，Esc 关闭）
              </div>
            )}
            {results.map((result, index) => {
              const active = index === activeIdx;
              const snippetHtml = result.snippetHtml || result.snippet;
              return (
                <button
                  key={result.id}
                  data-idx={index}
                  type="button"
                  onMouseEnter={() => setActiveIdx(index)}
                  onClick={() => void jumpTo(result.id)}
                  className={[
                    "flex w-full items-start gap-3 px-4 py-2 text-left transition-colors",
                    active ? "bg-app-hover" : "hover:bg-app-hover/60",
                  ].join(" ")}
                >
                  <FileText size={16} className="mt-0.5 shrink-0 text-tx-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="search-result-html truncate text-sm text-tx-primary">
                      {result.titleHtml ? (
                        <span dangerouslySetInnerHTML={{ __html: sanitizeSearchHtml(result.titleHtml) }} />
                      ) : (
                        highlightTextNode(result.title || "(无标题)", query)
                      )}
                    </div>
                    {snippetHtml && (
                      <div
                        className="search-result-html mt-0.5 truncate text-xs text-tx-tertiary"
                        dangerouslySetInnerHTML={{ __html: sanitizeSearchHtml(snippetHtml) }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }, [activeIdx, jumpTo, loading, onClose, onInputKeyDown, open, query, results]);

  return (
    <>
      <SearchCenter />
      {typeof document !== "undefined" && paletteBody ? createPortal(paletteBody, document.body) : null}
    </>
  );
}
