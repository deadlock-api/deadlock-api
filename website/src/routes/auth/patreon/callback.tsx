import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { seo } from "~/lib/seo";

interface PatreonCallbackSearch {
  error?: string;
  error_description?: string;
}

export const Route = createFileRoute("/auth/patreon/callback")({
  head: () => {
    const base = seo({
      title: "Patreon Login | Deadlock API",
      description: "Complete your Patreon authentication",
      path: "/auth/patreon/callback",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  validateSearch: (search: Record<string, unknown>): PatreonCallbackSearch => ({
    error: typeof search.error === "string" ? search.error : undefined,
    error_description: typeof search.error_description === "string" ? search.error_description : undefined,
  }),
  component: PatreonCallbackPage,
});

function PatreonCallbackPage() {
  const { error, error_description } = Route.useSearch();
  const navigate = useNavigate();
  const errorMessage = error ? error_description || "Authorization was denied or failed" : null;

  useEffect(() => {
    if (errorMessage) return;
    if (typeof window === "undefined") return;

    const storedRedirectPath = sessionStorage.getItem("patron_redirect_path") || "/patron";
    sessionStorage.removeItem("patron_redirect_path");

    const timeout = setTimeout(() => {
      navigate({ to: storedRedirectPath, replace: true });
    }, 1500);

    return () => clearTimeout(timeout);
  }, [errorMessage, navigate]);

  const handleGoBack = () => {
    if (typeof window === "undefined") {
      navigate({ to: "/patron" });
      return;
    }
    const redirectPath = sessionStorage.getItem("patron_redirect_path") || "/patron";
    sessionStorage.removeItem("patron_redirect_path");
    navigate({ to: redirectPath });
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
