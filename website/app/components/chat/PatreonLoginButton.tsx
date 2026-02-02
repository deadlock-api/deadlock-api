import { LogIn } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { usePatreonAuth } from "~/hooks/usePatreonAuth";

export function PatreonLoginButton() {
  const { isAuthenticated, isLoading, isOAuthAvailable, login } = usePatreonAuth();

  // Don't render if authenticated or OAuth is unavailable
  if (isAuthenticated || !isOAuthAvailable) {
    return null;
  }

  // Show loading state during initial auth check
  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Spinner className="h-4 w-4" />
        Checking...
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={login}>
      <LogIn className="h-4 w-4" />
      Login with Patreon
    </Button>
  );
}
