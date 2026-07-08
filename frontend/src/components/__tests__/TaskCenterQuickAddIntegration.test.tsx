import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TaskCenter from "../TaskCenter";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
    getTasks: vi.fn(),
    getTaskStats: vi.fn(),
    getTaskDependencies: vi.fn(),
    getReminderOverview: vi.fn(),
    createTask: vi.fn(),
    createTaskReminder: vi.fn(),
    toggleTask: vi.fn(),
    deleteTask: vi.fn(),
    updateTask: vi.fn(),
    createTaskDependency: vi.fn(),
    deleteTaskDependency: vi.fn(),
    batchTasks: vi.fn(),
    reorderTasks: vi.fn(),
    getTaskProjects: vi.fn(),
    createTaskProject: vi.fn(),
    updateTaskProject: vi.fn(),
    deleteTaskProject: vi.fn(),
    taskAttachmentsBind: vi.fn(),
    childQuickAddTitle: "今天下午3点 子任务 提前3小时",
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/toast", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/lib/api", () => ({
    api: {
        getTasks: apiMocks.getTasks,
        getTaskStats: apiMocks.getTaskStats,
        getTaskDependencies: apiMocks.getTaskDependencies,
        getReminderOverview: apiMocks.getReminderOverview,
        createTask: apiMocks.createTask,
        createTaskReminder: apiMocks.createTaskReminder,
        toggleTask: apiMocks.toggleTask,
        deleteTask: apiMocks.deleteTask,
        updateTask: apiMocks.updateTask,
        createTaskDependency: apiMocks.createTaskDependency,
        deleteTaskDependency: apiMocks.deleteTaskDependency,
        batchTasks: apiMocks.batchTasks,
        reorderTasks: apiMocks.reorderTasks,
        getTaskProjects: apiMocks.getTaskProjects,
        createTaskProject: apiMocks.createTaskProject,
        updateTaskProject: apiMocks.updateTaskProject,
        deleteTaskProject: apiMocks.deleteTaskProject,
        taskAttachments: {
            bind: apiMocks.taskAttachmentsBind,
        },
    },
}));

vi.mock("../tasks/useReminderNotifier", () => ({
    useReminderNotifier: () => { },
}));

vi.mock("../tasks/taskSearch", () => ({
    taskMatchesSearch: () => true,
}));

vi.mock("../tasks/useTaskTree", () => ({
    useTaskTree: (tasks: any[]) => ({
        flatOrderedTasks: tasks.map((node) => ({ node, depth: 0 })),
        expandedTaskIds: new Set<string>(),
        toggleExpand: vi.fn(),
        isTreeMode: false,
    }),
}));

vi.mock("../tasks/useTaskProjects", () => ({
    useTaskProjects: () => ({
        projects: [],
        selectedProjectId: null,
        setSelectedProjectId: vi.fn(),
        createProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        refreshCounts: vi.fn(),
        reload: vi.fn(),
    }),
}));

vi.mock("../tasks/TaskOverview", () => ({ TaskOverview: () => null }));
vi.mock("../tasks/TaskTreeRow", () => ({ TaskTreeRow: () => null }));
vi.mock("../tasks/TaskEmptyState", () => ({ TaskEmptyState: () => null }));
vi.mock("../tasks/TaskDetailPanel", () => ({ TaskDetailPanel: () => null }));
vi.mock("../tasks/FlatTaskRow", () => ({
    FlatTaskRow: ({ task, onCreateChild }: any) => (
        <button
            data-testid={`create-child-${task.id}`}
            onClick={() => void onCreateChild(apiMocks.childQuickAddTitle, task.id)}
        >
            create child
        </button>
    ),
}));
vi.mock("../tasks/TaskBoardView", () => ({ TaskBoardView: () => null }));
vi.mock("../tasks/TaskCalendarView", () => ({ TaskCalendarView: () => null }));
vi.mock("../tasks/TaskGanttView", () => ({ default: () => null }));
vi.mock("../tasks/TaskTemplatePicker", () => ({ TaskTemplatePicker: () => null }));
vi.mock("../tasks/ReminderCenter", () => ({ ReminderCenter: () => null }));
vi.mock("../tasks/TaskCalendarFeedSettings", () => ({ TaskCalendarFeedSettings: () => null }));
vi.mock("../tasks/CalendarExportTargetSettings", () => ({ CalendarExportTargetSettings: () => null }));
vi.mock("../tasks/MobileProjectPicker", () => ({
    MobileProjectTrigger: () => null,
    MobileProjectPicker: () => null,
}));

vi.mock("../tasks/TaskQuickAdd", () => ({
    TaskQuickAdd: ({ value, onChange, onSubmit, inputRef }: any) => (
        <div>
            <input
                data-testid="quick-add-input"
                ref={inputRef}
                value={value}
                onInput={(e) => onChange((e.target as HTMLInputElement).value)}
            />
            <button data-testid="quick-add-submit" onClick={() => void onSubmit([])}>
                submit
            </button>
        </div>
    ),
}));

function makeTask(overrides: Record<string, any> = {}) {
    return {
        id: "task-1",
        userId: "u1",
        workspaceId: null,
        title: "task",
        description: "",
        isCompleted: 0,
        priority: 2,
        dueDate: null,
        dueAt: null,
        noteId: null,
        parentId: null,
        sortOrder: 0,
        projectId: null,
        status: "todo",
        createdAt: "2026-01-01T00:00:00",
        updatedAt: "2026-01-01T00:00:00",
        ...overrides,
    };
}

function makeStats() {
    return { total: 0, completed: 0, pending: 0, today: 0, overdue: 0, week: 0 };
}

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
}

async function renderTaskCenter(root: Root) {
    await act(async () => {
        root.render(<TaskCenter />);
        await flush();
    });
}

