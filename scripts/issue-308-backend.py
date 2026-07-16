from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, got {count}: {old[:100]!r}")
    write(path, text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str, flags: int = re.S) -> None:
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: regex expected one match, got {count}: {pattern[:120]!r}")
    write(path, next_text)


def insert_before(path: str, marker: str, content: str) -> None:
    replace_once(path, marker, content + marker)


write(
    "backend/src/lib/share-credential-rate-limit.ts",
    r'''import crypto from "crypto";

interface CredentialBucket {
  failures: number[];
  blockedUntil: number;
}

const credentialBuckets = new Map<string, CredentialBucket>();
const anonymousActionBuckets = new Map<string, number[]>();
const CREDENTIAL_WINDOW_MS = 60_000;
const CREDENTIAL_MAX_FAILURES = 8;
const CREDENTIAL_COOLDOWN_MS = 5 * 60_000;

export function getClientIp(c: any): string {
  const forwarded = c.req.header("X-Forwarded-For") || c.req.header("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || c.req.header("X-Real-IP") || c.req.header("x-real-ip") || "unknown";
}

export function hashClientIp(ip: string): string {
  return crypto.createHash("sha256").update(ip || "unknown").digest("hex");
}

function pruneFailures(values: number[], now: number): number[] {
  return values.filter((time) => now - time < CREDENTIAL_WINDOW_MS);
}

export function checkCredentialAttempt(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = credentialBuckets.get(key) || { failures: [], blockedUntil: 0 };
  current.failures = pruneFailures(current.failures, now);
  if (current.blockedUntil > now) {
    credentialBuckets.set(key, current);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000)) };
  }
  if (current.blockedUntil) current.blockedUntil = 0;
  credentialBuckets.set(key, current);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordCredentialFailure(key: string): void {
  const now = Date.now();
  const current = credentialBuckets.get(key) || { failures: [], blockedUntil: 0 };
  current.failures = pruneFailures(current.failures, now);
  current.failures.push(now);
  if (current.failures.length >= CREDENTIAL_MAX_FAILURES) {
    current.blockedUntil = now + CREDENTIAL_COOLDOWN_MS;
  }
  credentialBuckets.set(key, current);
}

export function recordCredentialSuccess(key: string): void {
  credentialBuckets.delete(key);
}

export function allowAnonymousAction(
  namespace: string,
  subject: string,
  maxAttempts = 30,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const key = `${namespace}:${subject}`;
  const recent = (anonymousActionBuckets.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= maxAttempts) {
    anonymousActionBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  anonymousActionBuckets.set(key, recent);
  if (anonymousActionBuckets.size > 10_000) {
    for (const [bucketKey, values] of anonymousActionBuckets) {
      if (!values.some((time) => now - time < windowMs)) anonymousActionBuckets.delete(bucketKey);
    }
  }
  return true;
}

export function resetShareRateLimitsForTests(): void {
  credentialBuckets.clear();
  anonymousActionBuckets.clear();
}
''',
)

write(
    "backend/src/services/share-capabilities.ts",
    r'''import { hasPermission, resolveNotePermission, type Permission } from "../middleware/acl";
import { memberQueryService } from "../queries/memberQueryService";

export interface EffectiveNoteCapabilities {
  permission: Permission | null;
  read: boolean;
  comment: boolean;
  write: boolean;
  manage: boolean;
  download: boolean;
  reshare: boolean;
}

export function resolveEffectiveNoteCapabilities(noteId: string, userId: string): EffectiveNoteCapabilities {
  const { permission } = resolveNotePermission(noteId, userId);
  const access = userId ? memberQueryService.getNoteNotebookMemberAccess(noteId, userId) : undefined;
  const read = hasPermission(permission, "read");
  const comment = hasPermission(permission, "comment");
  const write = hasPermission(permission, "write");
  const manage = hasPermission(permission, "manage");

  return {
    permission,
    read,
    comment,
    write,
    manage,
    download: read && (manage || access?.allowDownload !== 0),
    reshare: manage || Boolean(access?.allowReshare),
  };
}
''',
)

write(
    "backend/src/services/single-share-access.ts",
    r'''import crypto from "crypto";
import type { Context, Next } from "hono";
import type { Hono } from "hono";
import { getDb } from "../db/schema";
import { verifyShareAccessToken } from "../lib/auth-security";

export interface SingleShareAccessRow {
  id: string;
  noteId: string;
  ownerId: string;
  permission: string;
  password: string | null;
  credentialVersion: number;
  isActive: number;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
}

export type SingleShareAccessResult =
  | { ok: true; sessionHash: string | null }
  | { ok: false; status: 401 | 404 | 410; payload: Record<string, unknown> };

export function findSingleShareByToken(token: string): SingleShareAccessRow | undefined {
  if (!token || token.length > 256) return undefined;
  return getDb().prepare(`
    SELECT id, noteId, ownerId, permission, password,
           COALESCE(credentialVersion, 1) AS credentialVersion,
           isActive, expiresAt, maxViews, viewCount
    FROM shares WHERE shareToken = ?
  `).get(token) as SingleShareAccessRow | undefined;
}

export function getShareSessionHash(c: Context, shareId: string): string | null {
  const raw = (c.req.header("X-Share-Session") || c.req.header("x-share-session") || "").trim();
  if (!raw || raw.length < 8 || raw.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(raw)) return null;
  return crypto.createHash("sha256").update(`${shareId}:${raw}`).digest("hex");
}

function isExpired(value: string | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function hasKnownSession(shareId: string, sessionHash: string | null): boolean {
  if (!sessionHash) return false;
  return Boolean(getDb().prepare(
    "SELECT 1 AS ok FROM share_view_sessions WHERE shareId = ? AND sessionHash = ?",
  ).get(shareId, sessionHash));
}

export function authorizeSingleShareRequest(
  c: Context,
  share: SingleShareAccessRow | undefined,
  options: { requireCredential?: boolean } = {},
): SingleShareAccessResult {
  if (!share) return { ok: false, status: 404, payload: { error: "分享不存在", code: "SHARE_NOT_FOUND" } };
  if (!share.isActive) return { ok: false, status: 410, payload: { error: "分享已被撤销", code: "SHARE_REVOKED" } };
  if (isExpired(share.expiresAt)) {
    return { ok: false, status: 410, payload: { error: "分享链接已过期", code: "SHARE_EXPIRED" } };
  }

  const sessionHash = getShareSessionHash(c, share.id);
  if (share.maxViews && share.viewCount >= share.maxViews && !hasKnownSession(share.id, sessionHash)) {
    return { ok: false, status: 410, payload: { error: "分享链接已达到最大访问会话数", code: "SHARE_VIEW_LIMIT" } };
  }

  if (options.requireCredential && share.password) {
    const auth = c.req.header("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return { ok: false, status: 401, payload: { error: "需要密码验证", code: "SHARE_PASSWORD_REQUIRED", needPassword: true } };
    }
    const verified = verifyShareAccessToken(auth.slice(7), share.id, share.credentialVersion);
    if (!verified) {
      return { ok: false, status: 401, payload: { error: "分享访问令牌无效或已过期", code: "SHARE_ACCESS_TOKEN_INVALID" } };
    }
  }

  return { ok: true, sessionHash };
}

export function consumeShareViewSession(
  c: Context,
  share: SingleShareAccessRow,
): { ok: true; counted: boolean; viewCount: number } | { ok: false } {
  const db = getDb();
  const sessionHash = getShareSessionHash(c, share.id);
  return db.transaction(() => {
    if (sessionHash) {
      const existing = db.prepare(
        "SELECT 1 AS ok FROM share_view_sessions WHERE shareId = ? AND sessionHash = ?",
      ).get(share.id, sessionHash);
      if (existing) {
        db.prepare("UPDATE share_view_sessions SET lastSeenAt = datetime('now') WHERE shareId = ? AND sessionHash = ?")
          .run(share.id, sessionHash);
        const current = db.prepare("SELECT viewCount FROM shares WHERE id = ?").get(share.id) as { viewCount: number };
        return { ok: true as const, counted: false, viewCount: current.viewCount };
      }
    }

    const updated = db.prepare(`
      UPDATE shares SET viewCount = viewCount + 1
      WHERE id = ? AND isActive = 1
        AND (maxViews IS NULL OR viewCount < maxViews)
    `).run(share.id);
    if (!updated.changes) return { ok: false as const };

    if (sessionHash) {
      db.prepare(`
        INSERT OR IGNORE INTO share_view_sessions (shareId, sessionHash, createdAt, lastSeenAt)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `).run(share.id, sessionHash);
    }
    const current = db.prepare("SELECT viewCount FROM shares WHERE id = ?").get(share.id) as { viewCount: number };
    return { ok: true as const, counted: true, viewCount: current.viewCount };
  })();
}

export function resetShareViewSessions(shareId: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM share_view_sessions WHERE shareId = ?").run(shareId);
    db.prepare("UPDATE shares SET viewCount = 0 WHERE id = ?").run(shareId);
  })();
}

export function installSingleShareGuard(router: Hono): void {
  const guard = async (c: Context, next: Next) => {
    const token = c.req.param("token");
    if (!token || token === "notebook-public") return next();
    const share = findSingleShareByToken(token);
    const path = c.req.path;
    const isVerify = path.endsWith(`/${token}/verify`);
    const isInfo = c.req.method === "GET" && path.endsWith(`/${token}`);
    const result = authorizeSingleShareRequest(c, share, { requireCredential: !isVerify && !isInfo });
    c.header("Cache-Control", "private, no-store");
    c.header("Pragma", "no-cache");
    if (!result.ok) return c.json(result.payload, result.status);
    await next();
  };
  router.use("/:token", guard);
  router.use("/:token/*", guard);
}
''',
)

