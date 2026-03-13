import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ThreadSummary } from "../../../domain/types";
import { ArchivedThreadsSettingsSection } from "./ArchivedThreadsSettingsSection";

function createThread(id = "thread-1"): ThreadSummary {
  return {
    id,
    title: `归档线程 ${id}`,
    branch: null,
    cwd: "E:/code/project-a",
    archived: true,
    updatedAt: "2026-03-12T10:00:00.000Z",
    source: "rpc",
    agentEnvironment: "windowsNative",
    status: "idle",
    activeFlags: [],
    queuedCount: 0
  };
}

describe("ArchivedThreadsSettingsSection", () => {
  it("loads and renders archived threads", async () => {
    render(
      <ArchivedThreadsSettingsSection
        listArchivedThreads={vi.fn().mockResolvedValue([createThread()])}
        unarchiveThread={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByText("正在加载已归档线程...")).toBeInTheDocument();
    expect(await screen.findByText("归档线程 thread-1")).toBeInTheDocument();
  });

  it("shows the empty state when there are no archived threads", async () => {
    render(
      <ArchivedThreadsSettingsSection
        listArchivedThreads={vi.fn().mockResolvedValue([])}
        unarchiveThread={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(await screen.findByText("暂无已归档线程。")) .toBeInTheDocument();
  });

  it("shows the load error and refreshes successfully", async () => {
    const listArchivedThreads = vi
      .fn()
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValueOnce([createThread("thread-2")]);

    render(
      <ArchivedThreadsSettingsSection
        listArchivedThreads={listArchivedThreads}
        unarchiveThread={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(await screen.findByText("load failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    expect(await screen.findByText("归档线程 thread-2")).toBeInTheDocument();
    expect(listArchivedThreads).toHaveBeenCalledTimes(2);
  });

  it("removes the thread after unarchiving successfully", async () => {
    const unarchiveThread = vi.fn().mockResolvedValue(undefined);

    render(
      <ArchivedThreadsSettingsSection
        listArchivedThreads={vi.fn().mockResolvedValue([createThread()])}
        unarchiveThread={unarchiveThread}
      />
    );

    expect(await screen.findByText("归档线程 thread-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消归档" }));

    await waitFor(() => expect(unarchiveThread).toHaveBeenCalledWith("thread-1"));
    await waitFor(() => expect(screen.queryByText("归档线程 thread-1")).toBeNull());
  });

  it("keeps the thread and shows the row error when unarchive fails", async () => {
    render(
      <ArchivedThreadsSettingsSection
        listArchivedThreads={vi.fn().mockResolvedValue([createThread()])}
        unarchiveThread={vi.fn().mockRejectedValue(new Error("restore failed"))}
      />
    );

    expect(await screen.findByText("归档线程 thread-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消归档" }));

    expect(await screen.findByText("restore failed")).toBeInTheDocument();
    expect(screen.getByText("归档线程 thread-1")).toBeInTheDocument();
  });
});
