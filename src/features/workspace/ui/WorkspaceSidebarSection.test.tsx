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
    readonly loading?: boolean;
    readonly error?: string | null;
    readonly onDeleteThread?: (thread: ThreadSummary) => Promise<void>;
    readonly onArchiveThread?: (thread: ThreadSummary) => Promise<void>;
  }
): void {
  function Harness(): JSX.Element {
    const [selectedRootId, setSelectedRootId] = useState<string | null>(ROOTS[0]!.id);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

    return (
      <>
        <div data-testid="selected-thread">{selectedThreadId ?? "none"}</div>
        <WorkspaceSidebarSection
          roots={ROOTS}
          codexSessions={codexSessions}
          loading={options?.loading ?? false}
          error={options?.error ?? null}
          selectedRootId={selectedRootId}
          selectedThreadId={selectedThreadId}
          onSelectRoot={setSelectedRootId}
          onSelectThread={setSelectedThreadId}
          onArchiveThread={options?.onArchiveThread ?? vi.fn().mockResolvedValue(undefined)}
          onDeleteThread={options?.onDeleteThread ?? vi.fn().mockResolvedValue(undefined)}
          onAddRoot={vi.fn()}
          onRemoveRoot={vi.fn()}
        />
      </>
    );
  }

  render(<Harness />);
}

describe("WorkspaceSidebarSection", () => {
  it("expands the chosen workspace without auto-selecting a session", () => {
    const threads = [createThread(ROOTS[0]!, 1), createThread(ROOTS[1]!, 2)];

    renderSection(threads);

    expect(screen.queryByText("FPGA Thread 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex Thread 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("FPGA"));
    expect(screen.getByText("FPGA Thread 1")).toBeInTheDocument();
    expect(screen.queryByText("Codex Thread 2")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-thread")).toHaveTextContent("none");

    fireEvent.click(screen.getByText("Codex"));
    expect(screen.getByText("Codex Thread 2")).toBeInTheDocument();
    expect(screen.queryByText("FPGA Thread 1")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-thread")).toHaveTextContent("none");
  });

  it("toggles collapse when clicking the workspace row again", () => {
    renderSection([createThread(ROOTS[0]!, 1)]);

    fireEvent.click(screen.getByText("FPGA"));
    expect(screen.getByText("FPGA Thread 1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("FPGA"));
    expect(screen.queryByText("FPGA Thread 1")).not.toBeInTheDocument();
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

  it("shows loading and explicit errors", () => {
    renderSection([], { loading: true, error: "boom" });

    expect(screen.getByRole("status")).toHaveTextContent("加载会话中...");
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
