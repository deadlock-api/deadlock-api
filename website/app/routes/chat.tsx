import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { Suspense, lazy, useCallback, useState } from "react";
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
    // In development, just reset to bypass token
    setTurnstileToken(IS_DEV ? "DEV_BYPASS" : null);
  }, [clearError]);

  return (
    <div className="flex flex-col h-[85vh] w-full">
      {/* Chat header with New Conversation button */}
      {isVerified && hasMessages && (
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <span className="text-sm font-medium">Deadlock AI</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleNewConversation} disabled={conversation.isStreaming}>
            <RotateCcw className="h-4 w-4 mr-2" />
            New Conversation
          </Button>
        </div>
      )}

      {/* Chat container */}
      <div className="flex-1 flex flex-col min-h-0">
        {!isVerified ? (
          // Turnstile verification required
          <div className="flex-1 flex items-center justify-center p-4">
            <Suspense fallback={<LoadingLogo />}>
              <TurnstileVerification onVerified={handleTurnstileVerified} />
            </Suspense>
          </div>
        ) : !hasMessages ? (
          // Empty state - Welcome message
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="max-w-lg w-full space-y-6">
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center">
                  <div className="flex items-center justify-center size-14 rounded-2xl bg-primary/10 border border-primary/20">
                    <Sparkles className="size-7 text-primary" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Deadlock AI Assistant</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    Ask me anything about Deadlock — hero builds, item recommendations, game mechanics, match
                    statistics, and more.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Message list area
          <Suspense fallback={<LoadingLogo />}>
            <ChatMessageList
              messages={conversation.messages}
              currentStreamingMessage={conversation.currentStreamingMessage}
              isStreaming={conversation.isStreaming}
              activeTools={conversation.activeTools}
            />
          </Suspense>
        )}

        {/* Error display - shown when there's an error */}
        {conversation.error && isVerified && (
          <div className="border-t px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <Suspense fallback={<LoadingLogo />}>
                <ChatError
                  error={conversation.error}
                  onDismiss={handleDismissError}
                  onRetry={lastMessage ? handleRetry : undefined}
                  onReVerify={handleReVerify}
                  resetTime={rateLimit.timeUntilReset}
                />
              </Suspense>
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
            <div className="max-w-3xl mx-auto">
              <p className="text-sm text-muted-foreground text-center">
                Complete Turnstile verification to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
