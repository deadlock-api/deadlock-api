import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";

import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Button } from "~/components/ui/button";
import { IconTile } from "~/components/ui/icon-tile";
import { recapWindowLabel } from "~/lib/year-recap/availability";

/** Outside the window: when the recap of `year` opens and until when, and somewhere else to go meanwhile. */
export function RecapClosed({ year }: { year: number }) {
  const { opens, closes } = recapWindowLabel(year);
  return (
    <PageShell density="content" height="fill" align="center">
      <IconTile shape="circle" size="lg" tone="primary">
        <CalendarClock />
      </IconTile>
      <PageHeader
        align="center"
        size="lg"
        title={`Year in Deadlock ${year}`}
        description={`Your ${year} recap opens on ${opens} and stays open until ${closes}. Keep playing: every match this year counts.`}
      />
      <Button asChild>
        <Link to="/tracker/demo">Open the player tracker</Link>
      </Button>
    </PageShell>
  );
}
