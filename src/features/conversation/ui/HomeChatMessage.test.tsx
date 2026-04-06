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
    expect(container.querySelector(".home-chat-message-user > .home-chat-message-stack-user")).not.toBeNull();
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
    expect(screen.queryByText("Thinking")).toBeNull();
    expect(assistantChildren).toEqual(["home-chat-message-stack home-chat-message-stack-assistant"]);
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

  it("renders file attachments as read-only clips", () => {
    const { container } = render(
      <HomeChatMessage
        message={{
          id: "user-file-1",
          kind: "userMessage",
          role: "user",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-2",
          text: "",
          status: "done",
          attachments: [{ kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" }],
        }}
      />,
    );

    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(container.querySelector(".home-chat-message-stack-user .home-chat-attachments")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/i })).toBeNull();
  });
});
