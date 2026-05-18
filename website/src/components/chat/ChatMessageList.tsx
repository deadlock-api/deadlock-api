import { useEffect, useRef } from "react";

import type { Message, ToolExecution } from "~/types/chat";

import { ChatMessage } from "./ChatMessage";

interface ChatMessageListProps {
  messages: Message[];
  currentStreamingMessage?: string;
  isStreaming?: boolean;
  activeTools?: ToolExecution[];
}

export function ChatMessageList({
  messages,
  currentStreamingMessage,
  isStreaming,
  activeTools = [],
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messageCount = messages.length;
  const lastMessageId = messages[messages.length - 1]?.id;
  const streamingLength = currentStreamingMessage?.length ?? 0;
  const toolCount = activeTools.length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: derived scalars intentionally used instead of object deps
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount, lastMessageId, streamingLength, toolCount]);

  const streamingMessage: Message | null = isStreaming
    ? {
        id: "streaming-message",
        role: "assistant",
        content: currentStreamingMessage || "",
        timestamp: messages[messages.length - 1]?.timestamp ?? 0,
        isStreaming: true,
        tools: activeTools.length > 0 ? activeTools : undefined,
      }
    : null;

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
        {streamingMessage && (
          <ChatMessage
            key="streaming"
            message={streamingMessage}
            isStreaming
            streamingContent={currentStreamingMessage}
          />
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
