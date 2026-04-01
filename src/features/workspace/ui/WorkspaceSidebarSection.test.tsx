import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRoot } from "../hooks/useWorkspaceRoots";
import type { ThreadSummary } from "../../../domain/types";
import { WorkspaceSidebarSection } from "./WorkspaceSidebarSection";

const ROOTS: ReadonlyArray<WorkspaceRoot> = [
  { id: "root-1", name: "FPGA", path: "E:/code/FPGA" },
  { id: "root-2", name: "Codex", path: "E:/code/codex" }
];

function createThread(
  root: WorkspaceRoot,
  index: number,
  overrides?: Partial<Pick<ThreadSummary, "source" | "status" | "queuedCount">>
): ThreadSummary {
  return {
    id: `thread-${root.id}-${index}`,
    title: `${root.name} Thread ${index}`,
    branch: null,
    cwd: root.path,
    archived: false,
    updatedAt: `2026-03-${String(index).padStart(2, "0")}T10:00:00.000Z`,
    source: overrides?.source ?? "codexData",
    agentEnvironment: "windowsNative",
    status: overrides?.status ?? "notLoaded",
    activeFlags: [],
    queuedCount: overrides?.queuedCount ?? 0
  };
}

function renderSection(
  codexSessions: ReadonlyArray<ThreadSummary>,
  options?: {
    readonly error?: string | null;
    readonly onDeleteThread?: (thread: ThreadSummary) => Promise<void>;
    readonly onArchiveThread?: (thread: ThreadSummary) => Promise<void>;
    readonly onCreateThread?: () => Promise<void>;
    readonly onCreateThreadInRoot?: (rootId: string) => Promise<void>;
    readonly onRemoveRoot?: (rootId: string) => void;
    readonly onSelectWorkspaceThread?: (rootId: string, threadId: string | null) => void;
  }
): void {
  function Harness(): JSX.Element {
    const [selectedRootId, setSelectedRootId] = useState<string | null>(ROOTS[0]!.id);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

    return (
      <>
        <div data-testid="selected-root">{selectedRootId ?? "none"}</div>
        <div data-testid="selected-thread">{selectedThreadId ?? "none"}</div>
        <WorkspaceSidebarSection
          roots={ROOTS}
          codexSessions={codexSessions}
          error={options?.error ?? null}
          selectedRootId={selectedRootId}
          selectedThreadId={selectedThreadId}
          onSelectRoot={setSelectedRootId}
          onSelectThread={setSelectedThreadId}
          onSelectWorkspaceThread={options?.onSelectWorkspaceThread}
          onArchiveThread={options?.onArchiveThread ?? vi.fn().mockResolvedValue(undefined)}
          onDeleteThread={options?.onDeleteThread ?? vi.fn().mockResolvedValue(undefined)}
          onAddRoot={vi.fn()}
          onCreateThread={options?.onCreateThread ?? vi.fn().mockResolvedValue(undefined)}
          onCreateThreadInRoot={options?.onCreateThreadInRoot}
          onRemoveRoot={options?.onRemoveRoot ?? vi.fn()}
        />
      </>
    );
  }

  render(<Harness />);
}

