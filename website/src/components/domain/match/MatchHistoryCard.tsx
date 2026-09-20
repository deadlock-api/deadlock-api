import { useQuery } from "@tanstack/react-query";
import type { Rank } from "deadlock_api_client";
import { ChevronDown } from "lucide-react";

import { BadgeImage } from "~/components/domain/assets/BadgeImage";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { KdaLine } from "~/components/domain/match/KdaLine";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { CornerBadge } from "~/components/ui/corner-badge";
import { PanelTooltipContent } from "~/components/ui/panel-tooltip";
import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { CACHE_DURATIONS } from "~/constants/cache";
import { api } from "~/lib/api";
import { TONE_BORDER, TONE_TEXT } from "~/lib/tone";
import { cn } from "~/lib/utils";
import { queryKeys } from "~/queries/query-keys";

export interface MatchHistoryCardPlayer {
  heroId: number;
  name: string;
}

export interface FullBuildItem {
  itemId: number;
  gameTimeS: number;
  sold: boolean;
  /** When truly sold (not upgraded), the game time the item was sold. */
  soldTimeS?: number;
  /** Cumulative souls spent on items at the moment of this purchase (refund-adjusted). */
  soulsSpent?: number;
  imbuedAbilityNumber?: number;
}

export interface BuildData {
  items: FullBuildItem[];
  abilityBuildOrder?: number[];
  abilityUpgradeSequence?: number[];
}

export interface MatchHistoryCardProps extends Omit<React.ComponentProps<typeof Card>, "children" | "size" | "tone"> {
  gameMode: string;
  timeAgo: string;
  matchId: number;
  result: "win" | "loss";
  durationSeconds: number;
  heroId: number;
  accountId?: number;
  kills: number;
  deaths: number;
  assists: number;
  killParticipation?: number;
  headshotPercent?: number;
  itemIds: number[];
  buildData?: BuildData;
  averageBadge?: number;
  ranks?: Rank[];
  placement?: string;
  placementLabel?: string;
  teams?: [MatchHistoryCardPlayer[], MatchHistoryCardPlayer[]];
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** When provided, the player's name becomes a button that invokes this with the resolved persona name. */
  onPlayerClick?: (name?: string) => void;
  /** Pre-fetched Steam profile. When provided the card skips its own profile query. */
  steamProfile?: { personaname: string } | null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function computeKDA(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) return "Perfect";
  return ((kills + assists) / deaths).toFixed(2);
}

const EARLY_MAX_S = 10 * 60; // 0–10 min
const MID_MAX_S = 20 * 60; // 10–20 min
const ABILITY_SLOTS = [1, 2, 3, 4] as const;

function FullBuildPhase({ label, items }: { label: string; items: FullBuildItem[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="eyebrow">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={`${item.itemId}-${item.gameTimeS}`} className="relative">
              <ItemImage itemId={item.itemId} className={cn("size-6 rounded-sm", item.sold && "opacity-50")} />
              {item.sold && <div className="pointer-events-none absolute inset-0 rounded-sm bg-negative/40" />}
              {item.imbuedAbilityNumber != null && (
                <CornerBadge corner="bottom-end" tone="scrim">
                  {item.imbuedAbilityNumber}
                </CornerBadge>
              )}
            </div>
          ))
        ) : (
          <span className="text-3xs text-muted-foreground italic">—</span>
        )}
      </div>
    </div>
  );
}

