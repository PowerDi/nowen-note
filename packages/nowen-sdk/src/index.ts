/**
 * @nowen/sdk — Nowen Note TypeScript SDK
 *
 * 用法：
 * ```ts
 * import { NowenClient, NowenAttachmentClient } from "@nowen/sdk";
 *
 * const config = {
 *   baseUrl: "http://localhost:3001",
 *   username: "admin",
 *   password: "admin123",
 * };
 *
 * const client = new NowenClient(config);
 * const attachments = new NowenAttachmentClient(config);
 * const notebooks = await client.listNotebooks();
 * ```
 */

export { NowenClient } from "./client.js";
export { NowenAttachmentClient } from "./attachments.js";
export type * from "./types.js";
export type * from "./attachments.js";
