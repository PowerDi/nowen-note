import { useEffect, useMemo, useState } from "react";
import {
  Globe2,
  KeyRound,
  Link2,
  LockKeyhole,
  ShieldCheck,
  Trash2,
  Unlink,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/ui/confirm";
import type { Notebook, NotebookMember, NotebookShareLink, UserPublicInfo } from "@/types";
import {
  notebookPublicationApi,
  type NotebookDirectoryPermission,
  type NotebookPermissionOverride,
  type NotebookPublication,
  type NotebookPublicationAccessMode,
  type NotebookPublicationPermission,
} from "@/lib/notebookPublicationApi";
import { cn } from "@/lib/utils";

interface NotebookShareDialogProps {
  notebook: Notebook;
  onClose: () => void;
}

type Tab = "members" | "publish" | "permissions";

function bool(value: number | boolean | undefined): boolean {
  return value === true || value === 1;
}

function permissionLabel(permission: NotebookDirectoryPermission): string {
  return {
    none: "不可见",
    read: "可查看",
    comment: "可评论",
    write: "可编辑",
    manage: "可管理",
  }[permission];
}

export default function NotebookShareDialog({ notebook, onClose }: NotebookShareDialogProps) {
  const [tab, setTab] = useState<Tab>("members");
  const [members, setMembers] = useState<NotebookMember[]>([]);
  const [link, setLink] = useState<NotebookShareLink | null>(null);
  const [publication, setPublication] = useState<NotebookPublication | null>(null);
  const [overrides, setOverrides] = useState<NotebookPermissionOverride[]>([]);
  const [inheritsFromParent, setInheritsFromParent] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<UserPublicInfo[]>([]);
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [accessMode, setAccessMode] = useState<NotebookPublicationAccessMode>("link");
  const [publicPermission, setPublicPermission] = useState<NotebookPublicationPermission>("read");
  const [publicSecret, setPublicSecret] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowComment, setAllowComment] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const [allowReshare, setAllowReshare] = useState(false);

  const [aclQuery, setAclQuery] = useState("");
  const [aclCandidates, setAclCandidates] = useState<UserPublicInfo[]>([]);
  const [aclPermission, setAclPermission] = useState<NotebookDirectoryPermission>("read");
  const [aclAllowDownload, setAclAllowDownload] = useState(true);
  const [aclAllowReshare, setAclAllowReshare] = useState(false);

  const shareUrl = useMemo(() => {
    if (!link?.token) return "";
    return `${window.location.origin}/notebook-share/${link.token}`;
  }, [link?.token]);

  const publicationUrl = useMemo(() => {
    if (!publication?.token || !bool(publication.isActive)) return "";
    return `${window.location.origin}/public/${publication.token}`;
  }, [publication?.token, publication?.isActive]);

  const applyPublication = (value: NotebookPublication | null) => {
    setPublication(value);
    if (!value) return;
    setAccessMode(value.accessMode);
    setPublicPermission(value.permission);
    setExpiresAt(value.expiresAt ? String(value.expiresAt).slice(0, 16) : "");
    setAllowDownload(bool(value.allowDownload));
    setAllowComment(bool(value.allowComment));
    setAllowEdit(bool(value.allowEdit));
    setAllowReshare(bool(value.allowReshare));
    setPublicSecret("");
  };

  const reload = async () => {
    const [nextMembers, nextLink, nextPublication, nextOverrides] = await Promise.all([
      api.getNotebookMembers(notebook.id),
      api.getNotebookShareLink(notebook.id),
      notebookPublicationApi.getPublication(notebook.id),
      notebookPublicationApi.getPermissionOverrides(notebook.id),
    ]);
    setMembers(nextMembers);
    setLink(nextLink);
    applyPublication(nextPublication);
    setOverrides(nextOverrides.direct);
    setInheritsFromParent(nextOverrides.inheritsFromParent);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload()
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || "加载分享设置失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [notebook.id]);

  const search = async () => {
    if (!query.trim()) return;
    const rows = await api.searchUsers(query.trim());
    setCandidates(rows.filter((user) => !members.some((member) => member.userId === user.id)));
  };

  const searchAclUsers = async () => {
    if (!aclQuery.trim()) return;
    const rows = await api.searchUsers(aclQuery.trim());
    setAclCandidates(rows.filter((user) => !overrides.some((entry) => entry.userId === user.id)));
  };

  const addMember = async (userId: string) => {
    await api.addNotebookMember(notebook.id, { userId, role });
    toast.success("已添加成员；权限会自动继承到子目录");
    setQuery("");
    setCandidates([]);
    await reload();
  };

  const removeMember = async (userId: string) => {
    await api.removeNotebookMember(notebook.id, userId);
    toast.success("已移除成员");
    await reload();
  };

  const createLink = async () => {
    const next = await api.createNotebookShareLink(notebook.id, { role });
    setLink(next);
    toast.success("登录邀请链接已生成");
  };

  const copyText = async (value: string, label = "链接") => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success(`${label}已复制`);
  };

  const revokeLink = async () => {
    const ok = await confirm({
      title: "撤销登录邀请链接？",
      description: "撤销后旧链接立即失效，已经加入的成员不受影响。",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteNotebookShareLink(notebook.id);
      setLink(null);
      toast.success("登录邀请链接已撤销");
    } catch (err: any) {
      toast.error(err?.message || "撤销失败");
    }
  };

  const savePublication = async () => {
    if ((accessMode === "code" || accessMode === "password") && !publication?.hasSecret && !publicSecret.trim()) {
      toast.error(`请设置${accessMode === "code" ? "访问码" : "密码"}`);
      return;
    }
    setSaving(true);
    try {
      const next = await notebookPublicationApi.savePublication(notebook.id, {
        accessMode,
        permission: publicPermission,
        secret: publicSecret.trim() || undefined,
        allowDownload,
        allowComment,
        allowEdit,
        allowReshare,
        expiresAt: expiresAt || null,
      });
      applyPublication(next);
      toast.success(accessMode === "public" ? "已发布到公共空间" : "公开访问设置已保存");
    } catch (err: any) {
      toast.error(err?.message || "发布失败");
    } finally {
      setSaving(false);
    }
  };

  const revokePublication = async () => {
    const ok = await confirm({
      title: "撤销目录发布？",
      description: "撤销后旧链接、正文和附件签名会立即失效；重新发布时会生成新链接。",
      danger: true,
    });
    if (!ok) return;
    try {
      await notebookPublicationApi.revokePublication(notebook.id);
      setPublication((current) => current ? { ...current, isActive: 0 } : current);
      toast.success("目录发布已撤销");
    } catch (err: any) {
      toast.error(err?.message || "撤销失败");
    }
  };

  const addOverride = async (userId: string) => {
    try {
      await notebookPublicationApi.setPermissionOverride(notebook.id, userId, {
        permission: aclPermission,
        allowDownload: aclAllowDownload,
        allowReshare: aclAllowReshare,
      });
      setAclQuery("");
      setAclCandidates([]);
      toast.success("目录权限覆盖已保存");
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "权限设置失败");
    }
  };

  const updateOverride = async (entry: NotebookPermissionOverride, permission: NotebookDirectoryPermission) => {
    try {
      await notebookPublicationApi.setPermissionOverride(notebook.id, entry.userId, {
        permission,
        allowDownload: bool(entry.allowDownload),
        allowReshare: bool(entry.allowReshare),
      });
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "权限更新失败");
    }
  };

  const removeOverride = async (userId: string) => {
    try {
      await notebookPublicationApi.removePermissionOverride(notebook.id, userId);
      toast.success("已恢复继承父目录权限");
      await reload();
    } catch (err: any) {
      toast.error(err?.message || "恢复继承失败");
    }
  };

  const tabItems: Array<{ id: Tab; label: string; icon: typeof Users }> = [
    { id: "members", label: "账号成员", icon: Users },
    { id: "publish", label: "公开发布", icon: Globe2 },
    { id: "permissions", label: "目录权限", icon: UserRoundCog },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-3 py-5 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">分享与发布</div>
            <div className="truncate text-xs text-tx-tertiary">{notebook.icon} {notebook.name} · 包含当前目录及全部子目录</div>
          </div>
          <button className="rounded-lg p-1.5 hover:bg-app-hover" onClick={onClose} aria-label="关闭"><X size={17} /></button>
        </div>

        <div className="flex gap-1 border-b border-app-border bg-app-hover/30 px-4 py-2">
          {tabItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                  tab === item.id ? "bg-app-surface text-accent-primary shadow-sm" : "text-tx-secondary hover:bg-app-surface/70 hover:text-tx-primary",
                )}
              >
                <Icon size={14} />{item.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-16 text-center text-sm text-tx-tertiary">正在加载分享设置...</div>
          ) : tab === "members" ? (
            <div className="space-y-5">
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <div><h3 className="text-sm font-semibold">指定账号</h3><p className="mt-0.5 text-xs text-tx-tertiary">成员权限自动继承到全部子目录。</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <select className="h-9 rounded-lg border border-app-border bg-app-bg px-2 text-sm" value={role} onChange={(event) => setRole(event.target.value as "viewer" | "editor")}>
                    <option value="viewer">只读</option>
                    <option value="editor">可编辑</option>
                  </select>
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名或邮箱" className="h-9" onKeyDown={(event) => { if (event.key === "Enter") void search(); }} />
                  <Button variant="outline" onClick={search}>搜索</Button>
                </div>
                {candidates.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-app-border">
                    {candidates.map((user) => (
                      <button key={user.id} className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-app-hover" onClick={() => addMember(user.id)}>
                        <span>{user.displayName || user.username}</span><span className="text-xs text-tx-tertiary">添加</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 text-xs font-medium text-tx-tertiary">当前成员</div>
                <div className="divide-y divide-app-border overflow-hidden rounded-xl border border-app-border">
                  {members.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-tx-tertiary">暂无指定成员</div>
                  ) : members.map((member) => (
                    <div key={member.userId} className="flex items-center justify-between px-3 py-2.5 text-sm">
                      <div className="min-w-0"><div className="truncate">{member.displayName || member.username || member.userId}</div><div className="text-xs text-tx-tertiary">{member.role === "owner" ? "拥有者" : member.role === "editor" ? "可编辑" : "只读"}</div></div>
                      {member.role !== "owner" && <button className="rounded-md p-1.5 text-tx-tertiary hover:bg-app-hover hover:text-red-500" onClick={() => removeMember(member.userId)} aria-label="移除成员"><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-app-border bg-app-hover/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="text-sm font-medium">登录邀请链接</div><div className="truncate text-xs text-tx-tertiary">{shareUrl || "访问者登录后加入，适合团队内部协作"}</div></div>
                  {shareUrl ? (
                    <div className="flex shrink-0 gap-1.5"><Button variant="outline" onClick={() => copyText(shareUrl)}>复制</Button><Button variant="outline" onClick={revokeLink} className="text-red-500 hover:text-red-600"><Unlink size={14} /></Button></div>
                  ) : (
                    <Button variant="outline" onClick={createLink}><Link2 size={14} className="mr-1" />生成</Button>
                  )}
                </div>
              </section>
            </div>
          ) : tab === "publish" ? (
            <div className="space-y-5">
              <section className="rounded-xl border border-app-border bg-gradient-to-br from-accent-primary/5 to-transparent p-4">
                <div className="flex items-start gap-3"><div className="rounded-xl bg-accent-primary/10 p-2 text-accent-primary"><Globe2 size={18} /></div><div><h3 className="text-sm font-semibold">将目录发布为轻量知识站</h3><p className="mt-1 text-xs leading-5 text-tx-tertiary">公开页面包含左侧目录、正文和右侧大纲。回收站、锁定笔记和未发布目录不会展示。</p></div></div>
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5"><span className="text-xs font-medium text-tx-secondary">访问方式</span><select className="h-10 w-full rounded-lg border border-app-border bg-app-bg px-3 text-sm" value={accessMode} onChange={(event) => setAccessMode(event.target.value as NotebookPublicationAccessMode)}><option value="public">公开发布 · 展示在公共空间</option><option value="link">持链接访问 · 不公开列出</option><option value="code">游客 + 访问码</option><option value="password">密码保护</option></select></label>
                <label className="space-y-1.5"><span className="text-xs font-medium text-tx-secondary">基础权限</span><select className="h-10 w-full rounded-lg border border-app-border bg-app-bg px-3 text-sm" value={publicPermission} onChange={(event) => { const next = event.target.value as NotebookPublicationPermission; setPublicPermission(next); if (next === "read") { setAllowComment(false); setAllowEdit(false); } if (next === "comment") setAllowComment(true); }}><option value="read">查看</option><option value="comment">查看 + 评论</option><option value="write">登录后加入编辑</option></select></label>
              </div>

              {(accessMode === "code" || accessMode === "password") && (
                <label className="block space-y-1.5"><span className="flex items-center gap-1.5 text-xs font-medium text-tx-secondary">{accessMode === "code" ? <KeyRound size={13} /> : <LockKeyhole size={13} />}{accessMode === "code" ? "访问码" : "访问密码"}</span><Input type={accessMode === "password" ? "password" : "text"} value={publicSecret} onChange={(event) => setPublicSecret(event.target.value)} placeholder={publication?.hasSecret ? "留空保持原凭证，输入内容则更新" : accessMode === "code" ? "设置游客访问码" : "设置访问密码"} /></label>
              )}

              <label className="block space-y-1.5"><span className="text-xs font-medium text-tx-secondary">有效期（可选）</span><Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>

              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle checked={allowDownload} onChange={setAllowDownload} title="允许附件下载" description="正文图片仍可展示；关闭后公共页面不提供下载入口。" />
                <Toggle checked={allowComment} onChange={setAllowComment} disabled={publicPermission === "read"} title="允许游客评论" description="评论要求填写昵称并记录时间。" />
                <Toggle checked={allowEdit} onChange={setAllowEdit} disabled={publicPermission !== "write"} title="登录后加入编辑" description="用户登录后加入为目录编辑成员。" />
                <Toggle checked={allowReshare} onChange={setAllowReshare} title="允许二次分享" description="作为权限元数据展示，管理入口仍由目录管理员控制。" />
              </div>

              {publicationUrl && (
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-300"><ShieldCheck size={15} />发布生效</div>
                  <div className="mt-2 flex items-center gap-2"><Input readOnly value={publicationUrl} className="h-9 text-xs" /><Button variant="outline" onClick={() => copyText(publicationUrl, "公开链接")}>复制</Button></div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-app-border pt-4">
                {publication && bool(publication.isActive) && <Button variant="outline" className="text-red-500 hover:text-red-600" onClick={revokePublication}><Unlink size={14} className="mr-1" />撤销发布</Button>}
                <Button onClick={savePublication} disabled={saving}>{saving ? "保存中..." : publicationUrl ? "保存发布设置" : "发布目录"}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-xl border border-app-border bg-app-hover/20 p-4">
                <h3 className="text-sm font-semibold">目录级权限继承</h3>
                <p className="mt-1 text-xs leading-5 text-tx-tertiary">当前目录默认继承父目录权限；这里添加的规则会覆盖继承结果，并继续向子目录传递。子目录可再次覆盖。{inheritsFromParent ? " 当前目录存在父级，可随时删除覆盖恢复继承。" : " 当前目录是权限树根节点。"}</p>
              </section>

              <section>
                <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                  <select className="h-9 rounded-lg border border-app-border bg-app-bg px-2 text-sm" value={aclPermission} onChange={(event) => setAclPermission(event.target.value as NotebookDirectoryPermission)}><option value="none">不可见</option><option value="read">可查看</option><option value="comment">可评论</option><option value="write">可编辑</option><option value="manage">可管理</option></select>
                  <Input value={aclQuery} onChange={(event) => setAclQuery(event.target.value)} placeholder="搜索要设置覆盖权限的用户" className="h-9" onKeyDown={(event) => { if (event.key === "Enter") void searchAclUsers(); }} />
                  <Button variant="outline" onClick={searchAclUsers}>搜索</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-tx-secondary"><label className="flex items-center gap-2"><input type="checkbox" checked={aclAllowDownload} onChange={(event) => setAclAllowDownload(event.target.checked)} />允许下载附件</label><label className="flex items-center gap-2"><input type="checkbox" checked={aclAllowReshare} onChange={(event) => setAclAllowReshare(event.target.checked)} />允许二次分享</label></div>
                {aclCandidates.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-app-border">
                    {aclCandidates.map((user) => <button key={user.id} className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-app-hover" onClick={() => addOverride(user.id)}><span>{user.displayName || user.username}</span><span className="text-xs text-tx-tertiary">设为{permissionLabel(aclPermission)}</span></button>)}
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 text-xs font-medium text-tx-tertiary">当前目录的显式覆盖</div>
                <div className="divide-y divide-app-border overflow-hidden rounded-xl border border-app-border">
                  {overrides.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-tx-tertiary">没有覆盖规则，当前目录完全继承父级权限</div>
                  ) : overrides.map((entry) => (
                    <div key={entry.userId} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap">
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{entry.displayName || entry.username}</div><div className="text-[11px] text-tx-tertiary">{bool(entry.allowDownload) ? "可下载" : "不可下载"} · {bool(entry.allowReshare) ? "可二次分享" : "不可二次分享"}</div></div>
                      <select className="h-8 rounded-md border border-app-border bg-app-bg px-2 text-xs" value={entry.permission} onChange={(event) => updateOverride(entry, event.target.value as NotebookDirectoryPermission)}><option value="none">不可见</option><option value="read">可查看</option><option value="comment">可评论</option><option value="write">可编辑</option><option value="manage">可管理</option></select>
                      <button className="rounded-md p-1.5 text-tx-tertiary hover:bg-app-hover hover:text-red-500" onClick={() => removeOverride(entry.userId)} title="删除覆盖并恢复继承"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, title, description, disabled }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-app-border p-3", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" />
      <span><span className="block text-xs font-medium text-tx-primary">{title}</span><span className="mt-0.5 block text-[11px] leading-4 text-tx-tertiary">{description}</span></span>
    </label>
  );
}
