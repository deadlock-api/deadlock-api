import { createFileRoute } from "@tanstack/react-router";
import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { Suspense, lazy, useCallback, useState } from "react";

import { ChatInput } from "~/components/chat/ChatInput";
import { ChunkErrorBoundary } from "~/components/ChunkErrorBoundary";
import { LoadingLogo } from "~/components/LoadingLogo";
import { Button } from "~/components/ui/button";
import { useChatStream } from "~/hooks/useChatStream";
import { useRateLimit } from "~/hooks/useRateLimit";
import { IS_DEV } from "~/lib/constants";
import { seo } from "~/lib/seo";

const ChatError = lazy(() => import("~/components/chat/ChatError").then((m) => ({ default: m.ChatError })));
const ChatMessageList = lazy(() =>
  import("~/components/chat/ChatMessageList").then((m) => ({ default: m.ChatMessageList })),
);
const TurnstileVerification = lazy(() =>
  import("~/components/chat/TurnstileVerification").then((m) => ({ default: m.TurnstileVerification })),
);

export const Route = createFileRoute("/chat")({
  component: ChatPage,
  head: () =>
    seo({
      title: "AI Chat Assistant | Deadlock API",
      description: "Ask questions about Deadlock heroes, items, and strategies with the AI chat assistant.",
      path: "/chat",
    }),
});

function ChatPage() {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(IS_DEV ? "DEV_BYPASS" : null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

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
    sendMessage(message);
  };

  const handleNewConversation = () => {
    clearConversation();
    setLastMessage(null);
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
    setTurnstileToken(IS_DEV ? "DEV_BYPASS" : null);
  }, [clearError]);

  return (
    <div className="flex h-[85vh] w-full flex-col">
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

      <div className="flex min-h-0 flex-1 flex-col">
        {!isVerified ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <ChunkErrorBoundary>
              <Suspense fallback={<LoadingLogo />}>
                <TurnstileVerification onVerified={handleTurnstileVerified} />
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        ) : !hasMessages ? (
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
