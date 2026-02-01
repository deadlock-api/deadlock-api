import { useCallback, useEffect, useRef, useState } from "react";
// Import SSE from sse.js
import { SSE } from "sse.js";
import type { SSE as SSEType, SSEvent } from "sse.js/types/sse";
import type {
  ChatDeltaEvent,
  ChatEndEvent,
  ChatError,
  ChatErrorEvent,
  ChatStartEvent,
  ChatToolEndEvent,
  ChatToolStartEvent,
  ConversationState,
  Message,
  SSEEvent,
  ToolExecution,
} from "~/types/chat";

interface UseChatStreamOptions {
  turnstileToken: string | null;
  apiUrl?: string;
}

interface UseChatStreamReturn {
  conversation: ConversationState;
  sendMessage: (message: string) => void;
  stopStreaming: () => void;
  clearConversation: () => void;
  clearError: () => void;
  isConnected: boolean;
}

const initialConversationState: ConversationState = {
  conversationId: null,
  messages: [],
  isStreaming: false,
  currentStreamingMessage: "",
  activeTools: [],
  error: null,
};

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateToolExecutionId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function useChatStream({ turnstileToken, apiUrl }: UseChatStreamOptions): UseChatStreamReturn {
  const isDev = import.meta.env.DEV;
  const defaultApiUrl = import.meta.env.VITE_AI_ASSISTANT_API_URL || "https://ai-assistant.deadlock-api.com";
  const effectiveApiUrl = apiUrl || defaultApiUrl;

  const [conversation, setConversation] = useState<ConversationState>(initialConversationState);
  const [isConnected, setIsConnected] = useState(false);

  // Use ref to store SSE instance for cleanup
  const sseRef = useRef<SSEType | null>(null);
  // Track current assistant message ID for streaming updates
  const currentAssistantMessageIdRef = useRef<string | null>(null);

  // Cleanup SSE connection on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  // Handle SSE start event
  const handleStart = useCallback((event: ChatStartEvent) => {
    setConversation((prev) => ({
      ...prev,
      conversationId: event.conversation_id,
      isStreaming: true,
      currentStreamingMessage: "",
      error: null,
    }));
  }, []);

  // Handle SSE delta event
  const handleDelta = useCallback((event: ChatDeltaEvent) => {
    setConversation((prev) => ({
      ...prev,
      currentStreamingMessage: prev.currentStreamingMessage + event.content,
    }));
  }, []);

  // Handle SSE end event
  const handleEnd = useCallback((_event: ChatEndEvent) => {
    setConversation((prev) => {
      // Create the completed assistant message from streaming content
      // Include the tools that were used during this response
      const assistantMessage: Message = {
        id: currentAssistantMessageIdRef.current || generateMessageId(),
        role: "assistant",
        content: prev.currentStreamingMessage,
        timestamp: Date.now(),
        isStreaming: false,
        tools: prev.activeTools.length > 0 ? prev.activeTools : undefined,
      };

      return {
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isStreaming: false,
        currentStreamingMessage: "",
        activeTools: [],
      };
    });

    currentAssistantMessageIdRef.current = null;
    setIsConnected(false);
  }, []);

  // Handle SSE error event
  const handleError = useCallback((event: ChatErrorEvent) => {
    const chatError: ChatError = {
      message: event.error,
      code: event.code,
      isRetryable: ["AGENT_ERROR", "REDIS_ERROR"].includes(event.code),
    };

    setConversation((prev) => ({
      ...prev,
      isStreaming: false,
      error: chatError,
    }));

    setIsConnected(false);
  }, []);

  // Handle SSE tool_start event
  const handleToolStart = useCallback((event: ChatToolStartEvent) => {
    const toolExecution: ToolExecution = {
      id: generateToolExecutionId(),
      tool_name: event.tool_name,
      arguments: event.arguments,
      status: "running",
    };

    setConversation((prev) => ({
      ...prev,
      activeTools: [...prev.activeTools, toolExecution],
    }));
  }, []);

  // Handle SSE tool_end event
  const handleToolEnd = useCallback((event: ChatToolEndEvent) => {
    setConversation((prev) => ({
      ...prev,
      activeTools: prev.activeTools.map((tool) =>
        tool.tool_name === event.tool_name && tool.status === "running"
          ? {
              ...tool,
              status: event.success ? "success" : "failed",
              result_summary: event.result_summary,
            }
          : tool,
      ),
    }));
  }, []);

  // Parse and handle SSE message
  const handleSSEMessage = useCallback(
    (event: SSEvent) => {
      try {
        const data = JSON.parse(event.data as string) as SSEEvent;

        switch (data.event) {
          case "start":
            handleStart(data);
            break;
          case "delta":
            handleDelta(data);
            break;
          case "end":
            handleEnd(data);
            break;
          case "error":
            handleError(data);
            break;
          case "tool_start":
            handleToolStart(data);
            break;
          case "tool_end":
            handleToolEnd(data);
            break;
        }
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    },
    [handleStart, handleDelta, handleEnd, handleError, handleToolStart, handleToolEnd],
  );

  // Send a message to the chat API
  const sendMessage = useCallback(
    (message: string) => {
      // In development mode, skip Turnstile verification
      if (!isDev && !turnstileToken) {
        setConversation((prev) => ({
          ...prev,
          error: {
            message: "Verification required. Please complete the Turnstile challenge.",
            code: "AUTH_FAILED",
            isRetryable: false,
          },
        }));
        return;
      }

      // Close any existing SSE connection
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }

      // Add user message to conversation
      const userMessage: Message = {
        id: generateMessageId(),
        role: "user",
        content: message,
        timestamp: Date.now(),
      };

      // Generate assistant message ID for streaming
      currentAssistantMessageIdRef.current = generateMessageId();

      setConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isStreaming: true,
        currentStreamingMessage: "",
        activeTools: [],
        error: null,
      }));

      // Create SSE connection
      const payload = JSON.stringify({
        message,
        conversation_id: conversation.conversationId,
      });

      // In development mode, don't send the Turnstile token header
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (!isDev && turnstileToken) {
        headers["cf-turnstile-response"] = turnstileToken;
      }

      const sse: SSEType = new SSE(`${effectiveApiUrl}/chat`, {
        headers,
        payload,
        method: "POST",
        start: false,
      });

      sseRef.current = sse;

      // Set up event handlers
      sse.onmessage = handleSSEMessage;

      sse.onerror = (event: SSEvent) => {
        console.error("SSE connection error:", event);

        // Check if we have a response code that indicates an error
        const responseCode = event.responseCode || 0;

        let errorMessage = "Connection error. Please try again.";
        let errorCode = "INTERNAL_ERROR";
        let isRetryable = true;

        if (responseCode === 401) {
          errorMessage = "Verification expired. Please refresh the page and try again.";
          errorCode = "AUTH_FAILED";
          isRetryable = false;
        } else if (responseCode === 400) {
          errorMessage = "Invalid request. Please check your message and try again.";
          errorCode = "VALIDATION_ERROR";
          isRetryable = false;
        } else if (responseCode >= 500) {
          errorMessage = "Server error. Please try again later.";
          errorCode = "AGENT_ERROR";
          isRetryable = true;
        }

        setConversation((prev) => ({
          ...prev,
          isStreaming: false,
          error: {
            message: errorMessage,
            code: errorCode,
            isRetryable,
          },
        }));

        setIsConnected(false);
        sseRef.current = null;
      };

      sse.onopen = () => {
        setIsConnected(true);
      };

      sse.onabort = () => {
        setIsConnected(false);
        sseRef.current = null;
      };

      // Start the connection
      sse.stream();
    },
    [isDev, turnstileToken, conversation.conversationId, effectiveApiUrl, handleSSEMessage],
  );

  // Stop streaming (cancel SSE connection)
  const stopStreaming = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    setConversation((prev) => {
      // If there's streaming content, save it as a partial message
      if (prev.currentStreamingMessage) {
        const partialMessage: Message = {
          id: currentAssistantMessageIdRef.current || generateMessageId(),
          role: "assistant",
          content: prev.currentStreamingMessage,
          timestamp: Date.now(),
          isStreaming: false,
          tools: prev.activeTools.length > 0 ? prev.activeTools : undefined,
        };

        return {
          ...prev,
          messages: [...prev.messages, partialMessage],
          isStreaming: false,
          currentStreamingMessage: "",
          activeTools: [],
        };
      }

      return {
        ...prev,
        isStreaming: false,
        currentStreamingMessage: "",
        activeTools: [],
      };
    });

    currentAssistantMessageIdRef.current = null;
    setIsConnected(false);
  }, []);

  // Clear conversation and start fresh
  const clearConversation = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    setConversation(initialConversationState);
    currentAssistantMessageIdRef.current = null;
    setIsConnected(false);
  }, []);

  // Clear error only
  const clearError = useCallback(() => {
    setConversation((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    conversation,
    sendMessage,
    stopStreaming,
    clearConversation,
    clearError,
    isConnected,
  };
}
