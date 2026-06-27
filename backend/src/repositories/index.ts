/**
 * Repositories 统一导出
 *
 * 职责：
 * - 提供统一的导入入口
 * - 便于后续扩展其他 Repository
 */

export { systemSettingsRepository } from "./systemSettingsRepository";
export { customFontsRepository } from "./customFontsRepository";

// 类型导出
export type { SystemSetting, CustomFont } from "./types";
