import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeChatMessage } from "./HomeChatMessage";

describe("HomeChatMessage", () => {
  it("renders image previews above the user bubble", () => {
    const dataUrl = "data:image/png;base64,aGVsbG8=";

    const { container } = render(
      <HomeChatMessage
        message={{
          id: "user-1",
          kind: "userMessage",
          role: "user",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          text: "请看附件",
          status: "done",
          attachments: [{ kind: "image", source: "dataUrl", value: dataUrl }],
        }}
      />,
    );

    expect(screen.getByText("请看附件")).toBeInTheDocument();
    expect(container.querySelector(".home-chat-attachments img")?.getAttribute("src")).toBe(dataUrl);
  });

  it("renders assistant content without an inline thinking footer", () => {
    const { container } = render(
      <HomeChatMessage
        message={{
          id: "assistant-1",
          kind: "agentMessage",
          role: "assistant",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          text: "正在输出正文",
          status: "streaming",
        }}
      />,
    );

    const assistantChildren = Array.from(container.querySelector(".home-chat-message-assistant")?.children ?? []).map(
      (element) => (element as HTMLElement).className,
    );

    expect(screen.getByText("正在输出正文")).toBeInTheDocument();
    expect(screen.queryByText("正在思考")).toBeNull();
    expect(assistantChildren).toEqual(["home-chat-message-body"]);
  });

  it("does not render an empty assistant body", () => {
    const { container } = render(
      <HomeChatMessage
        message={{
          id: "assistant-placeholder-1",
          kind: "agentMessage",
          role: "assistant",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: null,
          text: "",
          status: "streaming",
        }}
      />,
    );

    expect(container.querySelector(".home-chat-message-body")).toBeNull();
    expect(container.querySelector(".home-chat-thinking-footer")).toBeNull();
  });
});
