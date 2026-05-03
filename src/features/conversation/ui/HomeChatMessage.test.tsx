import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18nWrapper } from "../../../test/createI18nWrapper";
import { FileLinkProvider, type FileLinkActions } from "../hooks/fileLinkContext";
import { HomeChatMessage } from "./HomeChatMessage";

const I18nWrapper = createI18nWrapper("zh-CN");

function renderMessage(
  element: JSX.Element,
  options: { readonly fileLinkActions?: FileLinkActions } = {},
) {
  const tree = options.fileLinkActions ? (
    <FileLinkProvider value={options.fileLinkActions}>{element}</FileLinkProvider>
  ) : element;
  return render(tree, { wrapper: I18nWrapper });
}

describe("HomeChatMessage", () => {
  it("renders image previews above the user bubble", () => {
    const dataUrl = "data:image/png;base64,aGVsbG8=";

    const { container } = renderMessage(
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

  it("opens user image previews in the shared zoom dialog", () => {
    renderMessage(
      <HomeChatMessage
        message={{
          id: "user-image-preview-1",
          kind: "userMessage",
          role: "user",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          text: "请放大这张图",
          status: "done",
          attachments: [{ kind: "image", source: "dataUrl", value: "data:image/png;base64,aGVsbG8=" }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "放大查看用户图片" }));
    expect(screen.getByRole("dialog", { name: "用户图片预览" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭图片预览" }));
    expect(screen.queryByRole("dialog", { name: "用户图片预览" })).toBeNull();
  });

  it("renders assistant content without an inline thinking footer", () => {
    const { container } = renderMessage(
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

  it("does not convert user message file paths into clickable file links", () => {
    const fileLinkActions = {
      openFileLink: vi.fn(),
      openExternalLink: vi.fn(),
      workspacePath: "E:/code/codex-app-plus",
    };

    const { container } = renderMessage(
      <HomeChatMessage
        message={{
          id: "user-path-1",
          kind: "userMessage",
          role: "user",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-user",
          text: "第一，这个用户消息不应该解析 src/features/conversation/ui/HomeChatMessage.tsx:95",
          status: "done",
        }}
      />,
      { fileLinkActions },
    );

    expect(container.querySelector(".home-chat-message-user .message-file-link")).toBeNull();
    expect(container.querySelector(".home-chat-message-user a[href^='codex-file:']")).toBeNull();
    expect(container.textContent).toContain("src/features/conversation/ui/HomeChatMessage.tsx:95");
  });

  it("keeps assistant file paths clickable", () => {
    const fileLinkActions = {
      openFileLink: vi.fn(),
      openExternalLink: vi.fn(),
      workspacePath: "E:/code/codex-app-plus",
    };

    const { container } = renderMessage(
      <HomeChatMessage
        message={{
          id: "assistant-path-1",
          kind: "agentMessage",
          role: "assistant",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-assistant",
          text: "已修改 src/features/conversation/ui/HomeChatMessage.tsx:95",
          status: "done",
        }}
      />,
      { fileLinkActions },
    );

    const fileLink = container.querySelector(".home-chat-message-assistant .message-file-link");

    expect(fileLink).not.toBeNull();
    expect(fileLink?.getAttribute("href")).toContain("codex-file:");
  });

  it("does not render an empty assistant body", () => {
    const { container } = renderMessage(
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
    const { container } = renderMessage(
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

  it("shows copy and edit actions for user messages", () => {
    renderMessage(
      <HomeChatMessage
        message={{
          id: "user-action-1",
          kind: "userMessage",
          role: "user",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-user",
          text: "可以编辑的消息",
          status: "done",
        }}
        canEdit
        onCopyMessage={vi.fn()}
        onEditUserMessage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: "复制消息" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑消息" })).toBeInTheDocument();
  });

  it("shows only copy for assistant messages", () => {
    renderMessage(
      <HomeChatMessage
        message={{
          id: "assistant-action-1",
          kind: "agentMessage",
          role: "assistant",
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-assistant",
          text: "AI 回复",
          status: "done",
        }}
        canEdit
        onCopyMessage={vi.fn()}
        onEditUserMessage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: "复制消息" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑消息" })).toBeNull();
  });

  it("submits edited user text while preserving the message object", async () => {
    const onEditUserMessage = vi.fn().mockResolvedValue(undefined);
    const message = {
      id: "user-edit-1",
      kind: "userMessage" as const,
      role: "user" as const,
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-user",
      text: "原始消息",
      status: "done" as const,
      attachments: [{ kind: "file" as const, source: "mention" as const, name: "notes.md", value: "E:/repo/notes.md" }],
    };

    renderMessage(
      <HomeChatMessage
        message={message}
        canEdit
        onCopyMessage={vi.fn()}
        onEditUserMessage={onEditUserMessage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑消息" }));
    expect(screen.queryByText("原始消息", { selector: "p" })).toBeNull();
    expect(screen.getByRole("textbox")).toHaveValue("原始消息");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "编辑后的消息" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(onEditUserMessage).toHaveBeenCalledWith(message, "编辑后的消息"));
  });

  it("hides edit for user messages without a turn id", () => {
    renderMessage(
      <HomeChatMessage
        message={{
          id: "user-no-turn-1",
          kind: "userMessage",
          role: "user",
          threadId: "thread-1",
          turnId: null,
          itemId: "item-user",
          text: "不能编辑",
          status: "done",
        }}
        canEdit
        onCopyMessage={vi.fn()}
        onEditUserMessage={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: "复制消息" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑消息" })).toBeNull();
  });
});