# auth-security: credential version binds temporary share tokens to the current secret.
replace_regex(
    "backend/src/lib/auth-security.ts",
    r'''export interface ShareTokenPayload \{.*?export function verifyShareAccessToken\(token: string, expectedShareId: string\): ShareTokenPayload \| null \{.*?\n\}''',
    r'''export interface ShareTokenPayload {
  typ: "share";
  shareId: string;
  noteId: string;
  credentialVersion?: number;
  iat?: number;
  exp?: number;
}

/** 签发分享访问 token（访客通过密码/访问码验证后换取，1 小时有效）。 */
export function signShareAccessToken(params: {
  shareId: string;
  noteId: string;
  credentialVersion?: number;
}): string {
  return jwt.sign(
    {
      typ: "share",
      shareId: params.shareId,
      noteId: params.noteId,
      credentialVersion: params.credentialVersion ?? 1,
    },
    SHARE_JWT_SECRET,
    { expiresIn: "1h" },
  );
}

/** 校验分享访问 token，并可要求凭证版本一致，使改密后旧 token 立即失效。 */
export function verifyShareAccessToken(
  token: string,
  expectedShareId: string,
  expectedCredentialVersion?: number,
): ShareTokenPayload | null {
  try {
    const payload = jwt.verify(token, SHARE_JWT_SECRET) as ShareTokenPayload;
    if (payload.typ !== "share") return null;
    if (payload.shareId !== expectedShareId) return null;
    if (
      expectedCredentialVersion !== undefined
      && (payload.credentialVersion ?? 0) !== expectedCredentialVersion
    ) return null;
    return payload;
  } catch {
    return null;
  }
}''',
)

# SQLite baseline schema.
replace_once(
    "backend/src/db/schema.ts",
    "      password TEXT,\n      expiresAt TEXT,",
    "      password TEXT,\n      credentialVersion INTEGER NOT NULL DEFAULT 1,\n      expiresAt TEXT,",
)
replace_once(
    "backend/src/db/schema.ts",
    "    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(shareToken);\n",
    "    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(shareToken);\n\n"
    "    CREATE TABLE IF NOT EXISTS share_view_sessions (\n"
    "      shareId TEXT NOT NULL,\n"
    "      sessionHash TEXT NOT NULL,\n"
    "      createdAt TEXT NOT NULL DEFAULT (datetime('now')),\n"
    "      lastSeenAt TEXT NOT NULL DEFAULT (datetime('now')),\n"
    "      PRIMARY KEY (shareId, sessionHash),\n"
    "      FOREIGN KEY (shareId) REFERENCES shares(id) ON DELETE CASCADE\n"
    "    );\n"
    "    CREATE INDEX IF NOT EXISTS idx_share_view_sessions_seen ON share_view_sessions(shareId, lastSeenAt);\n",
)
replace_once(
    "backend/src/db/schema.ts",
    "      anchorData TEXT,\n      isResolved INTEGER DEFAULT 0,",
    "      anchorData TEXT,\n      sourceType TEXT NOT NULL DEFAULT 'note_share',\n      sourceId TEXT,\n      isHidden INTEGER NOT NULL DEFAULT 0,\n      isResolved INTEGER DEFAULT 0,",
)
replace_once(
    "backend/src/db/schema.ts",
    "    CREATE INDEX IF NOT EXISTS idx_share_comments_note ON share_comments(noteId);\n",
    "    CREATE INDEX IF NOT EXISTS idx_share_comments_note ON share_comments(noteId);\n"
    "    CREATE INDEX IF NOT EXISTS idx_share_comments_source ON share_comments(sourceType, sourceId, noteId, createdAt);\n",
)
replace_once(
    "backend/src/db/schema.ts",
    "      status TEXT NOT NULL DEFAULT 'active',\n      invitedBy TEXT,",
    "      status TEXT NOT NULL DEFAULT 'active',\n"
    "      allowDownload INTEGER NOT NULL DEFAULT 1,\n"
    "      allowReshare INTEGER NOT NULL DEFAULT 0,\n"
    "      source TEXT NOT NULL DEFAULT 'manual',\n"
    "      sourceId TEXT,\n"
    "      invitedBy TEXT,",
)

