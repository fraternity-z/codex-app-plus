import type { ReceivedServerRequest } from "../domain/serverRequests";
import { appReducer, createInitialState } from "./appReducer";
import { describe, expect, it } from "vitest";

function createUserInputRequest(): ReceivedServerRequest {
  return {
    kind: "userInput",
    id: "request-user-input",
    rpcId: "request-user-input",
    method: "item/tool/requestUserInput",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      questions: [],
    },
    questions: [],
  };
}

function createTokenRefreshRequest(): ReceivedServerRequest {
  return {
    kind: "tokenRefresh",
    id: "request-token-refresh",
    rpcId: "request-token-refresh",
    method: "account/chatgptAuthTokens/refresh",
    threadId: null,
    turnId: null,
    itemId: null,
    params: {
      reason: "unauthorized",
      previousAccountId: "account-1",
    },
  };
}

function createStateWithPendingRequests() {
  const withUserInput = appReducer(createInitialState(), {
    type: "serverRequest/received",
    request: createUserInputRequest(),
  });
  return appReducer(withUserInput, {
    type: "serverRequest/received",
    request: createTokenRefreshRequest(),
  });
}

describe("appReducer transient request resets", () => {
  it("clears pending requests and token refresh state when the connection drops", () => {
    const state = createStateWithPendingRequests();

    const disconnected = appReducer(state, { type: "connection/changed", status: "disconnected" });

    expect(disconnected.pendingRequestsById).toEqual({});
    expect(disconnected.pendingRequestsByConversationId).toEqual({});
    expect(disconnected.tokenRefresh).toEqual(createInitialState().tokenRefresh);
  });

  it("clears pending requests and token refresh state after a fatal error", () => {
    const state = createStateWithPendingRequests();

    const failed = appReducer(state, { type: "fatal/error", message: "boom" });

    expect(failed.pendingRequestsById).toEqual({});
    expect(failed.pendingRequestsByConversationId).toEqual({});
    expect(failed.tokenRefresh).toEqual(createInitialState().tokenRefresh);
    expect(failed.fatalError).toBe("boom");
  });
});
