import { RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";
import type { MetaFunction } from "react-router";
import { ChatError } from "~/components/chat/ChatError";
import { ChatInput } from "~/components/chat/ChatInput";
import { ChatMessageList } from "~/components/chat/ChatMessageList";
import { TurnstileVerification } from "~/components/chat/TurnstileVerification";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useChatStream } from "~/hooks/useChatStream";
import { usePatreonAuth } from "~/hooks/usePatreonAuth";
import { useRateLimit } from "~/hooks/useRateLimit";

export const meta: MetaFunction = () => {
  return [
    { title: "AI Chat Assistant | Deadlock API" },
    {
      name: "description",
      content: "Chat with the Deadlock AI Assistant to get help with game data, statistics, and more.",
    },
  ];
};

export default function ChatPage() {
  const isDev = import.meta.env.DEV;
  // In development, bypass Turnstile verification
  const [turnstileToken, setTurnstileToken] = useState<string | null>(isDev ? "DEV_BYPASS" : null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const rateLimit = useRateLimit();
  const { isAuthenticated, tier, isOAuthAvailable, login: patreonLogin } = usePatreonAuth();

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
        <div className="border-b px-4 py-2 flex justify-end gap-2">
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
            <Card className="max-w-lg w-full">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Welcome to Deadlock AI Assistant</CardTitle>
                <CardDescription className="text-base mt-2">
                  Ask me anything about Deadlock - hero builds, item recommendations, game mechanics, match statistics,
                  and more.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">Try asking:</p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>"What are the best items for Haze?"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>"How do I counter Wraith?"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>"What's the current hero tier list?"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>"Explain the soul economy mechanics"</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
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
                isAuthenticated={isAuthenticated}
                tier={tier}
                onPatreonLogin={patreonLogin}
                isOAuthAvailable={isOAuthAvailable}
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
