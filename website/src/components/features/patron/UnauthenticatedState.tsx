import { ArrowRight, LogIn } from "lucide-react";

import { CalloutCard } from "~/components/patterns/content/CalloutCard";
import {
  ComparisonCell,
  ComparisonColumn,
  ComparisonHeader,
  ComparisonRow,
  ComparisonTable,
} from "~/components/patterns/data-table/ComparisonTable";
import { Hero, HeroActions, HeroGlow, HeroNote } from "~/components/patterns/page/Hero";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Button } from "~/components/ui/button";
import { IconTile } from "~/components/ui/icon-tile";
import { TableBody } from "~/components/ui/table";

/** One feature the free tier also has. A patron-only feature is a `ComparisonRow` with an empty free cell. */
function FreeAndPatronRow({ label }: { label: string }) {
  return (
    <ComparisonRow label={label}>
      <ComparisonCell included />
      <ComparisonCell included />
    </ComparisonRow>
  );
}

function PatronOnlyRow({ label }: { label: string }) {
  return (
    <ComparisonRow label={label}>
      <ComparisonCell />
      <ComparisonCell included />
    </ComparisonRow>
  );
}

export function UnauthenticatedState({ onLogin }: { onLogin: () => void }) {
  return (
    <PageShell density="content">
      <Hero>
        <HeroGlow />
        <PageHeader
          size="lg"
          title={
            <>
              Your matches. Updated <span className="text-primary">faster</span>.
            </>
          }
          description="Patron accounts get a dedicated queue with reserved resources, guaranteeing fast and reliable data fetching for your match history and stats. Data is upstreamed to Statlocker, Tracklock, Lockblaze, or your favorite stat tracking site."
        />
        <HeroActions>
          <Button size="lg" onClick={onLogin}>
            <LogIn />
            Sign in with Patreon
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
              Become a Patron
              <ArrowRight />
            </a>
          </Button>
        </HeroActions>
        <HeroNote>Starting at $1.50/month, every cent goes to infrastructure</HeroNote>
      </Hero>

      <ComparisonTable highlightedColumn={1} className="mx-auto w-full max-w-2xl">
        <ComparisonHeader>
          <ComparisonColumn>Free</ComparisonColumn>
          <ComparisonColumn>Patron</ComparisonColumn>
        </ComparisonHeader>
        <TableBody>
          <FreeAndPatronRow label="Full API access" />
          <FreeAndPatronRow label="Match history & stats" />
          <PatronOnlyRow label="Dedicated queue with reserved resources" />
          <PatronOnlyRow label="Faster data updates" />
          <PatronOnlyRow label="Full match history from first to last game" />
          <PatronOnlyRow label="Up to 50 prioritized accounts" />
          <PatronOnlyRow label="Swap accounts anytime" />
          <PatronOnlyRow label="Accurate rank data from Steam" />
        </TableBody>
      </ComparisonTable>
    </PageShell>
  );
}

export function NotSubscribedState() {
  return (
    <PageShell density="content">
      <PageHeader title="Welcome, Patron!" description="You're signed in but don't have an active subscription yet." />

      <CalloutCard
        media={
          <IconTile tone="primary" shape="circle" size="lg">
            <ArrowRight />
          </IconTile>
        }
        title="Get prioritized fetching"
        description="Subscribe on Patreon to unlock dedicated queue access with reserved resources. Your match data and stats will be fetched faster and more reliably, and upstreamed to Statlocker, Tracklock, Lockblaze, or your favorite stat tracking site."
        action={
          <Button size="lg" asChild>
            <a href="https://www.patreon.com/c/manuelhexe" target="_blank" rel="noopener noreferrer">
              Subscribe on Patreon
              <ArrowRight />
            </a>
          </Button>
        }
        footer="Starting at $1.50/month, every cent goes to infrastructure"
      />
    </PageShell>
  );
}
