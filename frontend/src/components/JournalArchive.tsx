/**
 * 日记归档组件
 *
 * 在侧边栏展示按年月分组的日记树：
 *   日记
 *   ├── 今日日记
 *   ├── 2026
 *   │   ├── 06月
 *   │   │   ├── 2026-06-26
 *   │   │   ├── 2026-06-25
 *   │   ├── 05月
 *   ├── 2025
 *
 * 设计决策：
 *   - 分组基于 journal_date，不使用 createdAt 或 title
 *   - 月份显示使用中文格式（06月）
 *   - 支持展开/收起年份和月份
 *   - 点击日记打开对应笔记
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Calendar,
  FileText,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

interface JournalItem {
  id: string;
  title: string;
  journalDate: string;
  createdAt: string;
  updatedAt: string;
}

interface MonthGroup {
  month: string;
  count: number;
  journals: JournalItem[];
}

interface YearGroup {
  year: string;
  count: number;
  months: MonthGroup[];
}

interface JournalArchiveProps {
  /** 当前打开的笔记 ID */
  activeNoteId: string | null;
  /** 打开笔记回调 */
  onOpenNote: (noteId: string) => void;
  /** 创建今日日记回调 */
  onCreateToday: () => void;
}

export default function JournalArchive({
  activeNoteId,
  onOpenNote,
  onCreateToday,
}: JournalArchiveProps) {
  const { t } = useTranslation();
  const [years, setYears] = useState<YearGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  // 加载归档数据
  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.journals.getArchive();
      setYears(data.years || []);

      // 默认展开当前年月
      const now = new Date();
      const currentYear = String(now.getFullYear());
      const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
      setExpandedYears(new Set([currentYear]));
      setExpandedMonths(new Set([`${currentYear}-${currentMonth}`]));
    } catch (err) {
      console.error("Failed to load journal archive:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchive();
  }, [loadArchive]);

  // 切换年份展开/收起
  const toggleYear = (year: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  // 切换月份展开/收起
  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 月份显示名称
  const getMonthLabel = (month: string) => {
    return t(`calendar.months.${parseInt(month) - 1}`, { defaultValue: `${month}月` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={16} className="animate-spin text-tx-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* 今日日记入口 */}
      <button
        onClick={onCreateToday}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-tx-secondary hover:bg-app-hover transition-colors"
      >
        <Calendar size={14} className="text-accent-primary" />
        <span>{t("journal.todayJournal", { defaultValue: "今日日记" })}</span>
      </button>

      {/* 归档树 */}
      {years.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-tx-tertiary">
            {t("journal.noJournals", { defaultValue: "暂无日记" })}
          </p>
          <button
            onClick={onCreateToday}
            className="mt-2 text-xs text-accent-primary hover:underline"
          >
            {t("journal.createToday", { defaultValue: "创建今日日记" })}
          </button>
        </div>
      ) : (
        years.map((yearGroup) => (
          <div key={yearGroup.year}>
            {/* 年份 */}
            <button
              onClick={() => toggleYear(yearGroup.year)}
              className="w-full flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-tx-primary hover:bg-app-hover transition-colors"
            >
              {expandedYears.has(yearGroup.year) ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              <span>{yearGroup.year}</span>
              <span className="ml-auto text-[10px] text-tx-tertiary font-normal">
                {yearGroup.count}
              </span>
            </button>

            {/* 月份列表 */}
            {expandedYears.has(yearGroup.year) && (
              <div className="ml-2">
                {yearGroup.months.map((monthGroup) => {
                  const monthKey = `${yearGroup.year}-${monthGroup.month}`;
                  return (
                    <div key={monthKey}>
                      {/* 月份 */}
                      <button
                        onClick={() => toggleMonth(monthKey)}
                        className="w-full flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-tx-secondary hover:bg-app-hover transition-colors"
                      >
                        {expandedMonths.has(monthKey) ? (
                          <ChevronDown size={10} />
                        ) : (
                          <ChevronRight size={10} />
                        )}
                        <span>{getMonthLabel(monthGroup.month)}</span>
                        <span className="ml-auto text-[10px] text-tx-tertiary">
                          {monthGroup.count}
                        </span>
                      </button>

                      {/* 日记列表 */}
                      {expandedMonths.has(monthKey) && (
                        <div className="ml-3 space-y-0.5">
                          {monthGroup.journals.map((journal) => (
                            <button
                              key={journal.id}
                              onClick={() => onOpenNote(journal.id)}
                              className={cn(
                                "w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors",
                                activeNoteId === journal.id
                                  ? "bg-accent-primary/10 text-accent-primary"
                                  : "text-tx-secondary hover:bg-app-hover hover:text-tx-primary"
                              )}
                            >
                              <FileText size={10} className="shrink-0" />
                              <span className="truncate">{journal.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