describe("TaskCenter quick-add integration", () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-08T10:00:00"));

        apiMocks.getTasks.mockResolvedValue([]);
        apiMocks.getTaskStats.mockResolvedValue(makeStats());
        apiMocks.getTaskDependencies.mockResolvedValue([]);
        apiMocks.getReminderOverview.mockResolvedValue({ missed: [], today: [], upcoming: [], disabled: [] });
        apiMocks.createTask.mockResolvedValue(makeTask({ id: "new-task" }));
        apiMocks.createTaskReminder.mockResolvedValue({ id: "r1" });
        apiMocks.childQuickAddTitle = "今天下午3点 子任务 提前3小时";

        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        document.body.innerHTML = "";
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it("creates task with parsed fields and creates reminders", async () => {
        await renderTaskCenter(root);

        const input = host.querySelector<HTMLInputElement>("[data-testid='quick-add-input']");
        const submit = host.querySelector<HTMLButtonElement>("[data-testid='quick-add-submit']");
        expect(input).not.toBeNull();
        expect(submit).not.toBeNull();

        await act(async () => {
            input!.value = "今天下午3点 开会 提前3小时";
            input!.dispatchEvent(new Event("input", { bubbles: true }));
            await flush();
        });

        await act(async () => {
            submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await flush();
        });

        expect(apiMocks.createTask).toHaveBeenCalledTimes(1);
        expect(apiMocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
            title: "开会",
            dueDate: "2026-07-08",
            dueAt: "2026-07-08T15:00",
        }));

        expect(apiMocks.createTaskReminder).toHaveBeenCalledTimes(2);
        expect(apiMocks.createTaskReminder).toHaveBeenNthCalledWith(1, "new-task", 0);
        expect(apiMocks.createTaskReminder).toHaveBeenNthCalledWith(2, "new-task", 180);

        expect(input!.value).toBe("");
    });

    it("continues when one reminder creation fails", async () => {
        await renderTaskCenter(root);

        apiMocks.createTaskReminder
            .mockRejectedValueOnce(new Error("network"))
            .mockResolvedValueOnce({ id: "r-ok" });

        const input = host.querySelector<HTMLInputElement>("[data-testid='quick-add-input']");
        const submit = host.querySelector<HTMLButtonElement>("[data-testid='quick-add-submit']");

        await act(async () => {
            input!.value = "今天下午3点 开会 提前3小时";
            input!.dispatchEvent(new Event("input", { bubbles: true }));
            await flush();
        });

        await act(async () => {
            submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await flush();
        });

        expect(apiMocks.createTask).toHaveBeenCalledTimes(1);
        expect(apiMocks.createTaskReminder).toHaveBeenCalledTimes(2);
        expect(input!.value).toBe("");
    });

    it("creates custom repeat task with object repeatRuleJson payload", async () => {
        await renderTaskCenter(root);

        const input = host.querySelector<HTMLInputElement>("[data-testid='quick-add-input']");
        const submit = host.querySelector<HTMLButtonElement>("[data-testid='quick-add-submit']");

        await act(async () => {
            input!.value = "每个工作日 写日报";
            input!.dispatchEvent(new Event("input", { bubbles: true }));
            await flush();
        });

        await act(async () => {
            submit!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await flush();
        });

        expect(apiMocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
            title: "写日报",
            repeatRule: "custom",
            repeatRuleJson: { frequency: "week", interval: 1, weekdays: [1, 2, 3, 4, 5] },
        }));
    });

    it("creates child task with parsed fields and reminders", async () => {
        apiMocks.getTasks.mockResolvedValueOnce([makeTask({ id: "parent-task", title: "parent" })]);

        await renderTaskCenter(root);

        const childButton = host.querySelector<HTMLButtonElement>("[data-testid='create-child-parent-task']");
        expect(childButton).not.toBeNull();

        await act(async () => {
            childButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await flush();
        });

        expect(apiMocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
            title: "子任务",
            parentId: "parent-task",
            dueDate: "2026-07-08",
            dueAt: "2026-07-08T15:00",
        }));

        expect(apiMocks.createTaskReminder).toHaveBeenCalledTimes(2);
        expect(apiMocks.createTaskReminder).toHaveBeenNthCalledWith(1, "new-task", 0);
        expect(apiMocks.createTaskReminder).toHaveBeenNthCalledWith(2, "new-task", 180);
    });

    it("does not inherit parent recognized fields when child title has none", async () => {
        apiMocks.childQuickAddTitle = "子任务";
        apiMocks.getTasks.mockResolvedValueOnce([
            makeTask({
                id: "parent-task",
                title: "parent",
                projectId: "project-1",
                dueDate: "2026-07-08",
                dueAt: "2026-07-08T15:00",
                repeatRule: "daily",
                repeatInterval: 1,
                repeatRuleJson: JSON.stringify({ frequency: "day", interval: 1 }),
            }),
        ]);

        await renderTaskCenter(root);

        const childButton = host.querySelector<HTMLButtonElement>("[data-testid='create-child-parent-task']");
        expect(childButton).not.toBeNull();

        await act(async () => {
            childButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await flush();
        });

        const payload = apiMocks.createTask.mock.calls[0][0];
        expect(payload).toMatchObject({
            title: "子任务",
            parentId: "parent-task",
            projectId: "project-1",
        });
        expect(payload).not.toHaveProperty("dueDate");
        expect(payload).not.toHaveProperty("dueAt");
        expect(payload).not.toHaveProperty("repeatRule");
        expect(payload).not.toHaveProperty("repeatInterval");
        expect(payload).not.toHaveProperty("repeatRuleJson");
        expect(apiMocks.createTaskReminder).not.toHaveBeenCalled();
    });
});
