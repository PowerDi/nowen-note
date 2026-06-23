import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, Copy, RefreshCw, Trash2, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { api, getBaseUrl } from "@/lib/api";
import { toast } from "@/lib/toast";

interface CalendarFeed {
  id: string;
  token: string;
  enabled: boolean;
  includeCompleted: boolean;
  includeDescription: boolean;
  defaultAlarmMinutes: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CALENDAR_FEED_TEXT = {
  zh: {
    title: "日历订阅",
    loading: "加载中...",
    enable: "启用日历订阅",
    created: "日历订阅已启用",
    updated: "设置已更新",
    error: "操作失败，请重试",
    description: "将待办导出为系统日历订阅链接，可在 iPhone、Android 或第三方日历中订阅。手机提醒由系统日历负责，不依赖 Nowen Note 后台运行。",
    active: "已启用",
    disabled: "已禁用",
    lastAccess: "最近访问",
    link: "订阅链接",
    copied: "链接已复制",
    includeCompleted: "导出已完成待办",
    includeDescription: "导出描述内容",
    defaultAlarm: "默认提醒时间",
    rotate: "重置链接",
    disable: "禁用订阅",
    confirmRotate: "重置订阅链接后，旧链接会立即失效。确定继续吗？",
    confirmDisable: "禁用后，手机日历将无法继续同步这个订阅。确定继续吗？",
    rotated: "订阅链接已重置",
    hint: "日历订阅不是实时推送，刷新频率取决于手机系统或日历 App。",
    alarm0: "准时提醒",
    alarm5: "提前 5 分钟",
    alarm10: "提前 10 分钟",
    alarm30: "提前 30 分钟",
    alarm60: "提前 1 小时",
    alarm1440: "提前 1 天",
  },
  en: {
    title: "Calendar Subscription",
    loading: "Loading...",
    enable: "Enable Calendar Subscription",
    created: "Calendar subscription enabled",
    updated: "Settings updated",
    error: "Operation failed, please try again",
    description: "Export tasks as a system calendar subscription link for iPhone, Android, or third-party calendar apps. Reminders are handled by the system calendar and do not depend on Nowen Note running in the background.",
    active: "Active",
    disabled: "Disabled",
    lastAccess: "Last accessed",
    link: "Subscription link",
    copied: "Link copied",
    includeCompleted: "Export completed tasks",
    includeDescription: "Export descriptions",
    defaultAlarm: "Default reminder time",
    rotate: "Reset link",
    disable: "Disable subscription",
    confirmRotate: "Resetting the subscription link will immediately invalidate the old one. Continue?",
    confirmDisable: "Disabling this subscription will stop calendar sync on subscribed devices. Continue?",
    rotated: "Subscription link reset",
    hint: "Calendar subscription is not real-time. Refresh frequency depends on your device or calendar app.",
    alarm0: "At due time",
    alarm5: "5 minutes before",
    alarm10: "10 minutes before",
    alarm30: "30 minutes before",
    alarm60: "1 hour before",
    alarm1440: "1 day before",
  },
} as const;

function getCalendarFeedText(language: string | undefined) {
  return language?.toLowerCase().startsWith("zh")
    ? CALENDAR_FEED_TEXT.zh
    : CALENDAR_FEED_TEXT.en;
}

export function TaskCalendarFeedSettings() {
  const { i18n } = useTranslation();
  const text = useMemo(() => getCalendarFeedText(i18n.language), [i18n.language]);
  const alarmOptions = useMemo(() => [
    { value: 0, label: text.alarm0 },
    { value: 5, label: text.alarm5 },
    { value: 10, label: text.alarm10 },
    { value: 30, label: text.alarm30 },
    { value: 60, label: text.alarm60 },
    { value: 1440, label: text.alarm1440 },
  ], [text]);

  const [feed, setFeed] = useState<CalendarFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadFeed = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.taskCalendarFeed.get();
      setFeed(res.feed);
    } catch {
      // 日历订阅入口是增强能力，加载失败时静默降级，不阻塞待办主流程。
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  // Esc 关闭弹窗
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const handleCreate = useCallback(async () => {
    try {
      setActionLoading("create");
      const res = await api.taskCalendarFeed.create();
      setFeed(res.feed);
      toast.success(text.created);
    } catch {
      toast.error(text.error);
    } finally {
      setActionLoading(null);
    }
  }, [text]);

  const handleUpdate = useCallback(async (data: Partial<CalendarFeed>) => {
    try {
      setActionLoading("update");
      const res = await api.taskCalendarFeed.update(data);
      setFeed(res.feed);
      toast.success(text.updated);
    } catch {
      toast.error(text.error);
    } finally {
      setActionLoading(null);
    }
  }, [text]);

  const handleDisable = useCallback(async () => {
    if (!window.confirm(text.confirmDisable)) return;
    try {
      setActionLoading("disable");
      await handleUpdate({ enabled: false });
    } finally {
      setActionLoading(null);
    }
  }, [handleUpdate, text]);

  const handleRotate = useCallback(async () => {
    if (!window.confirm(text.confirmRotate)) return;
    try {
      setActionLoading("rotate");
      await api.taskCalendarFeed.rotateToken();
      await loadFeed();
      toast.success(text.rotated);
    } catch {
      toast.error(text.error);
    } finally {
      setActionLoading(null);
    }
  }, [loadFeed, text]);

  const handleCopy = useCallback(async () => {
    if (!feed?.token) return;
    const baseUrl = getBaseUrl().replace(/\/api$/, "");
    const url = `${baseUrl}/api/task-calendar/feed/${feed.token}.ics`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(text.copied);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success(text.copied);
    }
  }, [feed?.token, text]);