# Migration v49.
insert_before(
    "backend/src/db/migrations.impl.ts",
    "\n];\n\n/** 当前代码已知的最高 schema 版本",
    r'''
  // v49: 分享安全、能力与生命周期闭环（Issue #308）
  {
    version: 49,
    name: "share-security-capabilities-lifecycle",
    up: (db) => {
      const addColumnIfMissing = (table: string, column: string, definition: string) => {
        const exists = db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?").get(table);
        if (!exists) return;
        const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        if (!columns.some((entry) => entry.name === column)) {
          db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
        }
      };

      addColumnIfMissing("shares", "credentialVersion", "INTEGER NOT NULL DEFAULT 1");
      addColumnIfMissing("share_comments", "sourceType", "TEXT NOT NULL DEFAULT 'note_share'");
      addColumnIfMissing("share_comments", "sourceId", "TEXT");
      addColumnIfMissing("share_comments", "isHidden", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing("notebook_members", "allowDownload", "INTEGER NOT NULL DEFAULT 1");
      addColumnIfMissing("notebook_members", "allowReshare", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing("notebook_members", "source", "TEXT NOT NULL DEFAULT 'manual'");
      addColumnIfMissing("notebook_members", "sourceId", "TEXT");
      addColumnIfMissing("notebook_publications", "credentialVersion", "INTEGER NOT NULL DEFAULT 1");

      db.exec(`
        CREATE TABLE IF NOT EXISTS share_view_sessions (
          shareId TEXT NOT NULL,
          sessionHash TEXT NOT NULL,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          lastSeenAt TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (shareId, sessionHash),
          FOREIGN KEY (shareId) REFERENCES shares(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_share_view_sessions_seen
          ON share_view_sessions(shareId, lastSeenAt);
        CREATE INDEX IF NOT EXISTS idx_share_comments_source
          ON share_comments(sourceType, sourceId, noteId, createdAt);
        CREATE INDEX IF NOT EXISTS idx_notebook_members_source
          ON notebook_members(source, sourceId, notebookId);
      `);

      const legacyPublicComments = db.prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='notebook_public_comments'",
      ).get();
      if (legacyPublicComments) {
        db.exec(`
          INSERT OR IGNORE INTO share_comments (
            id, noteId, userId, guestName, content, sourceType, sourceId,
            isHidden, isResolved, createdAt, updatedAt
          )
          SELECT id, noteId, NULL, nickname, content, 'notebook_publication', publicationId,
                 0, 0, createdAt, createdAt
          FROM notebook_public_comments;
        `);
      }
    },
  },
''',
)

# PostgreSQL baseline schema: keep future PG installs aligned.
pg_path = "backend/src/db/postgres/schema.base.sql"
pg = read(pg_path)
pg = pg.replace('"password" TEXT,\n  "expiresAt"', '"password" TEXT,\n  "credentialVersion" INTEGER NOT NULL DEFAULT 1,\n  "expiresAt"', 1)
pg = pg.replace('"anchorData" TEXT,\n  "isResolved"', '"anchorData" TEXT,\n  "sourceType" TEXT NOT NULL DEFAULT \'note_share\',\n  "sourceId" TEXT,\n  "isHidden" INTEGER NOT NULL DEFAULT 0,\n  "isResolved"', 1)
pg = pg.replace('"status" TEXT NOT NULL DEFAULT \'active\',\n  "invitedBy"', '"status" TEXT NOT NULL DEFAULT \'active\',\n  "allowDownload" INTEGER NOT NULL DEFAULT 1,\n  "allowReshare" INTEGER NOT NULL DEFAULT 0,\n  "source" TEXT NOT NULL DEFAULT \'manual\',\n  "sourceId" TEXT,\n  "invitedBy"', 1)
if 'CREATE TABLE IF NOT EXISTS "share_view_sessions"' not in pg:
    marker = 'CREATE INDEX IF NOT EXISTS "idx_shares_token" ON "shares"("shareToken");'
    addition = marker + '''\n\nCREATE TABLE IF NOT EXISTS "share_view_sessions" (\n  "shareId" TEXT NOT NULL REFERENCES "shares"("id") ON DELETE CASCADE,\n  "sessionHash" TEXT NOT NULL,\n  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY ("shareId", "sessionHash")\n);\nCREATE INDEX IF NOT EXISTS "idx_share_view_sessions_seen" ON "share_view_sessions"("shareId", "lastSeenAt");'''
    if marker not in pg:
        raise RuntimeError("postgres shares index marker missing")
    pg = pg.replace(marker, addition, 1)
write(pg_path, pg)

# Member permission query must carry capability flags instead of hard-coded metadata.
replace_once(
    "backend/src/queries/memberQueryService.ts",
    "        1 AS allowDownload,\n        CASE WHEN nm.role = 'owner' THEN 1 ELSE 0 END AS allowReshare,",
    "        COALESCE(nm.allowDownload, 1) AS allowDownload,\n"
    "        COALESCE(nm.allowReshare, CASE WHEN nm.role = 'owner' THEN 1 ELSE 0 END) AS allowReshare,",
)

# Notebook member repository: source-aware upsert and lifecycle helpers.
repo_path = "backend/src/repositories/notebookMembersRepository.ts"
repo = read(repo_path)
repo = repo.replace(
    '''    invitedBy: string | null;\n  }): void {\n    const db = getDb();\n    db.prepare(\n      `INSERT INTO notebook_members (id, "notebookId", "userId", role, status, "invitedBy")\n       VALUES (?, ?, ?, ?, 'active', ?)\n       ON CONFLICT("notebookId", "userId") DO UPDATE SET\n         role = excluded.role,\n         status = 'active',\n         "updatedAt" = datetime('now')`\n    ).run(input.id, input.notebookId, input.userId, input.role, input.invitedBy);''',
    '''    invitedBy: string | null;\n    allowDownload?: number | boolean;\n    allowReshare?: number | boolean;\n    source?: "manual" | "invite_link" | "publication";\n    sourceId?: string | null;\n  }): void {\n    const db = getDb();\n    const source = input.source || "manual";\n    const allowDownload = input.allowDownload === false || input.allowDownload === 0 ? 0 : 1;\n    const allowReshare = input.allowReshare === true || input.allowReshare === 1 ? 1 : 0;\n    db.prepare(\n      `INSERT INTO notebook_members (\n         id, "notebookId", "userId", role, status, "allowDownload", "allowReshare", source, "sourceId", "invitedBy"\n       ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)\n       ON CONFLICT("notebookId", "userId") DO UPDATE SET\n         role = CASE\n           WHEN notebook_members.source = 'manual' AND excluded.source != 'manual' THEN notebook_members.role\n           ELSE excluded.role\n         END,\n         status = 'active',\n         "allowDownload" = CASE\n           WHEN notebook_members.source = 'manual' AND excluded.source != 'manual' THEN notebook_members."allowDownload"\n           ELSE excluded."allowDownload"\n         END,\n         "allowReshare" = CASE\n           WHEN notebook_members.source = 'manual' AND excluded.source != 'manual' THEN notebook_members."allowReshare"\n           ELSE excluded."allowReshare"\n         END,\n         source = CASE\n           WHEN notebook_members.source = 'manual' AND excluded.source != 'manual' THEN notebook_members.source\n           ELSE excluded.source\n         END,\n         "sourceId" = CASE\n           WHEN notebook_members.source = 'manual' AND excluded.source != 'manual' THEN notebook_members."sourceId"\n           ELSE excluded."sourceId"\n         END,\n         "invitedBy" = CASE\n           WHEN notebook_members.source = 'manual' AND excluded.source != 'manual' THEN notebook_members."invitedBy"\n           ELSE excluded."invitedBy"\n         END,\n         "updatedAt" = datetime('now')`\n    ).run(\n      input.id, input.notebookId, input.userId, input.role, allowDownload, allowReshare,\n      source, input.sourceId || null, input.invitedBy,\n    );''',
    1,
)
# Add fields to list/get SELECTs and return types without changing external compatibility.
repo = repo.replace('status: string;\n    invitedBy:', 'status: string;\n    allowDownload: number;\n    allowReshare: number;\n    source: string;\n    sourceId: string | null;\n    invitedBy:')
repo = repo.replace('nm.role, nm.status, nm."invitedBy",', 'nm.role, nm.status, nm."allowDownload", nm."allowReshare", nm.source, nm."sourceId", nm."invitedBy",')
# Insert lifecycle helpers before async methods.
marker = '  async getRoleAsync('
if marker not in repo:
    raise RuntimeError("notebookMembersRepository async marker missing")
