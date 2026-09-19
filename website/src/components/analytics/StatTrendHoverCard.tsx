import { Suspense, type ReactElement, type ReactNode } from "react";

import { LoadingLogo } from "~/components/LoadingLogo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "~/components/ui/hover-card";

export function StatTrendHoverCard({ trigger, children }: { trigger: ReactElement; children: ReactNode }) {
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent className="w-[28rem] max-w-[90vw]" align="end">
        <Suspense
          fallback={
            <div className="flex h-[250px] items-center justify-center">
              <LoadingLogo />
            </div>
          }
        >
          {children}
        </Suspense>
      </HoverCardContent>
    </HoverCard>
  );
}
