import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReceivedServerRequest } from "../../../domain/types";
import { InspectorPanel } from "./InspectorPanel";

function createCommandApprovalRequest(): ReceivedServerRequest {
  return {
    kind: "commandApproval",
    id: "request-3",
    rpcId: "request-3",
    method: "item/commandExecution/requestApproval",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-3",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-3",
      command: "Get-Content src/state/appReducer.ts",
      cwd: "E:/code/codex-app-plus",
      reason: "Allow read-only scan?",
      proposedExecpolicyAmendment: ["allow read-only scans"],
      availableDecisions: [{
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ["allow read-only scans"],
        },
      }, "decline"],
    },
  };
}

function createFileApprovalRequest(): ReceivedServerRequest {
  return {
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
  };
}

function createUserInputRequest(): ReceivedServerRequest {
  return {
    kind: "userInput",
    id: "request-2",
    rpcId: "request-2",
    method: "item/tool/requestUserInput",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-2",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-2",
      questions: [],
    },
    questions: [],
  };
}

describe("InspectorPanel", () => {
  it("offers persistent command approval when the server proposes an execpolicy amendment", () => {
    const onResolveServerRequest = vi.fn().mockResolvedValue(undefined);

    render(
      <InspectorPanel
        activeView="conversation"
        notifications={[]}
        pendingRequests={[createCommandApprovalRequest()]}
        models={[]}
        configSnapshot={null}
        onResolveServerRequest={onResolveServerRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Always allow similar commands" }));

    expect(onResolveServerRequest).toHaveBeenCalledWith({
      kind: "commandApproval",
      requestId: "request-3",
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
      <InspectorPanel
        activeView="conversation"
        notifications={[]}
        pendingRequests={[createFileApprovalRequest()]}
        models={[]}
        configSnapshot={null}
        onResolveServerRequest={onResolveServerRequest}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply for session" }));

    expect(onResolveServerRequest).toHaveBeenCalledWith({
      kind: "fileApproval",
      requestId: "request-1",
      decision: "acceptForSession",
    });
  });

  it("does not offer file session approval for non-approval requests", () => {
    render(
      <InspectorPanel
        activeView="conversation"
        notifications={[]}
        pendingRequests={[createUserInputRequest()]}
        models={[]}
        configSnapshot={null}
        onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole("button", { name: "Apply for session" })).toBeNull();
  });
});
