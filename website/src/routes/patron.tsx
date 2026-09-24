import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedDashboard, PatronPageSkeleton } from "~/components/features/patron/AuthenticatedDashboard";
import { UnauthenticatedState } from "~/components/features/patron/UnauthenticatedState";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { pageTitle, seo } from "~/lib/seo";

export const Route = createFileRoute("/patron")({
  head: () =>
    seo({
      title: pageTitle("Prioritized Fetching"),
      description: "Get priority data fetching for your Steam accounts. Your matches and stats updated faster.",
      path: "/patron",
    }),
  component: PatronRoute,
});

function PatronRoute() {
  return (
    <PatronAuthProvider>
      <PatronPage />
    </PatronAuthProvider>
  );
}

function PatronPage() {
  const { isAuthenticated, isLoading, statusError, isRefreshingStatus, refreshStatus, login } = usePatronAuth();

  if (isLoading) {
    return <PatronPageSkeleton />;
  }

  // An outage is not a sign-out: the sign-in pitch would ask a patron to log in again.
  if (statusError) {
    return (
      <PageShell>
        <ErrorState
          title="Could not check your sign-in"
          description="The Patreon status is temporarily unavailable. Try again in a moment."
          onRetry={() => void refreshStatus()}
          retrying={isRefreshingStatus}
        />
      </PageShell>
    );
  }

  if (!isAuthenticated) {
    return <UnauthenticatedState onLogin={login} />;
  }

  return <AuthenticatedDashboard />;
}
