import { Zap } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { usePatronAuth } from "~/hooks/usePatronAuth";

export function PatronCTA({ message }: { message?: string }) {
  const { isAuthenticated, isActive } = usePatronAuth();

  if (isAuthenticated && isActive) return null;

  return (
    <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent">
      <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-400 shrink-0" />
          <p className="text-sm text-muted-foreground">
            {message || "Get your match history and stats updated more frequently with prioritized fetching."}
          </p>
        </div>
        <Link to="/patron" prefetch="intent" className="shrink-0">
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
            Learn More
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
