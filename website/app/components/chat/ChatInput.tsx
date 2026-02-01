import { Send, Square } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const MAX_CHARACTERS = 2048;

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onStopStreaming?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSendMessage,
  onStopStreaming,
  disabled = false,
  isStreaming = false,
  placeholder = "Type your message...",
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remainingChars = MAX_CHARACTERS - message.length;
  const isOverLimit = remainingChars < 0;
  const isEmpty = message.trim().length === 0;
  const canSend = !isEmpty && !isOverLimit && !disabled && !isStreaming;

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleSend = () => {
    if (!canSend) return;
    onSendMessage(message.trim());
    setMessage("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends message; Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    if (onStopStreaming) {
      onStopStreaming();
    }
  };

  return (
    <div className="border-t bg-background p-4 pb-0">
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={disabled || isStreaming}
              placeholder={placeholder}
              rows={1}
              className={cn(
                "w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                "min-h-[42px] max-h-[200px]",
                isOverLimit && "border-destructive focus-visible:ring-destructive",
              )}
            />
          </div>
          {isStreaming ? (
            <Button
              onClick={handleStop}
              size="icon"
              variant="destructive"
              aria-label="Stop generating"
              className="my-2 size-[40px]"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!canSend}
              size="icon"
              aria-label="Send message"
              className="my-2 size-[40px]"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
        <div className="flex justify-end mt-1">
          <span className={cn("text-xs", isOverLimit ? "text-destructive" : "text-muted-foreground")}>
            {remainingChars} characters remaining
          </span>
        </div>
      </div>
    </div>
  );
}
