import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PendingUserInputEntry } from "../../domain/timeline";
import { HomeUserInputPrompt } from "./HomeUserInputPrompt";

function createEntry(overrides?: Partial<PendingUserInputEntry>): PendingUserInputEntry {
  const questions = overrides?.request?.questions
    ? [...overrides.request.questions]
    : [
    {
      id: "scope",
      header: "范围",
      question: "请选择处理范围",
      isOther: false,
      isSecret: false,
      options: [{ label: "主画布", description: "只改主画布" }],
    },
  ];

  return {
    id: "request-entry-1",
    kind: "pendingUserInput",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-request-1",
    requestId: "request-1",
    request: {
      kind: "userInput",
      id: "request-1",
      rpcId: "request-1",
      method: "item/tool/requestUserInput",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-request-1",
      questions,
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-request-1",
        questions,
      },
    },
    ...overrides,
  };
}

describe("HomeUserInputPrompt", () => {
  it("auto-advances between option questions and submits the aggregated answers", async () => {
    const onResolveServerRequest = vi.fn().mockResolvedValue(undefined);
    const entry = createEntry({
      request: {
        ...createEntry().request,
        questions: [
          {
            id: "scope",
            header: "范围",
            question: "请选择处理范围",
            isOther: false,
            isSecret: false,
            options: [{ label: "主画布", description: "只改主画布" }],
          },
          {
            id: "mode",
            header: "修改方式",
            question: "请选择变更方式",
            isOther: false,
            isSecret: false,
            options: [{ label: "最小改动", description: "只修正当前问题" }],
          },
        ],
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-request-1",
          questions: [
            {
              id: "scope",
              header: "范围",
              question: "请选择处理范围",
              isOther: false,
              isSecret: false,
              options: [{ label: "主画布", description: "只改主画布" }],
            },
            {
              id: "mode",
              header: "修改方式",
              question: "请选择变更方式",
              isOther: false,
              isSecret: false,
              options: [{ label: "最小改动", description: "只修正当前问题" }],
            },
          ],
        },
      },
    });

    render(
      <HomeUserInputPrompt
        busy={false}
        entry={entry}
        onResolveServerRequest={onResolveServerRequest}
      />,
    );

    expect(screen.getByText("1/2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /主画布/ }));

    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText("请选择变更方式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "提交答案" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /最小改动/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    await waitFor(() => expect(onResolveServerRequest).toHaveBeenCalledWith({
      kind: "userInput",
      requestId: "request-1",
      answers: {
        scope: ["主画布"],
        mode: ["最小改动"],
      },
    }));
  });

  it("preserves free-text answers when navigating between questions", () => {
    const entry = createEntry({
      request: {
        ...createEntry().request,
        questions: [
          {
            id: "scope",
            header: "范围",
            question: "请选择处理范围",
            isOther: false,
            isSecret: false,
            options: [{ label: "主画布", description: "只改主画布" }],
          },
          {
            id: "notes",
            header: "补充说明",
            question: "还有什么特别要求？",
            isOther: true,
            isSecret: false,
            options: [{ label: "没有", description: "直接按默认处理" }],
          },
        ],
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-request-1",
          questions: [
            {
              id: "scope",
              header: "范围",
              question: "请选择处理范围",
              isOther: false,
              isSecret: false,
              options: [{ label: "主画布", description: "只改主画布" }],
            },
            {
              id: "notes",
              header: "补充说明",
              question: "还有什么特别要求？",
              isOther: true,
              isSecret: false,
              options: [{ label: "没有", description: "直接按默认处理" }],
            },
          ],
        },
      },
    });

    render(
      <HomeUserInputPrompt
        busy={false}
        entry={entry}
        onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /主画布/ }));
    fireEvent.change(screen.getByPlaceholderText("输入你的回答"), { target: { value: "只改标题" } });
    fireEvent.click(screen.getByRole("button", { name: "上一题" }));
    fireEvent.click(screen.getByRole("button", { name: "下一题" }));

    expect(screen.getByDisplayValue("只改标题")).toBeInTheDocument();
  });

  it("renders secret questions with a password field", () => {
    const entry = createEntry({
      request: {
        ...createEntry().request,
        questions: [
          {
            id: "token",
            header: "令牌",
            question: "请输入访问令牌",
            isOther: true,
            isSecret: true,
            options: null,
          },
        ],
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-request-1",
          questions: [
            {
              id: "token",
              header: "令牌",
              question: "请输入访问令牌",
              isOther: true,
              isSecret: true,
              options: null,
            },
          ],
        },
      },
    });

    render(
      <HomeUserInputPrompt
        busy={false}
        entry={entry}
        onResolveServerRequest={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByPlaceholderText("请输入答案")).toHaveAttribute("type", "password");
  });
});
