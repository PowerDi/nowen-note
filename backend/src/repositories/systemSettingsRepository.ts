/**
 * System Settings Repository
 *
 * 职责：
 * - 封装 system_settings 表的所有数据库操作
 * - 提供类型安全的接口
 * - 保持现有 SQLite 行为不变
 */

import { getDb } from "../db/schema";
import type { SystemSetting } from "./types";

export const systemSettingsRepository = {
  /**
   * 获取单个设置
   */
  get(key: string): SystemSetting | undefined {
    const db = getDb();
    return db
      .prepare("SELECT key, value, updatedAt FROM system_settings WHERE key = ?")
      .get(key) as SystemSetting | undefined;
  },

  /**
   * 获取多个设置
   */
  getMany(keys: string[]): SystemSetting[] {
    if (keys.length === 0) return [];
    const db = getDb();
    const placeholders = keys.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT key, value, updatedAt FROM system_settings WHERE key IN (${placeholders})`,
      )
      .all(...keys) as SystemSetting[];
  },

  /**
   * 获取所有设置
   */
  getAll(): SystemSetting[] {
    const db = getDb();
    return db
      .prepare("SELECT key, value, updatedAt FROM system_settings")
      .all() as SystemSetting[];
  },

  /**
   * 按前缀获取设置
   */
  getByPrefix(prefix: string): SystemSetting[] {
    const db = getDb();
    return db
      .prepare(
        "SELECT key, value, updatedAt FROM system_settings WHERE key LIKE ?",
      )
      .all(`${prefix}%`) as SystemSetting[];
  },

  /**
   * 按多个前缀获取设置
   */
  getByPrefixes(prefixes: string[]): SystemSetting[] {
    if (prefixes.length === 0) return [];
    const db = getDb();
    const conditions = prefixes.map(() => "key LIKE ?").join(" OR ");
    const params = prefixes.map((p) => `${p}%`);
    return db
      .prepare(
        `SELECT key, value, updatedAt FROM system_settings WHERE ${conditions}`,
      )
      .all(...params) as SystemSetting[];
  },

  /**
   * 设置单个值（upsert）
   */
  set(key: string, value: string): void {
    const db = getDb();
    db.prepare(
      `INSERT INTO system_settings (key, value, updatedAt)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')`,
    ).run(key, value);
  },

  /**
   * 设置多个值（批量 upsert，在事务中执行）
   */
  setMany(entries: Array<{ key: string; value: string }>): void {
    if (entries.length === 0) return;
    const db = getDb();
    const upsert = db.prepare(
      `INSERT INTO system_settings (key, value, updatedAt)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = datetime('now')`,
    );
    const tx = db.transaction(() => {
      for (const { key, value } of entries) {
        upsert.run(key, value);
      }
    });
    tx();
  },

  /**
   * 删除单个设置
   */
  delete(key: string): void {
    const db = getDb();
    db.prepare("DELETE FROM system_settings WHERE key = ?").run(key);
  },

  /**
   * 删除多个设置
   */
  deleteMany(keys: string[]): void {
    if (keys.length === 0) return;
    const db = getDb();
    const placeholders = keys.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM system_settings WHERE key IN (${placeholders})`,
    ).run(...keys);
  },

  /**
   * 按前缀删除设置
   */
  deleteByPrefix(prefix: string): void {
    const db = getDb();
    db.prepare("DELETE FROM system_settings WHERE key LIKE ?").run(
      `${prefix}%`,
    );
  },
};
