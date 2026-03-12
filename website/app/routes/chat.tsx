import { usePostHog } from "@posthog/react";
import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { Suspense, lazy, useCallback, useState } from "react";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import type { MetaFunction } from "react-router";

import { ChatInput } from "~/components/chat/ChatInput";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { useChatStream } from "~/hooks/useChatStream";
import { useRateLimit } from "~/hooks/useRateLimit";
import { IS_DEV } from "~/lib/constants";
import { createPageMeta } from "~/lib/meta";

const ChatError = lazy(() => import("~/components/chat/ChatError").then((m) => ({ default: m.ChatError })));
const ChatMessageList = lazy(() =>
  import("~/components/chat/ChatMessageList").then((m) => ({ default: m.ChatMessageList })),
);
const TurnstileVerification = lazy(() =>
  import("~/components/chat/TurnstileVerification").then((m) => ({ default: m.TurnstileVerification })),
);

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "AI Chat Assistant | Deadlock API",
    description: "Ask questions about Deadlock heroes, items, and strategies with the AI chat assistant.",
    path: "/chat",
  });
};

export default function ChatPage() {
  // In development, bypass Turnstile verification
  const [turnstileToken, setTurnstileToken] = useState<string | null>(IS_DEV ? "DEV_BYPASS" : null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const posthog = usePostHog();

  const rateLimit = useRateLimit();

  const { conversation, sendMessage, stopStreaming, clearConversation, clearError } = useChatStream({
    turnstileToken,
    onRateLimitHeaders: rateLimit.syncFromHeaders,
  });

  const hasMessages = conversation.messages.length > 0;
  const isVerified = turnstileToken !== null;

  const handleTurnstileVerified = (token: string) => {
    setTurnstileToken(token);
  };

  const handleSendMessage = (message: string) => {
    setLastMessage(message);
    posthog?.capture("chat_message_sent", { message_length: message.length });
    sendMessage(message);
  };

  const handleNewConversation = () => {
    clearConversation();
    setLastMessage(null);
    posthog?.capture("chat_conversation_cleared", { previous_message_count: conversation.messages.length });
  };

  const handleDismissError = useCallback(() => {
    clearError();
  }, [clearError]);

  const handleRetry = useCallback(() => {
    if (lastMessage) {
      clearError();
      sendMessage(lastMessage);
    }
  }, [lastMessage, clearError, sendMessage]);

  const handleReVerify = useCallback(() => {
    clearError();
    // In development, just reset to bypass token
    setTurnstileToken(IS_DEV ? "DEV_BYPASS" : null);
  }, [clearError]);

  return (
    <div className="flex h-[85vh] w-full flex-col">
      {/* Chat header with New Conversation button */}
      {isVerified && hasMessages && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <span className="text-sm font-medium">Deadlock AI</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleNewConversation} disabled={conversation.isStreaming}>
            <RotateCcw className="mr-2 h-4 w-4" />
            New Conversation
          </Button>
        </div>
      )}

      {/* Chat container */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!isVerified ? (
          // Turnstile verification required
          <div className="flex flex-1 items-center justify-center p-4">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <TurnstileVerification onVerified={handleTurnstileVerified} />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        ) : !hasMessages ? (
          // Empty state - Welcome message
          <div className="flex flex-1 items-center justify-center p-4">
            <div className="w-full max-w-lg space-y-6">
              <div className="space-y-3 text-center">
                <div className="flex items-center justify-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                    <Sparkles className="size-7 text-primary" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Deadlock AI Assistant</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Ask me anything about Deadlock — hero builds, item recommendations, game mechanics, match
                    statistics, and more.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Message list area
          <ChunkErrorBoundary>
            <Suspense fallback={<LoadingLogo />}>
              <ChatMessageList
              messages={conversation.messages}
              currentStreamingMessage={conversation.currentStreamingMessage}
              isStreaming={conversation.isStreaming}
              activeTools={conversation.activeTools}
            />
            </Suspense>
          </ChunkErrorBoundary>
        )}

        {/* Error display - shown when there's an error */}
        {conversation.error && isVerified && (
          <div className="border-t px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <ChunkErrorBoundary>
                <Suspense fallback={<LoadingLogo />}>
                  <ChatError
                  error={conversation.error}
                  onDismiss={handleDismissError}
                  onRetry={lastMessage ? handleRetry : undefined}
                  onReVerify={handleReVerify}
                  resetTime={rateLimit.timeUntilReset}
                />
                </Suspense>
              </ChunkErrorBoundary>
            </div>
          </div>
        )}

        {/* Input area - shown only when verified */}
        {isVerified ? (
          <ChatInput
            onSendMessage={handleSendMessage}
            onStopStreaming={stopStreaming}
            isStreaming={conversation.isStreaming}
            placeholder="Ask about Deadlock heroes, items, strategies..."
          />
        ) : (
          <div className="border-t p-4">
            <div className="mx-auto max-w-3xl">
              <p className="text-center text-sm text-muted-foreground">
                Complete Turnstile verification to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
