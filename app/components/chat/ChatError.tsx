import { AlertCircle, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import type { ChatError as ChatErrorType } from "~/types/chat";

interface ChatErrorProps {
  error: ChatErrorType;
  onDismiss: () => void;
  onRetry?: () => void;
  onReVerify?: () => void;
}

function getErrorDetails(code: string): { title: string; icon: "alert" | "shield" } {
  switch (code) {
    case "AUTH_FAILED":
      return { title: "Authentication Error", icon: "shield" };
    case "VALIDATION_ERROR":
      return { title: "Invalid Request", icon: "alert" };
    case "AGENT_ERROR":
      return { title: "Server Error", icon: "alert" };
    case "REDIS_ERROR":
      return { title: "Service Unavailable", icon: "alert" };
    default:
      return { title: "Error", icon: "alert" };
  }
}

export function ChatError({ error, onDismiss, onRetry, onReVerify }: ChatErrorProps) {
  const { title, icon } = getErrorDetails(error.code);
  const isAuthError = error.code === "AUTH_FAILED";

  return (
    <Alert variant="destructive" className="relative">
      {icon === "shield" ? <ShieldAlert className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      <AlertTitle className="pr-8">{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{error.message}</span>
        <div className="flex gap-2 flex-wrap">
          {isAuthError && onReVerify && (
            <Button variant="outline" size="sm" onClick={onReVerify} className="w-fit">
              <ShieldAlert className="h-4 w-4 mr-2" />
              Re-verify
            </Button>
          )}
          {error.isRetryable && onRetry && !isAuthError && (
            <Button variant="outline" size="sm" onClick={onRetry} className="w-fit">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
        </div>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={onDismiss}
        aria-label="Dismiss error"
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
}
