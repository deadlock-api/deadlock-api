// Chat Request Types
export interface ChatRequest {
  message: string;
  conversation_id?: string;
}

// Message Types
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

// Tool Execution Types
export interface ToolExecution {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  status: "running" | "success" | "failed";
  result_summary?: string;
}

// SSE Event Types
export interface ChatStartEvent {
  event: "start";
  conversation_id: string;
}

export interface ChatDeltaEvent {
  event: "delta";
  content: string;
}

export interface ChatEndEvent {
  event: "end";
  conversation_id: string;
}

export interface ChatErrorEvent {
  event: "error";
  error: string;
  code: string;
}

export interface ChatToolStartEvent {
  event: "tool_start";
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface ChatToolEndEvent {
  event: "tool_end";
  tool_name: string;
  success: boolean;
  result_summary: string;
}

export type SSEEvent =
  | ChatStartEvent
  | ChatDeltaEvent
  | ChatEndEvent
  | ChatErrorEvent
  | ChatToolStartEvent
  | ChatToolEndEvent;

// Error Response Types
export interface ErrorResponse {
  error: string;
  code: string;
  request_id: string;
}

// Error Codes
export type ErrorCode = "AUTH_FAILED" | "VALIDATION_ERROR" | "AGENT_ERROR" | "REDIS_ERROR" | "INTERNAL_ERROR";

// Conversation State
export interface ConversationState {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  currentStreamingMessage: string;
  activeTools: ToolExecution[];
  error: ChatError | null;
}

// Chat Error
export interface ChatError {
  message: string;
  code: string;
  isRetryable: boolean;
}
