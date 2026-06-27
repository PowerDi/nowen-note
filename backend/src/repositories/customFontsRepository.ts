/**
 * Custom Fonts Repository
 *
 * 职责：
 * - 封装 custom_fonts 表的所有数据库操作
 * - 提供类型安全的接口
 * - 保持现有 SQLite 行为不变
 */

import { getDb } from "../db/schema";
import type { CustomFont } from "./types";

export const customFontsRepository = {
  /**
   * 获取所有字体
   */
  getAll(): CustomFont[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT id, name, fileName, format, fileSize, createdAt FROM custom_fonts ORDER BY createdAt DESC",
      )
      .all() as CustomFont[];
  },

  /**
   * 获取字体列表（不含 fileSize，兼容旧 API）
   */
  getList(): Array<Omit<CustomFont, "fileSize">> {
    const db = getDb();
    return db
      .prepare(
        "SELECT id, name, fileName, format, createdAt FROM custom_fonts ORDER BY createdAt DESC",
      )
      .all() as Array<Omit<CustomFont, "fileSize">>;
  },

  /**
   * 根据 ID 获取字体
   */
  getById(id: string): CustomFont | undefined {
    const db = getDb();
    return db
      .prepare(
        "SELECT id, name, fileName, format, fileSize, createdAt FROM custom_fonts WHERE id = ?",
      )
      .get(id) as CustomFont | undefined;
  },

  /**
   * 根据 ID 获取字体（精简版，用于文件下载）
   */
  getByIdForDownload(
    id: string,
  ): Pick<CustomFont, "id" | "fileName" | "format"> | undefined {
    const db = getDb();
    return db
      .prepare("SELECT id, fileName, format FROM custom_fonts WHERE id = ?")
      .get(id) as Pick<CustomFont, "id" | "fileName" | "format"> | undefined;
  },

  /**
   * 根据文件名获取字体
   */
  getByFileName(fileName: string): CustomFont | undefined {
    const db = getDb();
    return db
      .prepare(
        "SELECT id, name, fileName, format, fileSize, createdAt FROM custom_fonts WHERE fileName = ?",
      )
      .get(fileName) as CustomFont | undefined;
  },

  /**
   * 根据文件名获取字体 ID（用于存在性检查）
   */
  getIdByFileName(fileName: string): string | undefined {
    const db = getDb();
    const row = db
      .prepare("SELECT id FROM custom_fonts WHERE fileName = ?")
      .get(fileName) as { id: string } | undefined;
    return row?.id;
  },

  /**
   * 创建字体
   */
  create(
    font: Omit<CustomFont, "createdAt"> & { createdAt?: string },
  ): void {
    const db = getDb();
    db.prepare(
      `INSERT INTO custom_fonts (id, name, fileName, format, fileSize, createdAt)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    ).run(font.id, font.name, font.fileName, font.format, font.fileSize);
  },

  /**
   * 删除字体
   */
  delete(id: string): void {
    const db = getDb();
    db.prepare("DELETE FROM custom_fonts WHERE id = ?").run(id);
  },

  /**
   * 检查文件名是否存在
   */
  existsByFileName(fileName: string): boolean {
    const db = getDb();
    const result = db
      .prepare("SELECT 1 FROM custom_fonts WHERE fileName = ? LIMIT 1")
      .get(fileName);
    return !!result;
  },
};
