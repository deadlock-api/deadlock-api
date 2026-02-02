import { AlertCircle, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useNavigate, useSearchParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";

const PATREON_TOKEN_KEY = "patreon_token";
const API_URL = import.meta.env.VITE_AI_ASSISTANT_API_URL || "https://ai-assistant.deadlock-api.com";

interface CallbackResponse {
  session_token: string;
}

interface ErrorResponse {
  detail?: string;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Patreon Login | Deadlock API" },
    { name: "description", content: "Complete your Patreon authentication" },
  ];
};

type CallbackState = "loading" | "success" | "error";

export default function PatreonCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<CallbackState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      // Check for error param from OAuth flow
      const error = searchParams.get("error");
      if (error) {
        const errorDescription = searchParams.get("error_description") || "Authorization was denied or failed";
        setState("error");
        setErrorMessage(errorDescription);
        return;
      }

      // Extract code and state from URL
      const code = searchParams.get("code");
      const oauthState = searchParams.get("state");

      if (!code) {
        setState("error");
        setErrorMessage("Missing authorization code");
        return;
      }

      try {
        // Call backend callback endpoint
        const params = new URLSearchParams();
        params.set("code", code);
        if (oauthState) {
          params.set("state", oauthState);
        }

        const response = await fetch(`${API_URL}/auth/patreon/callback?${params.toString()}`);

        if (response.status === 503) {
          setState("error");
          setErrorMessage("Patreon login is currently unavailable. Please try again later.");
          return;
        }

        if (!response.ok) {
          const errorData: ErrorResponse = await response.json().catch(() => ({}));
          setState("error");
          setErrorMessage(errorData.detail || `Authentication failed (${response.status})`);
          return;
        }

        const data: CallbackResponse = await response.json();

        // Store session token in localStorage
        localStorage.setItem(PATREON_TOKEN_KEY, data.session_token);

        setState("success");

        // Redirect to chat after brief success message
        setTimeout(() => {
          navigate("/chat", { replace: true });
        }, 1500);
      } catch (_err) {
        setState("error");
        setErrorMessage("Failed to complete authentication. Please try again.");
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle>Patreon Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          {state === "loading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Spinner className="size-8" />
              <p className="text-muted-foreground">Completing authentication...</p>
            </div>
          )}

          {state === "success" && (
            <Alert>
              <CheckCircle className="size-4" />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>You have been authenticated. Redirecting to chat...</AlertDescription>
            </Alert>
          )}

          {state === "error" && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Authentication Failed</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
              <div className="flex justify-center">
                <Button onClick={() => navigate("/chat")} variant="outline">
                  Return to Chat
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
