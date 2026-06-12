import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

/**
 * Background reminder notifier.
 * Polls the backend scanner every 30 seconds when the tab is visible.
 * On matching reminders, triggers Electron native notification or browser Notification API.
 */

interface PendingReminder {
  reminderId: string;
  taskId: string;
  taskTitle: string;
  dueAt: string | null;
  dueDate: string | null;
  userId: string;
  offsetMinutes: number;
}

// track which reminders we already notified this session to avoid duplicates
const notifiedSet = new Set<string>();

function sendNotification(title: string, body: string) {
  // try Electron first
  const desktop = (window as any).nowenDesktop;
  if (desktop?.taskNotify) {
    desktop.taskNotify(title, body).catch(() => {});
    return;
  }
  // browser Notification API
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body });
    } catch {
      // silently ignore
    }
  }
}

export function useReminderNotifier() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const scan = async () => {
      try {
        // reuse the test-now endpoint which returns all due reminders
        const res = await fetch("/api/task-reminders/test-now", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        const pending: PendingReminder[] = data.reminders || [];

        for (const r of pending) {
          if (notifiedSet.has(r.reminderId)) continue;
          notifiedSet.add(r.reminderId);

          const label = r.offsetMinutes === 0
            ? `\u23F0 ${r.taskTitle}`
            : `\u23F0 ${r.taskTitle}`;
          const body = r.dueAt
            ? `Due: ${r.dueAt}`
            : r.dueDate
              ? `Due: ${r.dueDate}`
              : "";

          sendNotification(label, body);
        }
      } catch {
        // ignore network errors
      }
    };

    // initial scan after 5s
    const initialTimeout = setTimeout(scan, 5000);

    // poll every 30s when visible
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!timerRef.current) {
          timerRef.current = setInterval(scan, 30000);
        }
      } else {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    // start polling if currently visible
    if (document.visibilityState === "visible") {
      timerRef.current = setInterval(scan, 30000);
    }

    return () => {
      clearTimeout(initialTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
