import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PendingApprovalEntry } from "../../../domain/timeline";
import { HomeRequestEntry } from "./HomeRequestEntry";

function createCommandApprovalEntry(): PendingApprovalEntry {
  return {
    id: "entry-2",
    kind: "pendingApproval",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-2",
    requestId: "request-2",
    request: {
      kind: "commandApproval",
      id: "request-2",
      rpcId: "request-2",
      method: "item/commandExecution/requestApproval",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-2",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-2",
        command: "Get-Content src/state/appReducer.ts",
        cwd: "E:/code/codex-app-plus",
        reason: "Do you want to allow a read-only scan?",
        proposedExecpolicyAmendment: ["allow read-only scans"],
        availableDecisions: [{
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: ["allow read-only scans"],
          },
        }, "decline"],
      },
    },
  };
}

function createFileApprovalEntry(): PendingApprovalEntry {
  return {
    id: "entry-1",
    kind: "pendingApproval",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    requestId: "request-1",
    request: {
      kind: "fileApproval",
      id: "request-1",
      rpcId: "request-1",
      method: "item/fileChange/requestApproval",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        reason: "Review the proposed file changes before continuing.",
      },
    },
  };
}

describe("HomeRequestEntry", () => {
  it("offers persistent command approval when the server proposes an execpolicy amendment", () => {
    const onResolveServerRequest = vi.fn().mockResolvedValue(undefined);

    render(
      <HomeRequestEntry
        entry={createCommandApprovalEntry()}
        onResolveServerRequest={onResolveServerRequest}
      />,
    );

    expect(screen.getByRole("button", { name: "Always allow similar commands" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow for session" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Always allow similar commands" }));

    expect(onResolveServerRequest).toHaveBeenCalledWith({
      kind: "commandApproval",
      requestId: "request-2",
      decision: {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ["allow read-only scans"],
        },
      },
    });
  });

  it("offers apply for session for file approvals", () => {
    const onResolveServerRequest = vi.fn().mockResolvedValue(undefined);

    render(
      <HomeRequestEntry
        entry={createFileApprovalEntry()}
        onResolveServerRequest={onResolveServerRequest}
      />,
    );

    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply for session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply for session" }));

    expect(onResolveServerRequest).toHaveBeenCalledWith({
      kind: "fileApproval",
      requestId: "request-1",
      decision: "acceptForSession",
    });
  });
});