  const icsUrl = feed?.token
    ? `${getBaseUrl().replace(/\/api$/, "")}/api/task-calendar/feed/${feed.token}.ics`
    : "";

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="flex items-center gap-1 px-2 py-1 text-xs text-tx-tertiary rounded-md"
      >
        <Loader2 size={13} className="animate-spin" />
        {text.loading}
      </button>
    );
  }

  // 未启用状态：显示启用按钮
  if (!feed) {
    return (
      <button
        type="button"
        onClick={handleCreate}
        disabled={actionLoading === "create"}
        className="flex items-center gap-1 px-2 py-1 text-xs text-tx-tertiary hover:text-accent-primary rounded-md hover:bg-accent-primary/5 transition-colors"
      >
        {actionLoading === "create" ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Calendar size={13} />
        )}
        {text.enable}
      </button>
    );
  }

  // 已启用状态：入口按钮 + fixed modal
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors",
          expanded
            ? "text-accent-primary bg-accent-primary/10"
            : feed.enabled
              ? "text-accent-primary bg-accent-primary/5 hover:bg-accent-primary/10"
              : "text-tx-tertiary hover:text-tx-secondary hover:bg-app-hover"
        )}
      >
        <Calendar size={13} />
        {text.title}
      </button>

      {expanded && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
          {/* 遮罩 */}
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setExpanded(false)}
          />
          {/* 弹窗卡片 */}
          <div
            className="relative w-full max-w-sm max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border border-app-border bg-app-elevated shadow-2xl p-4 space-y-3"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-tx-primary">{text.title}</h4>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="p-1 rounded-md text-tx-tertiary hover:text-tx-secondary hover:bg-app-hover transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* 说明 */}
            <p className="text-xs text-tx-tertiary leading-relaxed">
              {text.description}
            </p>

            {/* 状态 */}
            <div className="flex items-center gap-2 text-xs">
              <span className={cn("w-2 h-2 rounded-full", feed.enabled ? "bg-green-500" : "bg-gray-400")} />
              <span className="text-tx-secondary">
                {feed.enabled ? text.active : text.disabled}
              </span>
              {feed.lastAccessedAt && (
                <span className="text-tx-tertiary ml-auto">
                  {text.lastAccess}: {new Date(feed.lastAccessedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* 订阅链接 */}
            <div className="space-y-1">
              <label className="block text-xs text-tx-tertiary">{text.link}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={icsUrl}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-app-bg rounded-lg border border-app-border text-tx-secondary truncate"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-tx-tertiary bg-app-hover rounded-lg hover:bg-app-hover/80 transition-colors"
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>

            {/* 导出已完成待办 */}
            <label className="flex items-center gap-2.5 cursor-pointer min-h-[32px]">
              <input
                type="checkbox"
                checked={feed.includeCompleted}
                onChange={(e) => handleUpdate({ includeCompleted: e.target.checked })}
                disabled={actionLoading === "update"}
                className="rounded border-app-border text-accent-primary focus:ring-accent-primary/30"
              />
              <span className="text-xs text-tx-secondary">{text.includeCompleted}</span>
            </label>

            {/* 导出描述 */}
            <label className="flex items-center gap-2.5 cursor-pointer min-h-[32px]">
              <input
                type="checkbox"
                checked={feed.includeDescription}
                onChange={(e) => handleUpdate({ includeDescription: e.target.checked })}
                disabled={actionLoading === "update"}
                className="rounded border-app-border text-accent-primary focus:ring-accent-primary/30"
              />
              <span className="text-xs text-tx-secondary">{text.includeDescription}</span>
            </label>

            {/* 默认提醒时间 */}
            <div className="space-y-1">
              <label className="block text-xs text-tx-tertiary">{text.defaultAlarm}</label>
              <select
                value={feed.defaultAlarmMinutes}
                onChange={(e) => handleUpdate({ defaultAlarmMinutes: Number(e.target.value) })}
                disabled={actionLoading === "update"}
                className="w-full px-2.5 py-1.5 text-xs bg-app-bg rounded-lg border border-app-border text-tx-primary focus:ring-accent-primary/30"
              >
                {alarmOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleRotate}
                disabled={actionLoading === "rotate"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-tx-tertiary hover:text-amber-600 bg-app-hover rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                {actionLoading === "rotate" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                {text.rotate}
              </button>
              <button
                type="button"
                onClick={handleDisable}
                disabled={actionLoading === "disable"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-tx-tertiary hover:text-red-600 bg-app-hover rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto"
              >
                {actionLoading === "disable" ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
                {text.disable}
              </button>
            </div>

            {/* 提示 */}
            <p className="text-[11px] text-tx-tertiary leading-relaxed">
              {text.hint}
            </p>
          </div>
        </div>
      )}
    </>
  );
}