import type { ConversationMessage, ThreadSummary } from "../../../domain/types";
import type { Thread } from "../../../protocol/generated/v2/Thread";
import type { Turn } from "../../../protocol/generated/v2/Turn";
import type { ThreadItem } from "../../../protocol/generated/v2/ThreadItem";
import { extractImageAttachmentsFromText, summarizeUserInputs } from "./conversationUserInput";

const AGENTS_PREFIX = "# AGENTS.md instructions for ";
const APP_CONTEXT_CLOSE_TAG = "</app-context>";
const APP_CONTEXT_OPEN_TAG = "<app-context>";
const COLLABORATION_MODE_CLOSE_TAG = "</collaboration_mode>";
const COLLABORATION_MODE_OPEN_TAG = "<collaboration_mode>";
const INSTRUCTIONS_CLOSE_TAG = "</INSTRUCTIONS>";
const INSTRUCTIONS_OPEN_TAG = "<INSTRUCTIONS>";
const MIN_VISIBLE_MESSAGE_LENGTH = 1;
const PERMISSIONS_INSTRUCTIONS_CLOSE_TAG = "</permissions instructions>";
const PERMISSIONS_INSTRUCTIONS_OPEN_TAG = "<permissions instructions>";
const ENVIRONMENT_CONTEXT_CLOSE_TAG = "</environment_context>";
const ENVIRONMENT_CONTEXT_OPEN_TAG = "<environment_context>";

export function createMessageId(threadId: string, turnId: string, itemId: string): string {
  return `${threadId}:${turnId}:${itemId}`;
}

export function createUserConversationMessage(
  threadId: string,
  turnId: string,
  text: string,
): ConversationMessage {
  const summary = extractImageAttachmentsFromText(normalizeConversationMessageText("user", text));
  return {
    id: createMessageId(threadId, turnId, `user-${turnId}`),
    kind: "userMessage",
    threadId,
    turnId,
    itemId: `user-${turnId}`,
    role: "user",
    text: summary.text,
    status: "done",
    attachments: summary.attachments,
  };
}

export function mapThreadHistoryToMessages(thread: Thread): ReadonlyArray<ConversationMessage> {
  return thread.turns.flatMap((turn) => mapTurnToMessages(thread.id, turn));
}

export function filterVisibleConversationMessages(
  messages: ReadonlyArray<ConversationMessage>,
): ReadonlyArray<ConversationMessage> {
  return messages.map(normalizeConversationMessage).filter(isConversationMessage);
}

export function replaceThreadMessages(
  messages: ReadonlyArray<ConversationMessage>,
  threadId: string,
  nextMessages: ReadonlyArray<ConversationMessage>,
): ReadonlyArray<ConversationMessage> {
  return [...messages.filter((message) => message.threadId !== threadId), ...nextMessages];
}

export function appendAssistantDelta(
  messages: ReadonlyArray<ConversationMessage>,
  threadId: string,
  turnId: string,
  itemId: string,
  delta: string,
): ReadonlyArray<ConversationMessage> {
  const id = createMessageId(threadId, turnId, itemId);
  const index = messages.findIndex((message) => message.id === id);
  if (index === -1) {
    return [...messages, { id, kind: "agentMessage", threadId, turnId, itemId, role: "assistant", text: delta, status: "streaming" }];
  }
  return messages.map((message, currentIndex) =>
    currentIndex === index ? { ...message, text: `${message.text}${delta}`, status: "streaming" } : message,
  );
}

export function completeTurnMessages(
  messages: ReadonlyArray<ConversationMessage>,
  threadId: string,
  turnId: string,
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
  nextThread: ThreadSummary,
): ReadonlyArray<ThreadSummary> {
  return [nextThread, ...threads.filter((thread) => thread.id !== nextThread.id)];
}

export function normalizeConversationMessage(message: ConversationMessage): ConversationMessage | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }
  if (message.role === "assistant") {
    return normalizeAssistantMessage(message);
  }
  return normalizeUserMessage(message);
}

