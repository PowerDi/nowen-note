/**
 * Repository 共享类型定义
 *
 * 职责：
 * - 定义 Repository 方法的参数/返回值类型
 * - 确保类型在整个项目中一致使用
 */

/** system_settings 表结构 */
export interface SystemSetting {
  key: string;
  value: string;
  updatedAt: string;
}

/** custom_fonts 表结构 */
export interface CustomFont {
  id: string;
  name: string;
  fileName: string;
  format: string;
  fileSize: number;
  createdAt: string;
}
