import { Bot, Coins, User } from "lucide-react";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { Message, TokenUsage } from "~/types/chat";

import { MarkdownContent } from "./MarkdownContent";
import { ToolIndicatorList } from "./ToolIndicator";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
}

export function ChatMessage({ message, isStreaming, streamingContent }: ChatMessageProps) {
  const isUser = message.role === "user";
  const displayContent = isStreaming && streamingContent !== undefined ? streamingContent : message.content;

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <Avatar className={cn("size-8 shrink-0", isUser ? "bg-primary" : "bg-muted")}>
        <AvatarFallback
          className={cn(isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
        >
          {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Message bubble */}
      <div className={cn("flex max-w-[90%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
        {/* Tools used for this message (shown above the bubble for assistant messages) */}
        {!isUser && message.tools && message.tools.length > 0 && (
          <div className="mb-1">
            <ToolIndicatorList tools={message.tools} />
          </div>
        )}
        <div
          className={cn(
            "rounded-lg px-4 py-2 text-sm",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {displayContent ? (
            isUser ? (
              displayContent
            ) : (
              <MarkdownContent content={displayContent} />
            )
          ) : (
            isStreaming && <TypingIndicator />
          )}
        </div>
        {isStreaming && displayContent && <TypingIndicator />}
        {/* Token usage indicator */}
        {!isUser && message.usage && <TokenUsageIndicator usage={message.usage} />}
      </div>
    </div>
  );
}

function TokenUsageIndicator({ usage }: { usage: TokenUsage }) {
  const totalTokens = usage.input_tokens + usage.output_tokens;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex cursor-default items-center gap-1 px-1 text-xs text-muted-foreground/60">
          <Coins className="size-3" />
          <span>{totalTokens.toLocaleString()} tokens</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="border bg-popover text-popover-foreground shadow-md">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">Input</span>
          <span className="font-mono">{usage.input_tokens.toLocaleString()}</span>
          <span className="text-muted-foreground">Output</span>
          <span className="font-mono">{usage.output_tokens.toLocaleString()}</span>
          {usage.cache_read_tokens > 0 && (
            <>
              <span className="text-muted-foreground">Cache read</span>
              <span className="font-mono">{usage.cache_read_tokens.toLocaleString()}</span>
            </>
          )}
          {usage.cache_creation_tokens > 0 && (
            <>
              <span className="text-muted-foreground">Cache write</span>
              <span className="font-mono">{usage.cache_creation_tokens.toLocaleString()}</span>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <span className="size-2 animate-[typing-bounce_1.4s_ease-in-out_infinite] rounded-full bg-muted-foreground/70" />
      <span className="size-2 animate-[typing-bounce_1.4s_ease-in-out_0.2s_infinite] rounded-full bg-muted-foreground/70" />
      <span className="size-2 animate-[typing-bounce_1.4s_ease-in-out_0.4s_infinite] rounded-full bg-muted-foreground/70" />
    </div>
  );
}
