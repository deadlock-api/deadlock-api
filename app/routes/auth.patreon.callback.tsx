import { usePostHog } from "@posthog/react";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useEffect } from "react";
import type { MetaFunction } from "react-router";
import { useNavigate, useSearchParams } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { createPageMeta } from "~/lib/meta";

export const meta: MetaFunction = () => {
  return [
    ...createPageMeta({
      title: "Patreon Login | Deadlock API",
      description: "Complete your Patreon authentication",
      path: "/auth/patreon/callback",
    }),
    { name: "robots", content: "noindex, nofollow" },
  ];
};

export default function PatreonCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const errorMessage = searchParams.get("error")
    ? searchParams.get("error_description") || "Authorization was denied or failed"
    : null;

  useEffect(() => {
    if (errorMessage) {
      posthog?.capture("patron_auth_failed", {
        error: searchParams.get("error"),
        error_description: errorMessage,
      });
      return;
    }

    posthog?.capture("patron_auth_success");

    const storedRedirectPath = sessionStorage.getItem("patron_redirect_path") || "/patron";
    sessionStorage.removeItem("patron_redirect_path");

    const timeout = setTimeout(() => {
      navigate(storedRedirectPath, { replace: true });
    }, 1500);

    return () => clearTimeout(timeout);
  }, [errorMessage, navigate, posthog, searchParams]);

  const handleGoBack = () => {
    const redirectPath = sessionStorage.getItem("patron_redirect_path") || "/patron";
    sessionStorage.removeItem("patron_redirect_path");
    navigate(redirectPath);
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Patreon Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          {!errorMessage && (
            <Alert>
              <CheckCircle className="size-4" />
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>You have been authenticated. Redirecting...</AlertDescription>
            </Alert>
          )}

          {errorMessage && (
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
