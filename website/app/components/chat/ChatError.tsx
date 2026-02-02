import { AlertCircle, Clock, ExternalLink, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import type { ChatError as ChatErrorType } from "~/types/chat";

const PATREON_URL = "https://www.patreon.com/user?u=68961896";

interface ChatErrorProps {
  error: ChatErrorType;
  onDismiss: () => void;
  onRetry?: () => void;
  onReVerify?: () => void;
  /** Time until rate limit resets (e.g., "45 minutes") - only used for RATE_LIMIT_EXCEEDED errors */
  resetTime?: string | null;
  /** Whether user is authenticated with Patreon - used for rate limit CTAs */
  isAuthenticated?: boolean;
  /** User's Patreon tier (0 = free, 1 = Supporter, 2 = Contributor, 3 = Champion) */
  tier?: number;
  /** Callback to trigger Patreon login flow */
  onPatreonLogin?: () => void;
  /** Whether Patreon OAuth is available (hides login CTA when false) */
  isOAuthAvailable?: boolean;
}

function getErrorDetails(code: string): { title: string; icon: "alert" | "shield" | "clock" } {
  switch (code) {
    case "AUTH_FAILED":
      return { title: "Authentication Error", icon: "shield" };
    case "RATE_LIMIT_EXCEEDED":
      return { title: "Rate Limit Reached", icon: "clock" };
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

function getIcon(iconType: "alert" | "shield" | "clock") {
  switch (iconType) {
    case "shield":
      return <ShieldAlert className="h-4 w-4" />;
    case "clock":
      return <Clock className="h-4 w-4" />;
    default:
      return <AlertCircle className="h-4 w-4" />;
  }
}

export function ChatError({
  error,
  onDismiss,
  onRetry,
  onReVerify,
  resetTime,
  isAuthenticated = false,
  tier = 0,
  onPatreonLogin,
  isOAuthAvailable = true,
}: ChatErrorProps) {
  const { title, icon } = getErrorDetails(error.code);
  const isAuthError = error.code === "AUTH_FAILED";
  const isRateLimitError = error.code === "RATE_LIMIT_EXCEEDED";

  // For rate limit errors, show specific message
  const displayMessage = isRateLimitError ? "You've reached your free limit of 5 requests per hour." : error.message;

  // Max tier is 3 (Champion) - users at this tier can't upgrade further
  const isMaxTier = tier >= 3;

  return (
    <Alert variant="destructive" className="relative">
      {getIcon(icon)}
      <AlertTitle className="pr-8">{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{displayMessage}</span>
        {isRateLimitError && resetTime && <span className="text-sm font-medium">Try again in {resetTime}.</span>}
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
          {isRateLimitError && !isAuthenticated && onPatreonLogin && isOAuthAvailable && (
            <Button variant="outline" size="sm" onClick={onPatreonLogin} className="w-fit">
              <ExternalLink className="h-4 w-4 mr-2" />
              Login with Patreon for more requests
            </Button>
          )}
          {isRateLimitError && isAuthenticated && !isMaxTier && (
            <Button variant="outline" size="sm" asChild className="w-fit">
              <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Upgrade on Patreon
              </a>
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
