import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useEffect } from "react";

import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Inline } from "~/components/ui/stack";
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
    <PageShell width="narrow" density="content" height="fill" className="justify-center">
      <PageHeader title="Patreon Authentication" />
      {!errorMessage && (
        <Alert>
          <CheckCircle className="size-4" />
          <AlertTitle>Success!</AlertTitle>
          <AlertDescription>You have been authenticated. Redirecting...</AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <>
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Authentication Failed</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
          <Inline justify="center">
            <Button onClick={handleGoBack} variant="outline">
              Go Back
            </Button>
          </Inline>
        </>
      )}
    </PageShell>
  );
}
