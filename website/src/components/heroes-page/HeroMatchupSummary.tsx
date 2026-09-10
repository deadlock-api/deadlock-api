import { type HeroMatchupParams, useHeroMatchupRows } from "~/components/heroes-page/HeroMatchupDetailsStatsTable";
import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { formatSignedPercent } from "~/lib/format";
import { cn } from "~/lib/utils";

const SUMMARY_COUNT = 3;
/** Pairings seen in fewer matches than this swing too much to headline. */
const MIN_MATCHES = 100;

interface SummaryRow {
  heroId: number;
  matches: number;
  relWinrate: number;
}

function MatchupCard({ title, caption, rows }: { title: string; caption: string; rows: SummaryRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>
      <ol className="mt-3 space-y-2">
        {rows.map((row) => (
          <li
            key={row.heroId}
            className="flex items-center gap-2"
            title={`${row.matches.toLocaleString("en-US")} matches`}
          >
            <HeroImage heroId={row.heroId} className="size-7" />
            <HeroName heroId={row.heroId} linkToDetail className="min-w-0 text-sm" />
            <span
              className={cn(
                "ml-auto text-sm font-medium tabular-nums",
                row.relWinrate > 0 ? "text-green-500" : "text-red-500",
              )}
            >
              {formatSignedPercent(row.relWinrate)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HeroMatchupSummary({ heroName, ...params }: HeroMatchupParams & { heroName: string }) {
  const { synergyRows, counterRows, isLoading } = useHeroMatchupRows(params);
  if (isLoading) return null;

  const reliable = (rows: SummaryRow[]) =>
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
