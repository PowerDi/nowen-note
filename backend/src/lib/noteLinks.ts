/**
 * 笔记间引用关系（note_links）维护工具
 * ---------------------------------------------------------------------------
 * 背景：
 *   BACKLINKS-01 实现了 [[note:UUID|标题]] 格式的正向引用插入。
 *   BACKLINKS-02 需要支持"反向链接查询"：给定目标笔记，找出所有引用了它的来源笔记。
 *
 *   本模块提供两个核心能力：
 *     1) extractNoteIdsFromContent(content): 从 note.content 字符串里
 *        解析出所有 [[note:UUID|标题]] 引用，去重返回 targetNoteId 集合。
 *     2) syncNoteLinks(db, userId, sourceNoteId, content): 把 note_links 表里
 *        sourceNoteId 对应的行**全量同步**到 content 当前实际引用的集合。
 *        实现：DELETE old → INSERT new（在调用方提供的 db 连接里执行）。
 *
 * 维护时机（写时维护）：
 *   - POST /api/notes        新笔记创建后 → syncNoteLinks
 *   - PUT  /api/notes/:id    笔记内容更新后 → syncNoteLinks（仅 content 变更时）
 *
 * 不维护的场景：
 *   - notes.isTrashed = 1：被丢回收站的笔记**保留**引用记录。
 *     回收站里的笔记不参与反向链接查询（API 层过滤 isTrashed=1 的来源笔记）。
 *   - Markdown 模式：当前仅解析 TipTap JSON 和 HTML 中的 [[note:...]] 格式。
 *     Markdown 编辑器暂未支持 [[ 双链，后续可扩展。
 *
 * 引用格式：
 *   - 纯文本：`[[note:UUID|标题]]`
 *   - TipTap JSON 中表现为 text node，可能带有 link mark（href: "note:UUID"）
 *   - HTML 中可能被渲染为 `<a href="note:UUID">标题</a>`
 */

import type Database from "better-sqlite3";
import { v4 as uuid } from "uuid";

// 匹配 [[note:UUID|标题]] 格式（纯文本形式）
// 也匹配 href="note:UUID" 格式（HTML/TipTap link mark 形式）
// UUID 支持大小写十六进制
const NOTE_LINK_RE = /\[\[note:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\|[^\]]*)?\]\]/g;
const NOTE_HREF_RE = /note:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g;

/**
 * 从 note.content 字符串里解析出所有被引用的 note id 和 linkText。
 *
 * 兼容两种格式：
 *   - 纯文本：`[[note:UUID|标题]]`
 *   - HTML/TipTap：`href="note:UUID"`
 *
 * 返回 Map<targetNoteId, linkText>（不含自引用，调用方传入 sourceNoteId 过滤）。
 * 同一 targetNoteId 多次出现时，保留第一个 linkText。
 */
export function extractNoteLinksFromContent(content: string): Map<string, string | null> {
  const links = new Map<string, string | null>();

  // 匹配 [[note:UUID|标题]] 格式
  for (const match of content.matchAll(NOTE_LINK_RE)) {
    const noteId = match[1].toLowerCase();
    // 提取 | 后面的标题部分（如果存在）
    const fullMatch = match[0];
    const pipeIndex = fullMatch.indexOf("|");
    const linkText = pipeIndex >= 0 ? fullMatch.slice(pipeIndex + 1, -2) : null;
    if (!links.has(noteId)) {
      links.set(noteId, linkText || null);
    }
  }

  // 匹配 href="note:UUID" 格式（HTML/TipTap link mark）
  for (const match of content.matchAll(NOTE_HREF_RE)) {
    const noteId = match[1].toLowerCase();
    if (!links.has(noteId)) {
      links.set(noteId, null);
    }
  }

  return links;
}

/**
 * 同步 note_links 表：全量重建 sourceNoteId 的引用关系。
 *
 * 逻辑：
 *   1. DELETE FROM note_links WHERE userId = ? AND sourceNoteId = ?
 *   2. 从 content 解析出 targetNoteId 和 linkText
 *   3. 去重、排除自引用
 *   4. 过滤掉不存在的 target note
 *   5. INSERT 新的 note_links 行（含 linkText）
 *
 * 失败仅打日志，不阻断保存（与 attachmentReferences 一致）。
 */
export function syncNoteLinks(
  db: Database.Database,
  userId: string,
  sourceNoteId: string,
  content: string,
): void {
  try {
    // 1. 清除旧的引用关系
    db.prepare(
      "DELETE FROM note_links WHERE userId = ? AND sourceNoteId = ?"
    ).run(userId, sourceNoteId);

    // 2. 解析新的引用（含 linkText）
    const links = extractNoteLinksFromContent(content);

    // 3. 排除自引用
    links.delete(sourceNoteId.toLowerCase());

    if (links.size === 0) return;

    // 4. 过滤掉不存在的 target note（简单校验）
    const validEntries: Array<[string, string | null]> = [];
    const checkStmt = db.prepare("SELECT id FROM notes WHERE id = ?");
    for (const [targetId, linkText] of links) {
      const exists = checkStmt.get(targetId);
      if (exists) validEntries.push([targetId, linkText]);
    }

    if (validEntries.length === 0) return;

    // 5. 批量插入新的引用关系（含 linkText）
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO note_links (id, userId, sourceNoteId, targetNoteId, linkText, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const insertMany = db.transaction((entries: Array<[string, string | null]>) => {
      for (const [targetId, linkText] of entries) {
        insertStmt.run(uuid(), userId, sourceNoteId, targetId, linkText);
      }
    });

    insertMany(validEntries);
  } catch (e) {
    console.warn("[syncNoteLinks] failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * 获取目标笔记的所有反向链接（来源笔记）。
 *
 * 返回结构：
 *   - sourceNoteId: 来源笔记 ID
 *   - title: 来源笔记标题
 *   - updatedAt: 来源笔记更新时间
 *   - linkText: 引用时的显示文本（可选）
 *
 * 排除规则：
 *   - isTrashed = 1 的来源笔记
 *   - 无权限的来源笔记（调用方应已做过权限校验）
 */
export function getBacklinks(
  db: Database.Database,
  userId: string,
  targetNoteId: string,
  limit: number = 50,
): Array<{
  sourceNoteId: string;
  title: string;
  updatedAt: string;
  linkText: string | null;
}> {
  try {
    const rows = db.prepare(`
      SELECT
        nl.sourceNoteId,
        n.title,
        n.updatedAt,
        nl.linkText
      FROM note_links nl
      JOIN notes n ON n.id = nl.sourceNoteId
      WHERE nl.userId = ?
        AND nl.targetNoteId = ?
        AND n.isTrashed = 0
      ORDER BY n.updatedAt DESC
      LIMIT ?
    `).all(userId, targetNoteId, limit) as Array<{
      sourceNoteId: string;
      title: string;
      updatedAt: string;
      linkText: string | null;
    }>;

    return rows;
  } catch (e) {
    console.warn("[getBacklinks] failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
