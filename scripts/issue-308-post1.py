from pathlib import Path

root = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = root / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, got {count}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


repo = "backend/src/repositories/shareCommentsRepository.ts"
replace_once(
    repo,
    'getById(commentId: string): { id: string; userId: string | null } | undefined {',
    'getById(commentId: string): { id: string; noteId: string; userId: string | null } | undefined {',
)
replace_once(
    repo,
    '.prepare("SELECT id, \\"userId\\" FROM share_comments WHERE id = ?")\n      .get(commentId) as { id: string; userId: string | null } | undefined;',
    '.prepare("SELECT id, \\"noteId\\", \\"userId\\" FROM share_comments WHERE id = ?")\n      .get(commentId) as { id: string; noteId: string; userId: string | null } | undefined;',
)
replace_once(
    repo,
    'getResolved(commentId: string): { isResolved: number } | undefined {',
    'getResolved(commentId: string): { noteId: string; isResolved: number } | undefined {',
)
replace_once(
    repo,
    '.prepare("SELECT \\"isResolved\\" FROM share_comments WHERE id = ?")\n      .get(commentId) as { isResolved: number } | undefined;',
    '.prepare("SELECT \\"noteId\\", \\"isResolved\\" FROM share_comments WHERE id = ?")\n      .get(commentId) as { noteId: string; isResolved: number } | undefined;',
)
replace_once(
    repo,
    'async getByIdAsync(commentId: string): Promise<{ id: string; userId: string | null } | undefined> {\n    return getAdapter().queryOne<{ id: string; userId: string | null }>(\n      "SELECT id, \\"userId\\" FROM share_comments WHERE id = ?",',
    'async getByIdAsync(commentId: string): Promise<{ id: string; noteId: string; userId: string | null } | undefined> {\n    return getAdapter().queryOne<{ id: string; noteId: string; userId: string | null }>(\n      "SELECT id, \\"noteId\\", \\"userId\\" FROM share_comments WHERE id = ?",',
)
replace_once(
    repo,
    'async getResolvedAsync(commentId: string): Promise<{ isResolved: number } | undefined> {\n    return getAdapter().queryOne<{ isResolved: number }>(\n      "SELECT \\"isResolved\\" FROM share_comments WHERE id = ?",',
    'async getResolvedAsync(commentId: string): Promise<{ noteId: string; isResolved: number } | undefined> {\n    return getAdapter().queryOne<{ noteId: string; isResolved: number }>(\n      "SELECT \\"noteId\\", \\"isResolved\\" FROM share_comments WHERE id = ?",',
)

replace_once(
    "backend/src/routes/wechat-favorites-import.ts",
    "  return await new Promise((resolve, reject) => {",
    "  return await new Promise<{ tmpDir: string; tmpPath: string; filename: string; fields: Record<string, string> }>((resolve, reject) => {",
)

print("Issue #308 validation type surfaces fixed")
