import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { Card } from "~/components/ui/card";
import { Delta } from "~/components/ui/delta";
import { Heading } from "~/components/ui/heading";
import { Stack } from "~/components/ui/stack";
import type { HeroMatchups, MatchupRow } from "~/lib/matchup-stats";

const SUMMARY_COUNT = 3;
/** Pairings seen in fewer matches than this swing too much to headline. */
const MIN_MATCHES = 100;

function MatchupCard({ title, caption, rows }: { title: string; caption: string; rows: MatchupRow[] }) {
  return (
    <Card size="xs" className="gap-3 px-4 py-3">
      <Stack gap={0.5}>
        <Heading as="h3" size="default">
          {title}
        </Heading>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </Stack>
      <ol className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.heroId}
            className="flex items-center gap-2"
            title={`${row.matches.toLocaleString("en-US")} matches`}
          >
            <HeroImage heroId={row.heroId} className="size-7" />
            <HeroName heroId={row.heroId} linkToDetail className="min-w-0 text-sm" />
            <Delta value={row.relWinrate} className="ms-auto text-sm" />
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function HeroMatchupSummary({
  heroName,
  matchups,
  onRetry,
}: {
  heroName: string;
  /** Undefined when the matchups failed to load. */
  matchups: HeroMatchups | undefined;
  onRetry?: () => void;
}) {
  // Said, not hidden: an empty summary reads as "no reliable matchups" rather than as a failed request.
  if (!matchups) {
    return <ErrorState variant="inline" title={`${heroName}'s matchups did not load`} onRetry={onRetry} />;
  }
  const { synergyRows, counterRows } = matchups;

  const reliable = (rows: MatchupRow[]) =>
    rows.filter((row) => row.matches >= MIN_MATCHES && Number.isFinite(row.relWinrate));
  const teammates = reliable(synergyRows)
    .filter((row) => row.relWinrate > 0)
    .slice(0, SUMMARY_COUNT);
  const opponents = reliable(counterRows);
  const strongAgainst = opponents.filter((row) => row.relWinrate > 0).slice(0, SUMMARY_COUNT);
  const counteredBy = opponents
    .filter((row) => row.relWinrate < 0)
    .reverse()
    .slice(0, SUMMARY_COUNT);

  const cards = [
    {
      title: "Best Teammates",
      caption: `How much better the pair wins than ${heroName} and the teammate do on average.`,
      rows: teammates,
    },
    {
      title: "Strong Against",
      caption: `How much more often ${heroName} wins with this hero on the enemy team.`,
      rows: strongAgainst,
    },
    {
      title: `Counters ${heroName}`,
      caption: `How much less often ${heroName} wins with this hero on the enemy team.`,
      rows: counteredBy,
    },
  ].filter((card) => card.rows.length > 0);
  if (cards.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map((card) => (
        <MatchupCard key={card.title} {...card} />
      ))}
    </div>
  );
}
