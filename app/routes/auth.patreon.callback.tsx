import { AlertCircle, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { MetaFunction } from "react-router";
import { useNavigate, useSearchParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";

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
    // Get redirect path from session storage (stored before OAuth flow)
    const storedRedirectPath = sessionStorage.getItem("patron_redirect_path") || "/patron";

    // Check for error param from OAuth flow or API redirect
    const error = searchParams.get("error");
    if (error) {
      const errorDescription = searchParams.get("error_description") || "Authorization was denied or failed";
      setState("error");
      setErrorMessage(errorDescription);
      return;
    }

    // The API has already handled the OAuth callback and set the session cookie.
    // We just need to show success and redirect to the patron page.
    setState("success");

    // Clear stored redirect path
    sessionStorage.removeItem("patron_redirect_path");

    // Redirect after brief success message
    const timeout = setTimeout(() => {
      navigate(storedRedirectPath, { replace: true });
    }, 1500);

    return () => clearTimeout(timeout);
  }, [searchParams, navigate]);

  const handleGoBack = () => {
    const redirectPath = sessionStorage.getItem("patron_redirect_path") || "/patron";
    sessionStorage.removeItem("patron_redirect_path");
    navigate(redirectPath);
  };

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
              <AlertDescription>You have been authenticated. Redirecting...</AlertDescription>
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
                <Button onClick={handleGoBack} variant="outline">
                  Go Back
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