repo = repo.replace(marker, '''  removeBySource(source: "invite_link" | "publication", sourceId: string): number {\n    const result = getDb().prepare(\n      `UPDATE notebook_members SET status = 'removed', "updatedAt" = datetime('now')\n       WHERE source = ? AND "sourceId" = ? AND status = 'active'`,\n    ).run(source, sourceId);\n    return result.changes;\n  },\n\n  restrictBySource(\n    source: "invite_link" | "publication",\n    sourceId: string,\n    input: { role: "viewer" | "editor"; allowDownload: boolean; allowReshare: boolean },\n  ): number {\n    const result = getDb().prepare(\n      `UPDATE notebook_members\n       SET role = CASE WHEN ? = 'viewer' AND role = 'editor' THEN 'viewer' ELSE role END,\n           "allowDownload" = ?, "allowReshare" = ?, "updatedAt" = datetime('now')\n       WHERE source = ? AND "sourceId" = ? AND status = 'active'`,\n    ).run(input.role, input.allowDownload ? 1 : 0, input.allowReshare ? 1 : 0, source, sourceId);\n    return result.changes;\n  },\n\n''' + marker, 1)
write(repo_path, repo)

# Attachment signatures carry download capability and re-check it on every request.
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    'import { hasPermission, resolveNotePermission } from "../middleware/acl";\n',
    'import { hasPermission, resolveNotePermission } from "../middleware/acl";\n'
    'import { resolveEffectiveNoteCapabilities } from "../services/share-capabilities";\n',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '''export type AttachmentAccessScope =\n  | { version: 2; kind: "user"; subjectId: string; noteId: string }\n  | { version: 2; kind: "share"; subjectId: string; noteId: string }\n  | { version: 2; kind: "publication"; subjectId: string; noteId: string };''',
    '''export type AttachmentAccessScope =\n  | { version: 2; kind: "user"; subjectId: string; noteId: string; allowDownload: boolean }\n  | { version: 2; kind: "share"; subjectId: string; noteId: string; allowDownload: boolean }\n  | { version: 2; kind: "publication"; subjectId: string; noteId: string; allowDownload: boolean };''',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '  accessKind?: AttachmentAccessScope["kind"];\n}',
    '  accessKind?: AttachmentAccessScope["kind"];\n  allowDownload?: boolean;\n}',
)
replace_regex(
    "backend/src/lib/attachment-signed-url.ts",
    r'''export function createUserAttachmentScope\(userId: string, noteId: string\): string \{.*?export function createPublicationAttachmentScope\(publicationId: string, noteId: string\): string \{.*?\n\}''',
    r'''export function createUserAttachmentScope(userId: string, noteId: string, allowDownload = true): string {
  return encodeScope({ version: 2, kind: "user", subjectId: userId, noteId, allowDownload });
}

export function createShareAttachmentScope(shareId: string, noteId: string, allowDownload = true): string {
  return encodeScope({ version: 2, kind: "share", subjectId: shareId, noteId, allowDownload });
}

export function createPublicationAttachmentScope(
  publicationId: string,
  noteId: string,
  allowDownload = true,
): string {
  return encodeScope({ version: 2, kind: "publication", subjectId: publicationId, noteId, allowDownload });
}''',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '''      subjectId: parsed.subjectId,\n      noteId: parsed.noteId,\n    } as AttachmentAccessScope;''',
    '''      subjectId: parsed.subjectId,\n      noteId: parsed.noteId,\n      allowDownload: parsed.allowDownload !== false,\n    } as AttachmentAccessScope;''',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '''  if (scope.kind === "user") {\n    const { permission } = resolveNotePermission(scope.noteId, scope.subjectId);\n    if (!hasPermission(permission, "read")) {\n      return { valid: false, reason: "user_access_revoked", accessKind: "user" };\n    }\n    return { valid: true, accessKind: "user" };\n  }''',
    '''  if (scope.kind === "user") {\n    const capabilities = resolveEffectiveNoteCapabilities(scope.noteId, scope.subjectId);\n    if (!capabilities.read) {\n      return { valid: false, reason: "user_access_revoked", accessKind: "user" };\n    }\n    return {\n      valid: true,\n      accessKind: "user",\n      allowDownload: scope.allowDownload && capabilities.download,\n    };\n  }''',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '    return { valid: true, accessKind: "share" };',
    '    return { valid: true, accessKind: "share", allowDownload: scope.allowDownload };',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '      SELECT p.isActive, p.expiresAt\n',
    '      SELECT p.isActive, p.expiresAt, p.allowDownload\n',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '| { isActive: number; expiresAt: string | null }\n',
    '| { isActive: number; expiresAt: string | null; allowDownload: number }\n',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '    return { valid: true, accessKind: "publication" };',
    '    return { valid: true, accessKind: "publication", allowDownload: scope.allowDownload && publication.allowDownload !== 0 };',
)
replace_once(
    "backend/src/lib/attachment-signed-url.ts",
    '    const scope = createUserAttachmentScope(userId, attachment.noteId);',
    '    const capabilities = resolveEffectiveNoteCapabilities(attachment.noteId, userId);\n'
    '    const scope = createUserAttachmentScope(userId, attachment.noteId, capabilities.download);',
)

# Attachment route: use unified share lifecycle, capabilities, and block download query bypass.
replace_once(
    "backend/src/routes/attachments.ts",
    'import { hasPermission, resolveNotePermission } from "../middleware/acl";\n',
    'import { hasPermission, resolveNotePermission } from "../middleware/acl";\n'
    'import { resolveEffectiveNoteCapabilities } from "../services/share-capabilities";\n'
    'import { authorizeSingleShareRequest, findSingleShareByToken } from "../services/single-share-access";\n',
)
replace_regex(
    "backend/src/routes/attachments.ts",
    r'''function handleSharedAttachmentAccess\(c: Context\): Response \{.*?\n\}''',
    r'''function handleSharedAttachmentAccess(c: Context): Response {
  const token = (c.req.query("token") || "").trim();
  if (!token || token.length > 256) {
    return noStoreJson(c, { error: "缺少有效分享令牌", code: "SHARE_TOKEN_REQUIRED" }, 400);
  }

  const share = findSingleShareByToken(token);
  const access = authorizeSingleShareRequest(c, share, { requireCredential: true });
  if (!access.ok) return noStoreJson(c, access.payload, access.status);
  const scope = createShareAttachmentScope(share!.id, share!.noteId, true);
  return noStoreJson(c, {
    noteId: share!.noteId,
    urls: buildSignedAttachmentUrls(share!.noteId, scope, requestPublicOrigin(c)),
  });
}''',
)
replace_once(
    "backend/src/routes/attachments.ts",
    '''  const { permission } = resolveNotePermission(noteId, userId);\n  if (!hasPermission(permission, "read")) {''',
    '''  const capabilities = resolveEffectiveNoteCapabilities(noteId, userId);\n  if (!capabilities.read) {''',
)
replace_once(
    "backend/src/routes/attachments.ts",
    '  const scope = createUserAttachmentScope(userId, noteId);',
    '  const scope = createUserAttachmentScope(userId, noteId, capabilities.download);',
)
replace_once(
    "backend/src/routes/attachments.ts",
    '''  if (hasCompleteSignature) {\n    const verification = verifyAttachmentSignature(id, exp!, sig!, scope!);''',
    '''  let signatureVerification: ReturnType<typeof verifyAttachmentSignature> | null = null;\n  if (hasCompleteSignature) {\n    const verification = verifyAttachmentSignature(id, exp!, sig!, scope!);\n    signatureVerification = verification;''',
)
replace_once(
    "backend/src/routes/attachments.ts",
    '''  const metadataExists = Boolean(\n    getDb().prepare("SELECT 1 AS ok FROM attachments WHERE id = ?").get(id),\n  );''',
    '''  const downloadRequested = /^(?:1|true|yes)$/i.test(c.req.query("download") || "");\n  if (downloadRequested && signatureVerification?.allowDownload === false) {\n    console.warn("[attachment.access.denied]", { id, reason: "download_forbidden" });\n    return c.json({ error: "当前分享不允许下载附件", code: "ATTACHMENT_DOWNLOAD_FORBIDDEN" }, 403);\n  }\n\n  const metadataExists = Boolean(\n    getDb().prepare("SELECT 1 AS ok FROM attachments WHERE id = ?").get(id),\n  );''',
)