function AbilityBuildTooltip({ abilityUpgradeSequence }: { abilityUpgradeSequence: number[] }) {
  const seenCounts = new Map<number, number>();
  const sequenceColumns = abilityUpgradeSequence.map((slot) => {
    const count = (seenCounts.get(slot) ?? 0) + 1;
    seenCounts.set(slot, count);
    return { slot, key: `${slot}-${count}` };
  });

  return (
    <>
      {ABILITY_SLOTS.map((abilityNumber) => (
        <div key={abilityNumber} className="flex items-center gap-2">
          <span className="w-2 text-3xs font-semibold text-muted-foreground">{abilityNumber}</span>
          <div className="flex gap-1">
            {sequenceColumns.map(({ slot, key }) => (
              <span
                key={`${abilityNumber}-${key}`}
                className={cn(
                  "size-2 rounded-full border",
                  slot === abilityNumber ? "border-info bg-info" : "border-muted-foreground/35 bg-transparent",
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export default function MatchHistoryCard({
  gameMode,
  timeAgo,
  matchId,
  result,
  durationSeconds,
  heroId,
  accountId,
  kills,
  deaths,
  assists,
  killParticipation,
  headshotPercent,
  itemIds,
  buildData,
  averageBadge,
  ranks,
  placement,
  placementLabel,
  teams,
  expandable = true,
  expanded,
  onToggleExpand,
  onPlayerClick,
  steamProfile: steamProfileProp,
  className,
  ...props
}: MatchHistoryCardProps) {
  const isWin = result === "win";
  const tone = isWin ? "positive" : "negative";
  const accentColor = TONE_TEXT[tone];

  const topRow = itemIds.slice(0, 6);
  const bottomRow = itemIds.slice(6, 12);

  const earlyItems = buildData?.items.filter((i) => i.gameTimeS < EARLY_MAX_S) ?? [];
  const midItems = buildData?.items.filter((i) => i.gameTimeS >= EARLY_MAX_S && i.gameTimeS < MID_MAX_S) ?? [];
  const lateItems = buildData?.items.filter((i) => i.gameTimeS >= MID_MAX_S) ?? [];

  const { data: fetchedProfile } = useQuery({
    queryKey: queryKeys.steam.profile(accountId),
    queryFn: async () => {
      if (accountId == null) return null;
      const res = await api.steam_api.steam({ accountIds: [accountId] });
      return res.data[0] ?? null;
    },
    enabled: accountId != null && steamProfileProp === undefined,
    staleTime: CACHE_DURATIONS.FOREVER,
  });

  const steamProfile = steamProfileProp !== undefined ? steamProfileProp : fetchedProfile;

  return (
    <Card
      size="flush"
      className={cn(
        "w-full max-w-220 flex-row border-0 border-s-4 text-sm text-muted-foreground",
        TONE_BORDER[tone],
        className,
      )}
      {...props}
    >
      {/* Main Content Area */}
      {buildData ? (
        <div className="flex flex-1 items-start gap-4 p-2 ps-3">
          {/* Match Info + Player Stats */}
          <div className="flex shrink-0 flex-col gap-1.5">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <div className={cn("leading-tight font-bold", accentColor)}>{isWin ? "Victory" : "Defeat"}</div>
                {averageBadge != null && ranks && (
                  <BadgeImage badge={averageBadge} ranks={ranks} className="size-6 shrink-0" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">{formatDuration(durationSeconds)}</div>
              <div className="text-xs text-muted-foreground">{timeAgo}</div>
              <div className="text-xs text-muted-foreground">{matchId}</div>
            </div>
            <div className="h-px w-full bg-border/50" />
            {steamProfile?.personaname &&
              (onPlayerClick ? (
                <Button
                  variant="link"
                  size="xs"
                  onClick={() => onPlayerClick(steamProfile.personaname)}
                  className="h-auto max-w-28 justify-start p-0 text-foreground hover:text-primary"
                  title={`View ${steamProfile.personaname}'s recent builds on this hero`}
                >
                  <span className="truncate">{steamProfile.personaname}</span>
                </Button>
              ) : (
                <div className="max-w-28 truncate text-xs font-medium text-foreground">{steamProfile.personaname}</div>
              ))}
            <div className="flex items-start gap-2">
              <HeroImage heroId={heroId} shape="rounded" ring="border" className="size-8 shrink-0" />
              <div className="flex flex-col gap-1">
                <KdaLine kills={kills} deaths={deaths} assists={assists} />
                <div className="text-2xs text-muted-foreground">{computeKDA(kills, deaths, assists)} KDA</div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <FullBuildPhase label="Early" items={earlyItems} />
            <FullBuildPhase label="Mid" items={midItems} />
            <FullBuildPhase label="Late" items={lateItems} />
            {buildData.abilityBuildOrder && buildData.abilityBuildOrder.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- opens the tooltip on keyboard focus
                    tabIndex={0}
                    className="w-fit rounded-sm eyebrow outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    AP:{" "}
                    <span className="text-foreground">
                      {buildData.abilityBuildOrder.map((slot, i) => (
                        // eslint-disable-next-line react/no-array-index-key -- slots can repeat
                        <span key={`${slot}-${i}`}>
                          {i > 0 && <span className="text-muted-foreground"> › </span>}
                          {slot}
                        </span>
                      ))}
                    </span>
                  </span>
                </TooltipTrigger>
                {buildData.abilityUpgradeSequence && buildData.abilityUpgradeSequence.length > 0 && (
                  <PanelTooltipContent side="top" className="gap-1.5">
                    <AbilityBuildTooltip abilityUpgradeSequence={buildData.abilityUpgradeSequence} />
                  </PanelTooltipContent>
                )}
              </Tooltip>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-4 p-2 ps-3">
          {/* Match Info */}
          <div className="flex w-24 shrink-0 flex-col gap-2">
            <div className="flex flex-col">
              <div className="leading-tight font-bold text-foreground">{gameMode}</div>
              <div className="text-xs text-muted-foreground">{timeAgo}</div>
              <div className="text-xs text-muted-foreground">{matchId}</div>
            </div>
            <div className="h-px w-full bg-border/50" />
            <div className="flex items-center gap-2">
              <div>
                <div className={cn("leading-tight font-bold", accentColor)}>{isWin ? "Victory" : "Defeat"}</div>
                <div className="text-xs text-muted-foreground">{formatDuration(durationSeconds)}</div>
              </div>
              {averageBadge != null && ranks && (
                <BadgeImage badge={averageBadge} ranks={ranks} className="size-8 shrink-0" />
              )}
            </div>
          </div>

          {/* Player Stats */}
          <div className="flex w-32 shrink-0 flex-col gap-1">
            <div className="flex items-start gap-3">
              <HeroImage heroId={heroId} shape="rounded" ring="border" className="size-11 shrink-0" />
              <div className="flex flex-col gap-1">
                <KdaLine kills={kills} deaths={deaths} assists={assists} size="lg" />
                <div className="text-xs text-muted-foreground">{computeKDA(kills, deaths, assists)} KDA</div>
              </div>
            </div>
            <div className="flex flex-col text-xs text-muted-foreground">
              {killParticipation != null && <div>{killParticipation}% KP</div>}
              {headshotPercent != null && <div>{headshotPercent}% HS</div>}
            </div>
          </div>

          {/* Items */}
          <div className="flex shrink-0 flex-col gap-1.5">
            <div className="grid grid-cols-6 gap-1">
              {topRow.map((itemId, i) => (
                // eslint-disable-next-line react/no-array-index-key -- items can be duplicated
                <ItemImage key={`top-${i}-${itemId}`} itemId={itemId} className="size-8 rounded-sm" />
              ))}
              {bottomRow.map((itemId, i) => (
                // eslint-disable-next-line react/no-array-index-key -- items can be duplicated
                <ItemImage key={`bot-${i}-${itemId}`} itemId={itemId} className="size-8 rounded-sm" />
              ))}
            </div>
            {(placement || placementLabel) && (
              <div className="flex gap-2">
                {placement && <Badge variant="secondary">{placement}</Badge>}
                {placementLabel && <Badge variant="secondary">{placementLabel}</Badge>}
              </div>
            )}
          </div>

          {/* Players List */}
          {teams && (
            <div className="ms-auto flex gap-8 ps-2">
              {teams.map((team, teamIdx) => (
                // eslint-disable-next-line react/no-array-index-key -- teams are fixed 2-element arrays
                <div key={teamIdx} className="flex flex-col gap-1.5">
                  {team.map((player, playerIdx) => (
                    // eslint-disable-next-line react/no-array-index-key -- players have no unique id
                    <div key={playerIdx} className="flex items-center gap-2">
                      <HeroImage heroId={player.heroId} shape="circle" className="size-4 shrink-0" />
                      <div className="w-18 truncate text-xs text-muted-foreground">{player.name}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expand Button */}
      {expandable && (
        <Button
          variant={`${tone}-soft`}
          size="icon-sm"
          aria-label="Toggle match details"
          aria-expanded={expanded}
          onClick={onToggleExpand}
          className="h-auto rounded-none border-0"
        >
          <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
        </Button>
      )}
    </Card>
  );
}
