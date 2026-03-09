import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import type { MetaFunction } from "react-router";
import { ChatError } from "~/components/chat/ChatError";
import { ChatInput } from "~/components/chat/ChatInput";
import { ChatMessageList } from "~/components/chat/ChatMessageList";
import { TurnstileVerification } from "~/components/chat/TurnstileVerification";
import { Button } from "~/components/ui/button";
import { useChatStream } from "~/hooks/useChatStream";
import { useRateLimit } from "~/hooks/useRateLimit";
import { createPageMeta } from "~/lib/meta";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "AI Chat Assistant | Deadlock API",
    description: "Ask questions about Deadlock heroes, items, and strategies with the AI chat assistant.",
    path: "/chat",
  });
};

export default function ChatPage() {
  const isDev = import.meta.env.DEV;
  // In development, bypass Turnstile verification
  const [turnstileToken, setTurnstileToken] = useState<string | null>(isDev ? "DEV_BYPASS" : null);
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
    setTurnstileToken(isDev ? "DEV_BYPASS" : null);
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
            <TurnstileVerification onVerified={handleTurnstileVerified} />
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
          <ChatMessageList
            messages={conversation.messages}
            currentStreamingMessage={conversation.currentStreamingMessage}
            isStreaming={conversation.isStreaming}
            activeTools={conversation.activeTools}
          />
        )}

        {/* Error display - shown when there's an error */}
        {conversation.error && isVerified && (
          <div className="border-t px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <ChatError
                error={conversation.error}
                onDismiss={handleDismissError}
                onRetry={lastMessage ? handleRetry : undefined}
                onReVerify={handleReVerify}
                resetTime={rateLimit.timeUntilReset}
              />
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
