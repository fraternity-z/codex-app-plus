import { useEffect, useMemo, useRef } from "react";
import { filterVisibleConversationMessages } from "../../app/conversationMessages";
import type { ConversationMessage, ThreadSummary } from "../../domain/types";
import { ConversationMessageContent } from "./ConversationMessageContent";

interface HomeConversationCanvasProps {
  readonly messages: ReadonlyArray<ConversationMessage>;
  readonly selectedThread: ThreadSummary | null;
}

function ConversationPlaceholder(props: { readonly selectedThread: ThreadSummary | null }): JSX.Element {
  if (props.selectedThread === null) {
    return (
      <div className="home-chat-placeholder">
        <p className="home-chat-placeholder-title">选择工作区后即可开始会话</p>
        <p className="home-chat-placeholder-body">发送第一条消息后，这里会切换成聊天记录视图。</p>
      </div>
    );
  }

  return (
    <div className="home-chat-placeholder">
      <p className="home-chat-placeholder-title">会话已创建</p>
      <p className="home-chat-placeholder-body">发送第一条消息后，聊天内容会显示在这里。</p>
    </div>
  );
}

function contentClassName(message: ConversationMessage): string {
  return message.role === "assistant" ? "home-chat-markdown home-chat-markdown-assistant" : "home-chat-markdown home-chat-markdown-user";
}

function ConversationMessageItem(props: { readonly message: ConversationMessage }): JSX.Element {
  if (props.message.role === "assistant") {
    return (
      <article className="home-chat-message home-chat-message-assistant" aria-label="AI 消息">
        <ConversationMessageContent className={contentClassName(props.message)} message={props.message} />
      </article>
    );
  }

  return (
    <article className="home-chat-message home-chat-message-user" aria-label="用户消息">
      <div className="home-chat-bubble">
        <ConversationMessageContent className={contentClassName(props.message)} message={props.message} />
      </div>
    </article>
  );
}

export function HomeConversationCanvas(props: HomeConversationCanvasProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visibleMessages = useMemo(() => filterVisibleConversationMessages(props.messages), [props.messages]);
  const lastMessage = visibleMessages[visibleMessages.length - 1] ?? null;
  const scrollKey = useMemo(() => {
    if (lastMessage === null) {
      return props.selectedThread?.id ?? "empty";
    }
    return `${lastMessage.id}:${lastMessage.status}:${lastMessage.text.length}`;
  }, [lastMessage, props.selectedThread]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [scrollKey]);

  return (
    <main className="home-conversation" aria-label="会话内容">
      <div ref={scrollRef} className="home-conversation-scroll">
        <div className="home-conversation-thread">
          {visibleMessages.length === 0 ? <ConversationPlaceholder selectedThread={props.selectedThread} /> : null}
          {visibleMessages.map((message) => (
            <ConversationMessageItem key={message.id} message={message} />
          ))}
        </div>
      </div>
    </main>
  );
}