# CORS: allow the per-tab anonymous share session header.
replace_once(
    "backend/src/index.ts",
    '"X-Connection-Id", "X-Requested-With"',
    '"X-Connection-Id", "X-Share-Session", "X-Requested-With"',
)

# shares.ts imports and guard.
replace_once(
    "backend/src/routes/shares.ts",
    'import { noteVersionsRepository, shareCommentsRepository, noteYsnapshotsRepository, noteYupdatesRepository } from "../repositories";\n',
    'import { noteVersionsRepository, shareCommentsRepository, noteYsnapshotsRepository, noteYupdatesRepository } from "../repositories";\n'
    'import { resolveEffectiveNoteCapabilities } from "../services/share-capabilities";\n'
    'import { consumeShareViewSession, findSingleShareByToken, installSingleShareGuard, resetShareViewSessions } from "../services/single-share-access";\n'
    'import { checkCredentialAttempt, getClientIp as getCredentialClientIp, hashClientIp, recordCredentialFailure, recordCredentialSuccess } from "../lib/share-credential-rate-limit";\n',
)
replace_once(
    "backend/src/routes/shares.ts",
    'return crypto.randomBytes(9).toString("base64url");',
    'return crypto.randomBytes(24).toString("base64url");',
)
# Share creation: permission whitelist + reshare capability.
replace_once(
    "backend/src/routes/shares.ts",
    '''  // 验证笔记存在且属于当前用户\n  const note = db.prepare("SELECT id, userId, title FROM notes WHERE id = ? AND userId = ?").get(noteId, userId) as any;\n  if (!note) {\n    return c.json({ error: "笔记不存在或无权操作" }, 404);\n  }\n\n  const id = uuid();\n  const shareToken = generateShareToken();\n  const perm = permission || "view";''',
    '''  const note = db.prepare("SELECT id, userId, title FROM notes WHERE id = ?").get(noteId) as any;\n  if (!note) return c.json({ error: "笔记不存在" }, 404);\n  const capabilities = resolveEffectiveNoteCapabilities(noteId, userId);\n  if (!capabilities.reshare) {\n    return c.json({ error: "当前目录不允许二次分享", code: "RESHARE_FORBIDDEN" }, 403);\n  }\n\n  const id = uuid();\n  const shareToken = generateShareToken();\n  const perm = permission || "view";\n  if (!["view", "comment", "edit", "edit_auth"].includes(perm)) {\n    return c.json({ error: "分享权限无效" }, 400);\n  }''',
)
# Update route with settings editing, token rotation, view reset and audit.
replace_regex(
    "backend/src/routes/shares.ts",
    r'''// 更新分享设置\nsharesRouter\.put\("/:id", async \(c\) => \{.*?\n\}\);\n\n// 删除（撤销）分享''',
    r'''// 更新分享设置
sharesRouter.put("/:id", async (c) => {
  const db = getDb();
  const userId = c.req.header("X-User-Id") || "";
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const share = db.prepare("SELECT * FROM shares WHERE id = ?").get(id) as any;
  if (!share) return c.json({ error: "分享不存在" }, 404);
  const capabilities = resolveEffectiveNoteCapabilities(share.noteId, userId);
  if (share.ownerId !== userId && !capabilities.manage) {
    return c.json({ error: "无权管理此分享", code: "FORBIDDEN" }, 403);
  }

  const fields: string[] = [];
  const params: any[] = [];
  let credentialChanged = false;

  if (body.permission !== undefined) {
    if (!["view", "comment", "edit", "edit_auth"].includes(body.permission)) {
      return c.json({ error: "分享权限无效" }, 400);
    }
    fields.push("permission = ?"); params.push(body.permission);
  }
  if (body.expiresAt !== undefined) { fields.push("expiresAt = ?"); params.push(body.expiresAt || null); }
  if (body.maxViews !== undefined) {
    const value = body.maxViews === null || body.maxViews === "" ? null : Number(body.maxViews);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 1_000_000)) {
      return c.json({ error: "最大访问会话数无效" }, 400);
    }
    fields.push("maxViews = ?"); params.push(value);
  }
  if (body.isActive !== undefined) { fields.push("isActive = ?"); params.push(body.isActive ? 1 : 0); }

  if (body.password !== undefined) {
    if (body.password === "" || body.password === null) {
      fields.push("password = ?"); params.push(null);
    } else {
      const nextPassword = String(body.password).trim();
      if (nextPassword.length < 4 || nextPassword.length > 128) {
        return c.json({ error: "密码长度需为 4-128 个字符" }, 400);
      }
      fields.push("password = ?"); params.push(await bcrypt.hash(nextPassword, 10));
    }
    credentialChanged = true;
  }
  if (body.rotateToken === true) {
    fields.push("shareToken = ?"); params.push(generateShareToken());
    credentialChanged = true;
  }
  if (credentialChanged) fields.push("credentialVersion = credentialVersion + 1");

  if (fields.length === 0 && body.resetViews !== true) {
    return c.json({ error: "没有需要更新的字段" }, 400);
  }
  if (fields.length > 0) {
    fields.push("updatedAt = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE shares SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  }
  if (body.resetViews === true) resetShareViewSessions(id);

  logAudit(userId, "share", "update", {
    shareId: id,
    noteId: share.noteId,
    permission: body.permission,
    resetViews: body.resetViews === true,
    rotateToken: body.rotateToken === true,
    credentialChanged,
  }, { targetType: "share", targetId: id });

  const updated = db.prepare("SELECT * FROM shares WHERE id = ?").get(id) as any;
  const hasPassword = !!updated.password;
  delete updated.password;
  return c.json({ ...updated, hasPassword });
});

// 删除（撤销）分享''',
)
# Delete route: allow creator or note manager.
replace_once(
    "backend/src/routes/shares.ts",
    '  const share = db.prepare("SELECT id, noteId FROM shares WHERE id = ? AND ownerId = ?").get(id, userId) as any;\n  if (!share) return c.json({ error: "分享不存在" }, 404);',
    '  const share = db.prepare("SELECT id, noteId, ownerId FROM shares WHERE id = ?").get(id) as any;\n'
    '  if (!share) return c.json({ error: "分享不存在" }, 404);\n'
    '  const capabilities = resolveEffectiveNoteCapabilities(share.noteId, userId);\n'
    '  if (share.ownerId !== userId && !capabilities.manage) return c.json({ error: "无权撤销此分享" }, 403);',
)
replace_once(
    "backend/src/routes/shares.ts",
    'const sharedRouter = new Hono();\n',
    'const sharedRouter = new Hono();\ninstallSingleShareGuard(sharedRouter);\n',
)
# Password verification route.
replace_regex(
    "backend/src/routes/shares.ts",
    r'''// 验证密码（返回临时访问 token）\nsharedRouter\.post\("/:token/verify", async \(c\) => \{.*?\n\}\);''',
    r'''// 验证密码（返回临时访问 token）
sharedRouter.post("/:token/verify", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json().catch(() => ({}));
  const password = String(body.password || "");
  const share = findSingleShareByToken(token);
  if (!share) return c.json({ error: "分享不存在" }, 404);

  const ipHash = hashClientIp(getCredentialClientIp(c));
  const rateKey = `single:${share.id}:${ipHash}`;
  const rate = checkCredentialAttempt(rateKey);
  if (!rate.allowed) {
    c.header("Retry-After", String(rate.retryAfterSeconds));
    return c.json({ error: "验证尝试过于频繁，请稍后再试", code: "SHARE_CREDENTIAL_RATE_LIMIT" }, 429);
  }

  if (share.password) {
    if (!password) return c.json({ error: "请输入访问密码" }, 400);
    if (!(await bcrypt.compare(password, share.password))) {
      recordCredentialFailure(rateKey);
      logAudit("", "share", "credential_failure", { shareId: share.id, ipHash }, {
        targetType: "share", targetId: share.id, ip: ipHash, level: "warn",
      });
      return c.json({ error: "访问凭证错误" }, 403);
    }
  }
  recordCredentialSuccess(rateKey);
  const accessToken = signShareAccessToken({
    shareId: share.id,
    noteId: share.noteId,
    credentialVersion: share.credentialVersion,
  });
  return c.json({ success: true, accessToken });
});''',
)
# Count unique sessions rather than every content refresh.
replace_regex(
    "backend/src/routes/shares.ts",
    r'''  // H5: 原子地自增 viewCount.*?  if \(incRes\.changes === 0\) \{\n    return c\.json\(\{ error: "分享链接已达到最大访问次数" \}, 410\);\n  \}\n''',
    r'''  // 最大访问次数按浏览器会话计数；同一 tab 刷新、轮询和评论不会重复扣次数。
  const accessRow = findSingleShareByToken(token);
  if (!accessRow || !consumeShareViewSession(c, accessRow).ok) {
    return c.json({ error: "分享链接已达到最大访问会话数", code: "SHARE_VIEW_LIMIT" }, 410);
  }
''',
)
# P0 authenticated comment ACL and comment-note binding.
replace_regex(
    "backend/src/routes/shares.ts",
    r'''// ===== Phase 3: 评论批注 API =====.*?// ===== Phase 2: 批量检查笔记分享状态 =====''',
    r'''// ===== Phase 3: 评论批注 API =====

sharesRouter.get("/note/:noteId/comments", (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const noteId = c.req.param("noteId");
  const capabilities = resolveEffectiveNoteCapabilities(noteId, userId);
  if (!capabilities.read) return c.json({ error: "无权读取评论", code: "FORBIDDEN" }, 403);
  return c.json(shareCommentsRepository.listByNoteIdWithUser(noteId));
});

sharesRouter.post("/note/:noteId/comments", async (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const noteId = c.req.param("noteId");
  const capabilities = resolveEffectiveNoteCapabilities(noteId, userId);
  if (!capabilities.comment) return c.json({ error: "无权发表评论", code: "FORBIDDEN" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const content = String(body.content || "").trim();
  if (!content) return c.json({ error: "评论内容不能为空" }, 400);
  if (content.length > 1000) return c.json({ error: "评论内容过长（最多 1000 字）" }, 400);
  if (body.parentId) {
    const parent = shareCommentsRepository.getById(String(body.parentId));
    if (!parent || parent.noteId !== noteId) return c.json({ error: "父评论不属于当前笔记" }, 400);
  }
  const id = uuid();
  shareCommentsRepository.create({
    id,
    noteId,
    userId,
    parentId: body.parentId || null,
    content,
    anchorData: body.anchorData || null,
  });
  return c.json(shareCommentsRepository.getByIdWithUser(id), 201);
});

sharesRouter.delete("/note/:noteId/comments/:commentId", (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const noteId = c.req.param("noteId");
  const commentId = c.req.param("commentId");
  const comment = shareCommentsRepository.getById(commentId);
  if (!comment || comment.noteId !== noteId) return c.json({ error: "评论不存在" }, 404);
  const capabilities = resolveEffectiveNoteCapabilities(noteId, userId);
  if (comment.userId !== userId && !capabilities.manage) {
    return c.json({ error: "只能删除自己的评论或由管理员删除" }, 403);
  }
  shareCommentsRepository.delete(commentId);
  return c.json({ success: true });
});

sharesRouter.patch("/note/:noteId/comments/:commentId/resolve", (c) => {
  const userId = c.req.header("X-User-Id") || "";
  const noteId = c.req.param("noteId");
  const commentId = c.req.param("commentId");
  const capabilities = resolveEffectiveNoteCapabilities(noteId, userId);
  if (!capabilities.manage) return c.json({ error: "无权操作", code: "FORBIDDEN" }, 403);
  const comment = shareCommentsRepository.getResolved(commentId);
  if (!comment || comment.noteId !== noteId) return c.json({ error: "评论不存在" }, 404);
  shareCommentsRepository.updateResolved(commentId, comment.isResolved ? 0 : 1);
  return c.json(shareCommentsRepository.getByIdWithUser(commentId));
});

// ===== Phase 2: 批量检查笔记分享状态 =====''',
)
# Public comment list must respect comment permission; middleware already enforces lifecycle/password.
replace_once(
    "backend/src/routes/shares.ts",
    '''  if (!share || !share.isActive) {\n    return c.json({ error: "分享不存在" }, 404);\n  }\n\n  // 密码验证''',
    '''  if (!share || !share.isActive) {\n    return c.json({ error: "分享不存在" }, 404);\n  }\n  if (share.permission === "view") return c.json({ error: "当前分享不开放评论" }, 403);\n\n  // 密码验证''',
)

