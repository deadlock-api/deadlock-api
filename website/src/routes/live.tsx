import { createFileRoute } from "@tanstack/react-router";

import { LiveIngestPanel } from "~/components/features/live-requests/LiveIngestPanel";
import { LiveQueuePanel } from "~/components/features/live-requests/LiveQueuePanel";
import { LiveRequestMap } from "~/components/features/live-requests/LiveRequestMap";
import { LiveTrafficPanel } from "~/components/features/live-requests/LiveTrafficPanel";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Badge } from "~/components/ui/badge";
import { Inline } from "~/components/ui/stack";
import { StatusDot } from "~/components/ui/status-dot";
import { type LiveFeedStatus, useLiveRequests } from "~/lib/live-requests/useLiveRequests";
import { pageTitle, seo } from "~/lib/seo";

export const Route = createFileRoute("/live")({
  component: LivePage,
  head: () =>
    seo({
      title: pageTitle("Live API Traffic"),
      description:
        "Watch the requests hitting the Deadlock API as they happen, from players around the world through Cloudflare's network to our server and back, and the matches streaming into the database.",
      path: "/live",
    }),
});

const STATUS_LABEL: Record<LiveFeedStatus, string> = {
  connecting: "Connecting",
  live: "Live",
  paused: "Paused while hidden",
  error: "Disconnected",
};

function LivePage() {
  const { status, stats, edge, subscribe, retry } = useLiveRequests();
  return (
    <PageShell height="viewport">
      <PageHeader
        title="Live API Traffic"
        description="Every dot is a request to deadlock-api.com. API requests travel from the player to their nearest Cloudflare data center, across Cloudflare's network to the one next to our server, on to our server in Helsinki and all the way back. Requests Cloudflare answers itself (cached API answers, the website, images) bounce off the player's data center; they are drawn at the rate Cloudflare reports, a few minutes late. Beside it, the matches being written to our database stream in, about a minute behind."
        actions={
          <Badge variant={status === "live" ? "soft" : "outline"}>
            <Inline gap={1.5} align="center">
              <StatusDot tone={status === "live" ? "primary" : "muted"} />
              {STATUS_LABEL[status]}
            </Inline>
          </Badge>
        }
      />
      {status === "error" && (
        <ErrorState
          title="The live feed is not available"
          description="Too many people may be watching right now. Try again in a moment."
          onRetry={retry}
        />
      )}
      <div className="@container flex min-h-0 flex-1 flex-col gap-3">
        <div className="grid min-h-0 flex-1 gap-3 @5xl:grid-cols-[minmax(0,1fr)_30rem]">
          {/* The map is wider than it is tall, so the matches being written fit under it. In one column it keeps 16rem. */}
          <div className="flex min-h-0 flex-col gap-3">
            <LiveRequestMap subscribe={subscribe} stats={stats} edge={edge} className="min-h-64 flex-1 @5xl:min-h-0" />
            <LiveIngestPanel subscribe={subscribe} className="flex h-160 shrink-0 flex-col @5xl:h-84" />
          </div>
          {/* The queue's chart takes what the traffic leaves, so both fit the viewport; short screens scroll. */}
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <LiveQueuePanel history={stats.queueHistory} className="flex min-h-44 flex-1 flex-col" />
            <LiveTrafficPanel stats={stats} edge={edge} className="shrink-0" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