export function isVisibleConversationMessage(message: ConversationMessage): boolean {
  return normalizeConversationMessage(message) !== null;
}

export function normalizeConversationMessageText(
  role: ConversationMessage["role"],
  text: string,
): string {
  if (role === "user") {
    return stripInjectedUserContext(text).trim();
  }
  if (role === "assistant") {
    return text.trimEnd();
  }
  return text.trim();
}

function normalizeAssistantMessage(message: ConversationMessage): ConversationMessage | null {
  const text = normalizeConversationMessageText("assistant", message.text);
  if (text.trim().length < MIN_VISIBLE_MESSAGE_LENGTH) {
    return null;
  }
  return text === message.text ? message : { ...message, text };
}

function normalizeUserMessage(message: ConversationMessage): ConversationMessage | null {
  const text = normalizeConversationMessageText("user", message.text);
  const summary = extractImageAttachmentsFromText(text);
  const attachments = mergeAttachments(message.attachments, summary.attachments);
  if (summary.text.trim().length < MIN_VISIBLE_MESSAGE_LENGTH && attachments.length === 0) {
    return null;
  }
  if (summary.text === message.text && attachments.length === (message.attachments ?? []).length) {
    return message;
  }
  return { ...message, text: summary.text, attachments };
}

function mapTurnToMessages(threadId: string, turn: Turn): ReadonlyArray<ConversationMessage> {
  return turn.items.map((item) => mapThreadItemToMessage(threadId, turn.id, item)).filter(isConversationMessage);
}

function mapThreadItemToMessage(
  threadId: string,
  turnId: string,
  item: ThreadItem,
): ConversationMessage | null {
  if (item.type === "userMessage") {
    const summary = summarizeUserInputs(item.content);
    return createHistoryUserConversationMessage(threadId, turnId, summary.text, summary.attachments);
  }
  if (item.type === "agentMessage") {
    return { id: createMessageId(threadId, turnId, item.id), kind: "agentMessage", threadId, turnId, itemId: item.id, role: "assistant", text: item.text, status: "done" };
  }
  return null;
}

function createHistoryUserConversationMessage(
  threadId: string,
  turnId: string,
  text: string,
  attachments: ConversationMessage["attachments"],
): ConversationMessage | null {
  const normalizedText = normalizeConversationMessageText("user", text);
  if (normalizedText.length < MIN_VISIBLE_MESSAGE_LENGTH && (attachments?.length ?? 0) === 0) {
    return null;
  }
  return {
    id: createMessageId(threadId, turnId, `user-${turnId}`),
    kind: "userMessage",
    threadId,
    turnId,
    itemId: `user-${turnId}`,
    role: "user",
    text: normalizedText,
    status: "done",
    attachments,
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
  if (text.startsWith(PERMISSIONS_INSTRUCTIONS_OPEN_TAG)) {
    return stripTaggedBlock(text, PERMISSIONS_INSTRUCTIONS_CLOSE_TAG);
  }
  if (text.startsWith(ENVIRONMENT_CONTEXT_OPEN_TAG)) {
    return stripTaggedBlock(text, ENVIRONMENT_CONTEXT_CLOSE_TAG);
  }
  if (text.startsWith(APP_CONTEXT_OPEN_TAG)) {
    return stripTaggedBlock(text, APP_CONTEXT_CLOSE_TAG);
  }
  if (text.startsWith(COLLABORATION_MODE_OPEN_TAG)) {
    return stripTaggedBlock(text, COLLABORATION_MODE_CLOSE_TAG);
  }
  return text;
}

function stripTaggedBlock(text: string, closeTag: string): string {
  const closeIndex = text.indexOf(closeTag);
  return closeIndex < 0 ? text : text.slice(closeIndex + closeTag.length);
}

function mergeAttachments(
  current: ConversationMessage["attachments"],
  next: ConversationMessage["attachments"],
): ReadonlyArray<NonNullable<ConversationMessage["attachments"]>[number]> {
  return [...(current ?? []), ...(next ?? [])];
}

function isConversationMessage(message: ConversationMessage | null): message is ConversationMessage {
  return message !== null;
}