# Publication runtime: credential version, download capability, rate limiting, source-aware members.
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    'import { logAudit } from "../services/audit.js";\n',
    'import { logAudit } from "../services/audit.js";\n'
    'import { allowAnonymousAction, checkCredentialAttempt, getClientIp, hashClientIp, recordCredentialFailure, recordCredentialSuccess } from "../lib/share-credential-rate-limit.js";\n',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '  permission: NotebookPublicationPermission;\n  allowDownload:',
    '  permission: NotebookPublicationPermission;\n  credentialVersion: number;\n  allowDownload:',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    "      permission TEXT NOT NULL DEFAULT 'read'\n        CHECK(permission IN ('read', 'comment', 'write')),\n      allowDownload",
    "      permission TEXT NOT NULL DEFAULT 'read'\n        CHECK(permission IN ('read', 'comment', 'write')),\n      credentialVersion INTEGER NOT NULL DEFAULT 1,\n      allowDownload",
)
# Ensure old runtime-created table receives the new column even when migration ran before table creation.
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '  `);\n}\n\nfunction generatePublicationToken()',
    '''  `);\n  const publicationColumns = db.prepare("PRAGMA table_info(notebook_publications)").all() as { name: string }[];\n  if (!publicationColumns.some((column) => column.name === "credentialVersion")) {\n    db.prepare("ALTER TABLE notebook_publications ADD COLUMN credentialVersion INTEGER NOT NULL DEFAULT 1").run();\n  }\n}\n\nfunction generatePublicationToken()''',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '  return !!verifyShareAccessToken(auth.slice(7), row.id);',
    '  return !!verifyShareAccessToken(auth.slice(7), row.id, row.credentialVersion);',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '    const scope = createPublicationAttachmentScope(publication.id, noteId);',
    '    const scope = createPublicationAttachmentScope(publication.id, noteId, publication.allowDownload !== 0);',
)
replace_regex(
    "backend/src/runtime/notebook-publication.ts",
    r'''sharedRouter\.post\("/notebook-public/:token/verify", async \(c\) => \{.*?\n\}\);''',
    r'''sharedRouter.post("/notebook-public/:token/verify", async (c) => {
  noStore(c);
  const checked = validatePublication(publicationByToken(c.req.param("token")));
  if (!checked.ok) return c.json({ error: checked.error, code: checked.code }, checked.status);
  const p = checked.publication;
  const ipHash = hashClientIp(getClientIp(c));
  const rateKey = `publication:${p.id}:${ipHash}`;
  const rate = checkCredentialAttempt(rateKey);
  if (!rate.allowed) {
    c.header("Retry-After", String(rate.retryAfterSeconds));
    return c.json({ error: "验证尝试过于频繁，请稍后再试", code: "SHARE_CREDENTIAL_RATE_LIMIT" }, 429);
  }
  if (!requiresSecret(p)) {
    recordCredentialSuccess(rateKey);
    return c.json({ success: true, accessToken: signShareAccessToken({
      shareId: p.id, noteId: p.notebookId, credentialVersion: p.credentialVersion,
    }) });
  }
  const body = await c.req.json().catch(() => ({}));
  const secret = String(body.secret || "").trim();
  if (!secret) return c.json({ error: `请输入${p.accessMode === "code" ? "访问码" : "密码"}` }, 400);
  if (!p.accessSecret || !(await bcrypt.compare(secret, p.accessSecret))) {
    recordCredentialFailure(rateKey);
    logAudit("", "notebook_publication", "credential_failure", { publicationId: p.id, ipHash }, {
      targetType: "notebook_publication", targetId: p.id, ip: ipHash, level: "warn",
    });
    return c.json({ error: "访问凭证错误" }, 403);
  }
  recordCredentialSuccess(rateKey);
  return c.json({ success: true, accessToken: signShareAccessToken({
    shareId: p.id, noteId: p.notebookId, credentialVersion: p.credentialVersion,
  }) });
});''',
)
# Public comment endpoints: use unified share_comments with anti-spam and moderation-ready fields.
replace_regex(
    "backend/src/runtime/notebook-publication.ts",
    r'''sharedRouter\.get\("/notebook-public/:token/notes/:noteId/comments", \(c\) => \{.*?\n\}\);\n\nsharedRouter\.post\("/notebook-public/:token/notes/:noteId/comments", async \(c\) => \{.*?\n\}\);''',
    r'''sharedRouter.get("/notebook-public/:token/notes/:noteId/comments", (c) => {
  noStore(c);
  const checked = validatePublication(publicationByToken(c.req.param("token")));
  if (!checked.ok) return c.json({ error: checked.error, code: checked.code }, checked.status);
  const p = checked.publication;
  if (!verifyPublicationAccess(c, p)) return c.json({ error: "需要验证访问凭证" }, 401);
  if (!p.allowComment && p.permission === "read") return c.json({ error: "此发布未开放评论" }, 403);
  const noteId = c.req.param("noteId");
  if (!noteBelongsToPublication(p.id, noteId)) return c.json({ error: "笔记不存在或未发布" }, 404);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 50)));
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  const rows = getDb().prepare(`
    SELECT sc.id, sc.guestName AS nickname, sc.content, sc.isResolved, sc.createdAt
    FROM share_comments sc
    WHERE sc.sourceType = 'notebook_publication' AND sc.sourceId = ? AND sc.noteId = ? AND sc.isHidden = 0
    ORDER BY sc.createdAt ASC LIMIT ? OFFSET ?
  `).all(p.id, noteId, limit, offset);
  return c.json(rows);
});

sharedRouter.post("/notebook-public/:token/notes/:noteId/comments", async (c) => {
  noStore(c);
  const checked = validatePublication(publicationByToken(c.req.param("token")));
  if (!checked.ok) return c.json({ error: checked.error, code: checked.code }, checked.status);
  const p = checked.publication;
  if (!verifyPublicationAccess(c, p)) return c.json({ error: "需要验证访问凭证" }, 401);
  if (!p.allowComment && p.permission === "read") {
    return c.json({ error: "此发布未开放评论", code: "PUBLIC_COMMENT_FORBIDDEN" }, 403);
  }
  const noteId = c.req.param("noteId");
  if (!noteBelongsToPublication(p.id, noteId)) return c.json({ error: "笔记不存在或未发布" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (String(body._hp || "").trim()) return c.json({ ok: true, suppressed: true });
  const nickname = String(body.nickname || "").trim();
  const content = String(body.content || "").trim();
  if (!nickname || nickname.length > NICKNAME_MAX_LENGTH) {
    return c.json({ error: `昵称长度需为 1-${NICKNAME_MAX_LENGTH} 个字符` }, 400);
  }
  if (!content || content.length > 1000) return c.json({ error: "评论长度需为 1-1000 个字符" }, 400);
  const ipHash = hashClientIp(getClientIp(c));
  if (!allowAnonymousAction("publication-comment", `${p.id}:${noteId}:${ipHash}`, 20, 60_000)) {
    return c.json({ error: "评论过于频繁，请稍后再试" }, 429);
  }
  const id = uuid();
  getDb().prepare(`
    INSERT INTO share_comments (
      id, noteId, userId, guestName, guestIpHash, content,
      sourceType, sourceId, isHidden, isResolved
    ) VALUES (?, ?, NULL, ?, ?, ?, 'notebook_publication', ?, 0, 0)
  `).run(id, noteId, nickname, ipHash, content, p.id);
  return c.json({ id, nickname, content, isResolved: 0, createdAt: new Date().toISOString() }, 201);
});''',
)
# Publication join: versioned token, source-aware member record and capability flags.
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '    if (!verifyShareAccessToken(accessToken, p.id)) {',
    '    if (!verifyShareAccessToken(accessToken, p.id, p.credentialVersion)) {',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '''    role,\n    invitedBy: p.ownerId,\n  });''',
    '''    role,\n    invitedBy: p.ownerId,\n    allowDownload: !!p.allowDownload,\n    allowReshare: !!p.allowReshare,\n    source: "publication",\n    sourceId: p.id,\n  });''',
)
# Publication update: bump credential version when secret changes and downgrade source members on permission reduction.
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '  let accessSecret = existing?.accessSecret || null;\n',
    '  let accessSecret = existing?.accessSecret || null;\n  let credentialChanged = false;\n',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '    if (secret) accessSecret = await bcrypt.hash(secret, 10);',
    '    if (secret) { accessSecret = await bcrypt.hash(secret, 10); credentialChanged = true; }',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '  } else {\n    accessSecret = null;\n  }',
    '  } else {\n    if (accessSecret) credentialChanged = true;\n    accessSecret = null;\n  }',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '      ownerId = excluded.ownerId,\n      token = excluded.token,',
    '      ownerId = excluded.ownerId,\n      token = excluded.token,\n      credentialVersion = CASE WHEN ? = 1 THEN notebook_publications.credentialVersion + 1 ELSE notebook_publications.credentialVersion END,',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '    id, notebookId, access.userId, token, accessMode, accessSecret, permission,\n    allowDownload, allowComment, allowEdit, allowReshare, expiresAt,\n  );',
    '    id, notebookId, access.userId, token, accessMode, accessSecret, permission,\n    allowDownload, allowComment, allowEdit, allowReshare, expiresAt, credentialChanged ? 1 : 0,\n  );',
)
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '  const updated = getDb().prepare("SELECT * FROM notebook_publications WHERE notebookId = ?")\n',
    '  if (existing) {\n'
    '    notebookMembersRepository.restrictBySource("publication", existing.id, {\n'
    '      role: permission === "write" && allowEdit ? "editor" : "viewer",\n'
    '      allowDownload: !!allowDownload,\n'
    '      allowReshare: !!allowReshare,\n'
    '    });\n'
    '  }\n\n'
    '  const updated = getDb().prepare("SELECT * FROM notebook_publications WHERE notebookId = ?")\n',
)
# Revoke removes only publication-sourced members so stale editors cannot survive.
replace_once(
    "backend/src/runtime/notebook-publication.ts",
    '  logAudit(access.userId, "notebook_publication", "revoke", { notebookId }, { targetType: "notebook", targetId: notebookId });\n  return c.json({ success: true, revoked: result.changes > 0 });',
    '  const publication = getDb().prepare("SELECT id FROM notebook_publications WHERE notebookId = ?").get(notebookId) as { id: string } | undefined;\n'
    '  const removedMembers = publication ? notebookMembersRepository.removeBySource("publication", publication.id) : 0;\n'
    '  logAudit(access.userId, "notebook_publication", "revoke", { notebookId, removedMembers }, { targetType: "notebook", targetId: notebookId });\n'
    '  return c.json({ success: true, revoked: result.changes > 0, removedMembers });',
)

