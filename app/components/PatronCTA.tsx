import { Zap } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { usePatronAuth } from "~/hooks/usePatronAuth";

export function PatronCTA({ message }: { message?: string }) {
  const { isAuthenticated, isActive } = usePatronAuth();

  if (isAuthenticated && isActive) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-transparent">
      <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            {message ||
              "Get your complete match history from first to last game, with faster updates via prioritized fetching."}
          </p>
        </div>
        <Link to="/patron" prefetch="intent" className="shrink-0">
          <Button
            size="sm"
            className="bg-gradient-to-r from-[#fa4454] to-[#ff6b7a] hover:from-[#e83d4c] hover:to-[#f05a68] text-white font-semibold"
          >
            Learn More
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
