import { describe, expect, it } from "vitest";
import {
  appendAssistantDelta,
  completeTurnMessages,
  filterVisibleConversationMessages,
  mapThreadHistoryToMessages,
  normalizeConversationMessage,
  normalizeConversationMessageText
} from "./conversationMessages";
import { serializeComposerFileReferenceDraft } from "../../composer/model/composerFileReferences";

describe("conversationMessages", () => {
  it("maps thread history into user and assistant messages", () => {
    const thread = {
      id: "thread-1",
      turns: [
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-1",
              content: [
                { type: "text", text: "hello", text_elements: [] },
                { type: "image", url: "data:image/png;base64,aGVsbG8=" }
              ]
            },
            { type: "agentMessage", id: "assistant-1", text: "world", phase: null }
          ]
        }
      ]
    } as const;

    const messages = mapThreadHistoryToMessages(thread as never);

    expect(messages.map((message) => `${message.role}:${message.text}`)).toEqual(["user:hello", "assistant:world"]);
    expect(messages[0]?.attachments).toHaveLength(1);
  });

  it("maps mention inputs into file attachments", () => {
    const thread = {
      id: "thread-1",
      turns: [{
        id: "turn-1",
        items: [{
          type: "userMessage",
          id: "user-1",
          content: [{ type: "mention", name: "notes.md", path: "E:/code/codex-app-plus/notes.md" }],
        }],
      }],
    } as const;

    const messages = mapThreadHistoryToMessages(thread as never);

    expect(messages[0]?.attachments).toEqual([{ kind: "file", source: "mention", name: "notes.md", value: "E:/code/codex-app-plus/notes.md" }]);
  });

  it("keeps file references as chips when text and mention inputs are both present", () => {
    const thread = {
      id: "thread-1",
      turns: [{
        id: "turn-1",
        items: [{
          type: "userMessage",
          id: "user-1",
          content: [
            { type: "text", text: "读取文件内容\n\ndocs/notes.md", text_elements: [] },
            { type: "mention", name: "notes.md", path: "docs/notes.md" },
          ],
        }],
      }],
    } as const;

    const messages = mapThreadHistoryToMessages(thread as never);

    expect(messages[0]?.text).toBe("读取文件内容");
    expect(messages[0]?.attachments).toEqual([
      { kind: "file", source: "mention", name: "notes.md", value: "docs/notes.md" },
    ]);
  });

  it("aggregates assistant delta into one message bubble", () => {
    const messages = appendAssistantDelta([], "thread-1", "turn-1", "item-1", "Hello");
    const merged = appendAssistantDelta(messages, "thread-1", "turn-1", "item-1", " world");

    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toBe("Hello world");
    expect(merged[0]?.status).toBe("streaming");
  });

  it("marks assistant messages as done when turn completes", () => {
    const messages = appendAssistantDelta([], "thread-1", "turn-1", "item-1", "Hello");
    const completed = completeTurnMessages(messages, "thread-1", "turn-1");

    expect(completed[0]?.status).toBe("done");
  });

  it("filters system and empty messages from the conversation view", () => {
    const messages = [
      { id: "assistant-1", threadId: "thread-1", turnId: "turn-1", itemId: "item-1", role: "assistant", text: "done", status: "done" },
      { id: "system-1", threadId: "thread-1", turnId: "turn-1", itemId: "item-2", role: "system", text: "hidden", status: "done" },
      { id: "user-1", threadId: "thread-1", turnId: "turn-2", itemId: "item-3", role: "user", text: "   ", status: "done" },
      { id: "user-2", threadId: "thread-1", turnId: "turn-3", itemId: "item-4", role: "user", text: "", status: "done", attachments: [{ kind: "image", source: "dataUrl", value: "data:image/png;base64,aGVsbG8=" }] }
    ] as const;

    expect(filterVisibleConversationMessages(messages as never).map((message) => message.id)).toEqual(["assistant-1", "user-2"]);
  });

  it("extracts embedded base64 images from user text during normalization", () => {
    const message = normalizeConversationMessage({
      id: "user-1",
      kind: "userMessage",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      role: "user",
      text: "请看这张图\n\ndata:image/png;base64,aGVsbG8=",
      status: "done"
    });

    expect(message?.text).toBe("请看这张图");
    expect(message?.attachments).toHaveLength(1);
  });

  it("extracts hidden file reference markers into chips during normalization", () => {
    const message = normalizeConversationMessage({
      id: "user-1",
      kind: "userMessage",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "item-1",
      role: "user",
      text: serializeComposerFileReferenceDraft("读取文件内容", ["docs/notes.md"]),
      status: "done",
    });

    expect(message?.text).toBe("读取文件内容");
    expect(message?.attachments).toEqual([
      { kind: "file", source: "mention", name: "notes.md", value: "docs/notes.md" },
    ]);
  });

  it("strips injected AGENTS and environment context from loaded user messages", () => {
    const text = [
      "# AGENTS.md instructions for E:\\code\\boai",
      "",
      "<INSTRUCTIONS>",
      "Global rules",
      "</INSTRUCTIONS>",
      "<environment_context>",
      "  <cwd>E:\\code\\boai</cwd>",
      "</environment_context>",
      "请优化接口查询性能"
    ].join("\n");

    expect(normalizeConversationMessageText("user", text)).toBe("请优化接口查询性能");
  });

  it("strips permissions instructions from loaded user messages", () => {
    const text = [
      "<permissions instructions>",
      "Filesystem sandboxing defines which files can be read or written.",
      "</permissions instructions>",
      "请修复聊天标题来源"
    ].join("\n");

    expect(normalizeConversationMessageText("user", text)).toBe("请修复聊天标题来源");
  });
});
