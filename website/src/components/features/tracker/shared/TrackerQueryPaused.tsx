import { WifiOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

/** Paused requests resume automatically through TanStack Query when the connection returns. */
export function TrackerQueryPaused({ description }: { description: string }) {
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Alert contains block content; this informational state should be announced politely.
    <Alert role="status">
      <WifiOff aria-hidden="true" />
      <AlertTitle>Waiting for connection</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
