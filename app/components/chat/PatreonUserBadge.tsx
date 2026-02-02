import { LogOut } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Spinner } from "~/components/ui/spinner";
import { usePatreonAuth } from "~/hooks/usePatreonAuth";

/**
 * Masks an email address for privacy display.
 * Example: "user@example.com" → "u***@example.com"
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return email;
  }
  const maskedLocal = localPart.length > 1 ? `${localPart[0]}***` : `${localPart}***`;
  return `${maskedLocal}@${domain}`;
}

/**
 * Returns the appropriate badge variant based on tier.
 */
function getTierVariant(tier: number): "default" | "secondary" | "outline" {
  if (tier >= 3) {
    return "default"; // Champion tier - primary color
  }
  if (tier >= 2) {
    return "secondary"; // Contributor tier
  }
  return "outline"; // Supporter tier
}

export function PatreonUserBadge() {
  const { isAuthenticated, isLoading, isLoggingOut, tier, tierName, email, logout } = usePatreonAuth();

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Show loading state during initial auth check
  if (isLoading) {
    return (
      <Badge variant="outline">
        <Spinner className="h-3 w-3" />
        Loading...
      </Badge>
    );
  }

  const displayTierName = tierName || "Supporter";
  const badgeVariant = getTierVariant(tier);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0">
          <Badge variant={badgeVariant} className="cursor-pointer">
            {displayTierName}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56" align="end">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Patreon {displayTierName}</p>
            {email && <p className="text-xs text-muted-foreground">{maskEmail(email)}</p>}
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={logout} disabled={isLoggingOut}>
            {isLoggingOut ? (
              <>
                <Spinner className="h-4 w-4" />
                Logging out...
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4" />
                Logout
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
