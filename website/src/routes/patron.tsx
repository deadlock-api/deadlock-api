import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedDashboard, PatronPageSkeleton } from "~/components/patron/AuthenticatedDashboard";
import { UnauthenticatedState } from "~/components/patron/UnauthenticatedState";
import { PatronAuthProvider } from "~/contexts/PatronAuthContext";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { seo } from "~/lib/seo";

export const Route = createFileRoute("/patron")({
  head: () =>
    seo({
      title: "Prioritized Fetching | Deadlock API",
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
  const { isAuthenticated, isLoading, login } = usePatronAuth();

  if (isLoading) {
    return <PatronPageSkeleton />;
  }

  if (!isAuthenticated) {
    return <UnauthenticatedState onLogin={login} />;
  }

  return <AuthenticatedDashboard />;
}