describe("WorkspaceSidebarSection", () => {
  it("expands workspaces independently without changing the selected workspace", () => {
    const threads = [createThread(ROOTS[0]!, 1), createThread(ROOTS[1]!, 2)];

    renderSection(threads);

    expect(screen.queryByText("FPGA Thread 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex Thread 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("FPGA"));
    expect(screen.getByText("FPGA Thread 1")).toBeInTheDocument();
    expect(screen.queryByText("Codex Thread 2")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-root")).toHaveTextContent("root-1");
    expect(screen.getByTestId("selected-thread")).toHaveTextContent("none");

    fireEvent.click(screen.getByText("Codex"));
    expect(screen.getByText("FPGA Thread 1")).toBeInTheDocument();
    expect(screen.getByText("Codex Thread 2")).toBeInTheDocument();
    expect(screen.getByTestId("selected-root")).toHaveTextContent("root-1");
    expect(screen.getByTestId("selected-thread")).toHaveTextContent("none");
  });

  it("collapses only the clicked workspace row", () => {
    renderSection([createThread(ROOTS[0]!, 1), createThread(ROOTS[1]!, 2)]);

    fireEvent.click(screen.getByText("FPGA"));
    expect(screen.getByText("FPGA Thread 1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Codex"));
    expect(screen.getByText("Codex Thread 2")).toBeInTheDocument();

    fireEvent.click(screen.getByText("FPGA"));
    expect(screen.queryByText("FPGA Thread 1")).not.toBeInTheDocument();
    expect(screen.getByText("Codex Thread 2")).toBeInTheDocument();
  });

  it("shows only the latest ten sessions until expanded", () => {
    const threads = Array.from({ length: 12 }, (_, index) => createThread(ROOTS[0]!, index + 1));

    renderSection(threads);
    fireEvent.click(screen.getByText("FPGA"));

    expect(screen.getByText("FPGA Thread 12")).toBeInTheDocument();
    expect(screen.getByText("FPGA Thread 3")).toBeInTheDocument();
    expect(screen.queryByText("FPGA Thread 2")).not.toBeInTheDocument();
    expect(screen.queryByText("FPGA Thread 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开全部 12 条" }));
    expect(screen.getByText("FPGA Thread 2")).toBeInTheDocument();
    expect(screen.getByText("FPGA Thread 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起到最近 10 条" }));
    expect(screen.queryByText("FPGA Thread 2")).not.toBeInTheDocument();
    expect(screen.queryByText("FPGA Thread 1")).not.toBeInTheDocument();
  });

  it("renders title and time inside the same session button", () => {
    renderSection([createThread(ROOTS[0]!, 1)]);
    fireEvent.click(screen.getByText("FPGA"));

    const title = screen.getByText("FPGA Thread 1");
    const threadButton = title.closest("button");

    expect(threadButton).not.toBeNull();

    const meta = (threadButton as HTMLButtonElement).querySelector(".workspace-thread-meta");
    expect(meta).not.toBeNull();
    expect(meta?.textContent?.trim().length).toBeGreaterThan(0);
    expect(within(threadButton as HTMLButtonElement).getByText("FPGA Thread 1")).toBeInTheDocument();
  });

  it("shows workspace actions in the requested order without a count badge", () => {
    renderSection([createThread(ROOTS[0]!, 1)]);

    const row = screen.getByText("FPGA").closest(".workspace-root-row");
    expect(row).not.toBeNull();
    expect(document.querySelector(".workspace-thread-count")).toBeNull();

    const buttons = within(row as HTMLElement).getAllByRole("button");
    expect(buttons[1]).toHaveAccessibleName("工作区更多操作 FPGA");
    expect(buttons[2]).toHaveAccessibleName("在工作区 FPGA 中创建新会话");
    expect(buttons[2]?.querySelector("svg.workspace-root-action-icon")).not.toBeNull();
  });

  it("forwards workspace new thread actions", async () => {
    const onCreateThreadInRoot = vi.fn().mockResolvedValue(undefined);

    renderSection([createThread(ROOTS[0]!, 1), createThread(ROOTS[1]!, 2)], { onCreateThreadInRoot });
    fireEvent.click(screen.getByText("Codex"));
    fireEvent.click(screen.getByRole("button", { name: "在工作区 Codex 中创建新会话" }));

    await waitFor(() => expect(onCreateThreadInRoot).toHaveBeenCalledWith(ROOTS[1]!.id));
  });

  it("selects the thread workspace before selecting the thread", async () => {
    const onSelectWorkspaceThread = vi.fn();

    renderSection([createThread(ROOTS[0]!, 1), createThread(ROOTS[1]!, 2)], { onSelectWorkspaceThread });
    fireEvent.click(screen.getByText("Codex"));
    fireEvent.click(screen.getByRole("button", { name: /Codex Thread 2/ }));

    await waitFor(() => expect(onSelectWorkspaceThread).toHaveBeenCalledWith(ROOTS[1]!.id, "thread-root-2-2"));
  });

  it("moves workspace removal into the more menu", async () => {
    const onRemoveRoot = vi.fn();

    renderSection([createThread(ROOTS[0]!, 1)], { onRemoveRoot });
    fireEvent.click(screen.getByRole("button", { name: "工作区更多操作 FPGA" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "从列表移除" }));

    await waitFor(() => expect(onRemoveRoot).toHaveBeenCalledWith(ROOTS[0]!.id));
  });

  it("opens the same workspace menu on right click", async () => {
    const onRemoveRoot = vi.fn();

    renderSection([createThread(ROOTS[0]!, 1)], { onRemoveRoot });
    fireEvent.contextMenu(screen.getByText("FPGA").closest(".workspace-root-row") as HTMLElement);
    fireEvent.click(screen.getByRole("menuitem", { name: "从列表移除" }));

    await waitFor(() => expect(onRemoveRoot).toHaveBeenCalledWith(ROOTS[0]!.id));
  });

  it("opens the same workspace menu when right clicking either action button", () => {
    renderSection([createThread(ROOTS[0]!, 1)]);

    fireEvent.contextMenu(screen.getByRole("button", { name: "工作区更多操作 FPGA" }));
    expect(screen.getByRole("menuitem", { name: "从列表移除" })).toBeInTheDocument();

    fireEvent.click(document.body);

    fireEvent.contextMenu(screen.getByRole("button", { name: "在工作区 FPGA 中创建新会话" }));
    expect(screen.getByRole("menuitem", { name: "从列表移除" })).toBeInTheDocument();
  });

  it("shows explicit errors", () => {
    renderSection([], { error: "boom" });

    expect(screen.getByRole("alert")).toHaveTextContent("加载会话失败：boom");
  });

  it("deletes the session directly from the context menu", async () => {
    const thread = createThread(ROOTS[0]!, 1);
    const onDeleteThread = vi.fn().mockResolvedValue(undefined);

    renderSection([thread], { onDeleteThread });
    fireEvent.click(screen.getByText("FPGA"));
    fireEvent.contextMenu(screen.getByRole("button", { name: /FPGA Thread 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除会话" }));

    await waitFor(() => expect(onDeleteThread).toHaveBeenCalledWith(thread));
  });

  it("shows archive for rpc threads and calls the archive handler", async () => {
    const thread = createThread(ROOTS[0]!, 1, { source: "rpc", status: "idle" });
    const onArchiveThread = vi.fn().mockResolvedValue(undefined);

    renderSection([thread], { onArchiveThread });
    fireEvent.click(screen.getByText("FPGA"));
    fireEvent.contextMenu(screen.getByRole("button", { name: /FPGA Thread 1/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "归档会话" }));

    await waitFor(() => expect(onArchiveThread).toHaveBeenCalledWith(thread));
  });

  it("does not show archive for codexData threads", () => {
    renderSection([createThread(ROOTS[0]!, 1)]);
    fireEvent.click(screen.getByText("FPGA"));
    fireEvent.contextMenu(screen.getByRole("button", { name: /FPGA Thread 1/ }));

    expect(screen.queryByRole("menuitem", { name: "归档会话" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "删除会话" })).toBeInTheDocument();
  });

  it("shows empty state after expanding a workspace without sessions", () => {
    renderSection([]);

    fireEvent.click(screen.getByText("FPGA"));
    expect(screen.getByText("暂无会话")).toBeInTheDocument();
  });
});
