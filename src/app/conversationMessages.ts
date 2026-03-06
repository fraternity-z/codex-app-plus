import type { ConversationMessage, ThreadSummary } from "../domain/types";
import type { Thread } from "../protocol/generated/v2/Thread";
import type { Turn } from "../protocol/generated/v2/Turn";
import type { ThreadItem } from "../protocol/generated/v2/ThreadItem";
import type { UserInput } from "../protocol/generated/v2/UserInput";

const AGENTS_PREFIX = "# AGENTS.md instructions for ";
const EMPTY_TEXT = "";
const ENVIRONMENT_CONTEXT_CLOSE_TAG = "</environment_context>";
const ENVIRONMENT_CONTEXT_OPEN_TAG = "<environment_context>";
const INSTRUCTIONS_CLOSE_TAG = "</INSTRUCTIONS>";
const INSTRUCTIONS_OPEN_TAG = "<INSTRUCTIONS>";
const MIN_VISIBLE_MESSAGE_LENGTH = 1;

export function createMessageId(threadId: string, turnId: string, itemId: string): string {
  return `${threadId}:${turnId}:${itemId}`;
}

export function createUserConversationMessage(
  threadId: string,
  turnId: string,
  text: string
): ConversationMessage {
  return {
    id: createMessageId(threadId, turnId, `user-${turnId}`),
    threadId,
    turnId,
    itemId: `user-${turnId}`,
    role: "user",
    text,
    status: "done"
  };
}

export function mapThreadHistoryToMessages(thread: Thread): ReadonlyArray<ConversationMessage> {
  return thread.turns.flatMap((turn) => mapTurnToMessages(thread.id, turn));
}

export function filterVisibleConversationMessages(
  messages: ReadonlyArray<ConversationMessage>
): ReadonlyArray<ConversationMessage> {
  return messages
    .map(normalizeConversationMessage)
    .filter((message): message is ConversationMessage => message !== null);
}

export function replaceThreadMessages(
  messages: ReadonlyArray<ConversationMessage>,
  threadId: string,
  nextMessages: ReadonlyArray<ConversationMessage>
): ReadonlyArray<ConversationMessage> {
  return [...messages.filter((message) => message.threadId !== threadId), ...nextMessages];
}

export function appendAssistantDelta(
  messages: ReadonlyArray<ConversationMessage>,
  threadId: string,
  turnId: string,
  itemId: string,
  delta: string
): ReadonlyArray<ConversationMessage> {
  const id = createMessageId(threadId, turnId, itemId);
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) {
    return [
      ...messages,
      {
        id,
        threadId,
        turnId,
        itemId,
        role: "assistant",
        text: delta,
        status: "streaming"
      }
    ];
  }

  return messages.map((message, currentIndex) =>
    currentIndex === index
      ? {
          ...message,
          text: `${message.text}${delta}`,
          status: "streaming"
        }
      : message
  );
}

export function completeTurnMessages(
  messages: ReadonlyArray<ConversationMessage>,
  threadId: string,
  turnId: string
): ReadonlyArray<ConversationMessage> {
  return messages.map((message) => {
    if (message.threadId !== threadId || message.turnId !== turnId || message.role !== "assistant") {
      return message;
    }
    return { ...message, status: "done" };
  });
}

export function upsertThreadSummary(
  threads: ReadonlyArray<ThreadSummary>,
  nextThread: ThreadSummary
): ReadonlyArray<ThreadSummary> {
  return [nextThread, ...threads.filter((thread) => thread.id !== nextThread.id)];
}

export function normalizeConversationMessage(message: ConversationMessage): ConversationMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  const text = normalizeConversationMessageText(message.role, message.text);
  if (text.trim().length < MIN_VISIBLE_MESSAGE_LENGTH) {
    return null;
  }

  if (text === message.text) {
    return message;
  }

  return { ...message, text };
}

export function isVisibleConversationMessage(message: ConversationMessage): boolean {
  return normalizeConversationMessage(message) !== null;
}

export function normalizeConversationMessageText(
  role: ConversationMessage["role"],
  text: string
): string {
  if (role === "user") {
    return stripInjectedUserContext(text).trim();
  }
  if (role === "assistant") {
    return text.trimEnd();
  }
  return text.trim();
}

function mapTurnToMessages(threadId: string, turn: Turn): ReadonlyArray<ConversationMessage> {
  return turn.items
    .map((item) => mapThreadItemToMessage(threadId, turn.id, item))
    .filter((message): message is ConversationMessage => message !== null);
}

function mapThreadItemToMessage(
  threadId: string,
  turnId: string,
  item: ThreadItem
): ConversationMessage | null {
  if (item.type === "userMessage") {
    return createHistoryUserConversationMessage(threadId, turnId, userInputText(item.content));
  }
  if (item.type === "agentMessage") {
    return {
      id: createMessageId(threadId, turnId, item.id),
      threadId,
      turnId,
      itemId: item.id,
      role: "assistant",
      text: item.text,
      status: "done"
    };
  }
  return null;
}

function createHistoryUserConversationMessage(
  threadId: string,
  turnId: string,
  text: string
): ConversationMessage | null {
  const normalizedText = normalizeConversationMessageText("user", text);
  if (normalizedText.length < MIN_VISIBLE_MESSAGE_LENGTH) {
    return null;
  }

  return {
    id: createMessageId(threadId, turnId, `user-${turnId}`),
    threadId,
    turnId,
    itemId: `user-${turnId}`,
    role: "user",
    text: normalizedText,
    status: "done"
  };
}

function stripInjectedUserContext(text: string): string {
  let nextText = text.trimStart();

  while (true) {
    const strippedText = stripKnownInjectedBlock(nextText);
    if (strippedText === nextText) {
      return nextText;
    }
    nextText = strippedText.trimStart();
  }
}

function stripKnownInjectedBlock(text: string): string {
  if (text.startsWith(AGENTS_PREFIX) && text.includes(INSTRUCTIONS_OPEN_TAG)) {
    return stripTaggedBlock(text, INSTRUCTIONS_CLOSE_TAG);
  }
  if (text.startsWith(ENVIRONMENT_CONTEXT_OPEN_TAG)) {
    return stripTaggedBlock(text, ENVIRONMENT_CONTEXT_CLOSE_TAG);
  }
  return text;
}

function stripTaggedBlock(text: string, closeTag: string): string {
  const closeIndex = text.indexOf(closeTag);
  if (closeIndex < 0) {
    return text;
  }
  return text.slice(closeIndex + closeTag.length);
}

function userInputText(content: ReadonlyArray<UserInput>): string {
  const parts = content
    .map((input) => {
      if (input.type === "text") {
        return input.text;
      }
      if (input.type === "image") {
        return `[image] ${input.url}`;
      }
      if (input.type === "localImage") {
        return `[image] ${input.path}`;
      }
      return EMPTY_TEXT;
    })
    .filter((part) => part.length > 0);
  return parts.join("\n");
}