# Add authenticated moderation endpoints for public knowledge-base comments.
insert_before(
    "backend/src/runtime/notebook-publication.ts",
    '\nnotebooksRouter.get("/:id/permission-overrides",',
    r'''
notebooksRouter.patch("/:id/publication/comments/:commentId", async (c) => {
  const notebookId = c.req.param("id");
  const access = requireManageNotebook(c, notebookId);
  if (!access.ok) return access.response;
  const publication = getDb().prepare("SELECT id FROM notebook_publications WHERE notebookId = ?")
    .get(notebookId) as { id: string } | undefined;
  if (!publication) return c.json({ error: "发布不存在" }, 404);
  const commentId = c.req.param("commentId");
  const comment = getDb().prepare(`
    SELECT id, isResolved, isHidden FROM share_comments
    WHERE id = ? AND sourceType = 'notebook_publication' AND sourceId = ?
  `).get(commentId, publication.id) as { id: string; isResolved: number; isHidden: number } | undefined;
  if (!comment) return c.json({ error: "评论不存在" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const resolved = body.isResolved === undefined ? comment.isResolved : body.isResolved ? 1 : 0;
  const hidden = body.isHidden === undefined ? comment.isHidden : body.isHidden ? 1 : 0;
  getDb().prepare("UPDATE share_comments SET isResolved = ?, isHidden = ?, updatedAt = datetime('now') WHERE id = ?")
    .run(resolved, hidden, commentId);
  return c.json({ success: true, id: commentId, isResolved: resolved, isHidden: hidden });
});

notebooksRouter.delete("/:id/publication/comments/:commentId", (c) => {
  const notebookId = c.req.param("id");
  const access = requireManageNotebook(c, notebookId);
  if (!access.ok) return access.response;
  const publication = getDb().prepare("SELECT id FROM notebook_publications WHERE notebookId = ?")
    .get(notebookId) as { id: string } | undefined;
  if (!publication) return c.json({ error: "发布不存在" }, 404);
  const result = getDb().prepare(`
    DELETE FROM share_comments
    WHERE id = ? AND sourceType = 'notebook_publication' AND sourceId = ?
  `).run(c.req.param("commentId"), publication.id);
  if (!result.changes) return c.json({ error: "评论不存在" }, 404);
  return c.json({ success: true });
});
''',
)

