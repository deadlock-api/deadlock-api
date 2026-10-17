import { useQuery } from "@tanstack/react-query";
import { Hammer } from "lucide-react";

import { AbilityOrderGrid } from "~/components/domain/assets/AbilityOrderGrid";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { PlayerCell } from "~/components/domain/player/PlayerCell";
import { Panel, PanelHeader, PanelSection } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { CopyButton } from "~/components/ui/copy-button";
import { Delta } from "~/components/ui/delta";
import { SCROLLBAR_THIN } from "~/components/ui/recipes";
import { Stat, StatGroup } from "~/components/ui/stat";
import { day } from "~/dayjs";
import { type BuildRow, type BuildTrend, buildCategoryName, buildLanguageName } from "~/lib/build-stats";
import { formatPercent, formatShare } from "~/lib/format";
import { cn } from "~/lib/utils";
import { abilitiesQueryOptions, heroesQueryOptions } from "~/queries/asset-queries";
import type { SteamProfile } from "~/queries/steam-queries";

const HERO_ABILITY_SLOTS = ["signature1", "signature2", "signature3", "signature4"] as const;

/** The hero's four abilities in slot order: the rows of a skill order grid. */
function useSlotAbilities(heroId: number): number[] {
  const { data: hero } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => heroes.find((candidate) => candidate.id === heroId),
  });
  const { data: abilities } = useQuery(abilitiesQueryOptions);
  if (!hero || !abilities) return [];
  return HERO_ABILITY_SLOTS.flatMap((slot) => {
    const ability = abilities.find((candidate) => candidate.class_name === hero.items?.[slot]);
    return ability ? [ability.id] : [];
  });
}

/** One build in full: who made it, how it did, the items of each of its categories and its skill order. */
export function BuildDetailPanel({
  row,
  trend,
  heroId,
  profile,
  pending,
  profilePending,
  className,
}: {
  row: BuildRow;
  /** The build's share in the range's last days; undefined while it loads or without recent matches. */
  trend: BuildTrend | undefined;
  heroId: number;
  profile: SteamProfile | undefined;
  /** Build contents are still loading. */
  pending: boolean;
  profilePending: boolean;
  className?: string;
}) {
  const slotAbilities = useSlotAbilities(heroId);
  const { meta } = row;
  const name = meta?.name ?? `Build ${row.hero_build_id}`;
  // Ability ids the hero no longer has (reworked since the build was saved) are left out.
  const skillOrder = meta?.abilityOrder.filter((abilityId) => slotAbilities.includes(abilityId)) ?? [];

  return (
    <Panel className={cn("flex h-120 flex-col", className)}>
      <PanelHeader title={name} icon={Hammer} size="sm">
        <CopyButton
          text={String(row.hero_build_id)}
          variant="ghost"
          size="xs"
          aria-label={`Copy build ID ${row.hero_build_id}`}
          className="ms-auto"
        >
          <span className="tabular-nums">ID {row.hero_build_id}</span>
        </CopyButton>
      </PanelHeader>
      <div className={cn(SCROLLBAR_THIN, "@container relative flex min-h-0 flex-1 flex-col overflow-y-auto")}>
        <div className="flex flex-col gap-3 px-4 py-3">
          {meta ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <PlayerCell
                size="sm"
                accountId={meta.authorId}
                name={profile?.personaname}
                avatar={profile?.avatar}
                loading={profilePending && !profile}
                linkToDetail
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                v{meta.version} · {day.unix(meta.updatedAt).utc().format("MMM D, YYYY")}
                {meta.language !== 0 && ` · ${buildLanguageName(meta.language)}`}
              </span>
            </div>
          ) : null}
          <StatGroup size="xs" variant="joined" className="grid-cols-2 @lg:grid-cols-4">
            <Stat label="Matches" value={row.matches.toLocaleString("en-US")} sub={`${formatShare(row.share)} share`} />
            <Stat
              label="Players"
              value={row.players.toLocaleString("en-US")}
              sub={`${(row.matches / Math.max(1, row.players)).toFixed(1)} games each`}
            />
            <Stat
              label="Win rate"
              value={formatPercent(row.winRate)}
              sub={
                <>
                  {/* Colored only when the whole interval is on one side of the average. */}
                  <Delta value={row.vsAverage} polarity={row.verdict === "even" ? "neutral" : "higher-is-better"} /> vs.
                  avg
                </>
              }
            />
            <Stat
              label="Last 7 days"
              value={trend ? formatShare(trend.recentShare) : null}
              sub={trend && <Delta value={trend.change} unit=" pp" polarity="neutral" sign="arrow" />}
            />
          </StatGroup>
        </div>
        {meta ? (
          <>
            {meta.categories
              .filter((category) => category.itemIds.length > 0)
              .map((category) => (
                <section key={`${category.name}|${category.itemIds.join()}`} className="flex flex-col">
                  <PanelSection title={buildCategoryName(category.name) ?? "Items"}>
                    <span className="tabular-nums">{category.itemIds.length}</span>
                  </PanelSection>
                  <ul className="flex flex-wrap gap-1.5 px-4 py-2">
                    {category.itemIds.map((itemId) => (
                      <li key={itemId}>
                        <ItemImage itemId={itemId} className="size-9" />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            {skillOrder.length > 0 && slotAbilities.length > 0 && (
              <section className="flex flex-col">
                <PanelSection title="Skill order" />
                <div className="px-4 py-2">
                  <AbilityOrderGrid
                    size="sm"
                    abilityIds={slotAbilities}
                    steps={skillOrder.map((abilityId) => ({ abilityId }))}
                  />
                </div>
              </section>
            )}
          </>
        ) : pending ? (
          <LoadingState variant="skeleton" size="sm" />
        ) : (
          <EmptyState variant="plain" title="This build is no longer published" />
        )}
      </div>
    </Panel>
  );
}
