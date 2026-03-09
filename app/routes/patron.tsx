import type { MetaFunction } from "react-router";
import { AuthenticatedDashboard, PatronPageSkeleton } from "~/components/patron/AuthenticatedDashboard";
import { UnauthenticatedState } from "~/components/patron/UnauthenticatedState";
import { usePatronAuth } from "~/hooks/usePatronAuth";
import { createPageMeta } from "~/lib/meta";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Prioritized Fetching | Deadlock API",
    description: "Get priority data fetching for your Steam accounts. Your matches and stats updated faster.",
    path: "/patron",
  });
};

export default function PatronPage() {
  const { isAuthenticated, isLoading, login } = usePatronAuth();

  if (isLoading) {
    return <PatronPageSkeleton />;
  }

  if (!isAuthenticated) {
    return <UnauthenticatedState onLogin={login} />;
  }

  return <AuthenticatedDashboard />;
}