# Tests: migration/capability/session/token/rate limit regressions.
write(
    "backend/tests/share-security-capabilities.test.ts",
    r'''import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nowen-share-security-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.ELECTRON_USER_DATA = tmpDir;
process.env.JWT_SECRET = "test-share-security-secret-308";

let closeDb: () => void;

test.after(() => {
  closeDb?.();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("capabilities preserve read while enforcing download and reshare flags", async () => {
  const [{ getDb, closeDb: close }, { resolveEffectiveNoteCapabilities }] = await Promise.all([
    import("../src/db/schema"),
    import("../src/services/share-capabilities"),
  ]);
  closeDb = close;
  const db = getDb();
  db.prepare("INSERT INTO users (id, username, passwordHash) VALUES (?, ?, ?)").run("owner", "owner", "hash");
  db.prepare("INSERT INTO users (id, username, passwordHash) VALUES (?, ?, ?)").run("viewer", "viewer", "hash");
  db.prepare("INSERT INTO notebooks (id, userId, name) VALUES (?, ?, ?)").run("nb", "owner", "Notebook");
  db.prepare("INSERT INTO notes (id, userId, notebookId, title, content, contentText) VALUES (?, ?, ?, ?, '{}', '')")
    .run("note", "owner", "nb", "Note");
  db.prepare(`INSERT INTO notebook_members
    (id, notebookId, userId, role, status, allowDownload, allowReshare, source)
    VALUES (?, ?, ?, 'viewer', 'active', 0, 1, 'manual')`)
    .run("member", "nb", "viewer");

  const capabilities = resolveEffectiveNoteCapabilities("note", "viewer");
  assert.equal(capabilities.read, true);
  assert.equal(capabilities.write, false);
  assert.equal(capabilities.download, false);
  assert.equal(capabilities.reshare, true);
});

test("share access token credential version invalidates old tokens", async () => {
  const { signShareAccessToken, verifyShareAccessToken } = await import("../src/lib/auth-security");
  const token = signShareAccessToken({ shareId: "share", noteId: "note", credentialVersion: 2 });
  assert.ok(verifyShareAccessToken(token, "share", 2));
  assert.equal(verifyShareAccessToken(token, "share", 3), null);
});

test("single share counts unique sessions and permits an existing session after the limit", async () => {
  const [{ getDb }, access] = await Promise.all([
    import("../src/db/schema"),
    import("../src/services/single-share-access"),
  ]);
  const db = getDb();
  db.prepare(`INSERT INTO shares
    (id, noteId, ownerId, shareToken, permission, maxViews, viewCount, credentialVersion)
    VALUES ('share-session', 'note', 'owner', 'session-token', 'view', 1, 0, 1)`)
    .run();

  const app = new Hono();
  app.get("/count", (c) => {
    const share = access.findSingleShareByToken("session-token")!;
    const auth = access.authorizeSingleShareRequest(c, share);
    if (!auth.ok) return c.json(auth.payload, auth.status);
    return c.json(access.consumeShareViewSession(c, share));
  });

  const first = await app.request("/count", { headers: { "X-Share-Session": "session-one" } });
  assert.equal(first.status, 200);
  assert.equal((await first.json() as any).counted, true);
  const refresh = await app.request("/count", { headers: { "X-Share-Session": "session-one" } });
  assert.equal(refresh.status, 200);
  assert.equal((await refresh.json() as any).counted, false);
  const second = await app.request("/count", { headers: { "X-Share-Session": "session-two" } });
  assert.equal(second.status, 410);
});

test("credential limiter blocks repeated failures and can be reset", async () => {
  const limiter = await import("../src/lib/share-credential-rate-limit");
  limiter.resetShareRateLimitsForTests();
  for (let i = 0; i < 8; i += 1) limiter.recordCredentialFailure("same-key");
  assert.equal(limiter.checkCredentialAttempt("same-key").allowed, false);
  limiter.recordCredentialSuccess("same-key");
  assert.equal(limiter.checkCredentialAttempt("same-key").allowed, true);
});
''',
)

print("Issue #308 backend patch applied")
