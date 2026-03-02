import { useQuery } from "@tanstack/react-query";
import type { RankV2 } from "assets_deadlock_api_client/api";
import { ChevronDown } from "lucide-react";
import BadgeImage from "~/components/BadgeImage";
import HeroImage from "~/components/HeroImage";
import ItemImage from "~/components/ItemImage";
import { api } from "~/lib/api";
import { cn } from "~/lib/utils";

export interface MatchHistoryCardPlayer {
  heroId: number;
  name: string;
}

export interface FullBuildItem {
  itemId: number;
  gameTimeS: number;
  sold: boolean;
}

export interface MatchHistoryCardProps {
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
  fullBuildItems?: FullBuildItem[];
  averageBadge?: number;
  ranks?: RankV2[];
  placement?: string;
  placementLabel?: string;
  teams?: [MatchHistoryCardPlayer[], MatchHistoryCardPlayer[]];
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
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

function FullBuildPhase({ label, items }: { label: string; items: FullBuildItem[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.length > 0 ? (
          items.map((item, i) => (
            <div key={`${item.itemId}-${i}`} className="relative">
              <ItemImage
                itemId={item.itemId}
                className={cn("size-6 rounded-sm", item.sold && "opacity-50")}
              />
              {item.sold && (
                <div className="absolute inset-0 rounded-sm bg-red-500/40 pointer-events-none" />
              )}
            </div>
          ))
        ) : (
          <span className="text-[10px] text-muted-foreground/40 italic">—</span>
        )}
      </div>
    </div>
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
  fullBuildItems,
  averageBadge,
  ranks,
  placement,
  placementLabel,
  teams,
  expandable = true,
  expanded,
  onToggleExpand,
}: MatchHistoryCardProps) {
  const isWin = result === "win";
  const borderColor = isWin ? "border-green-500" : "border-primary";
  const accentColor = isWin ? "text-green-500" : "text-primary";
  const expandBg = isWin ? "bg-green-500/10 hover:bg-green-500/15" : "bg-primary/10 hover:bg-primary/15";
  const expandIconColor = isWin ? "text-green-500" : "text-primary";

  const topRow = itemIds.slice(0, 6);
  const bottomRow = itemIds.slice(6, 12);

  const earlyItems = fullBuildItems?.filter((i) => i.gameTimeS < EARLY_MAX_S);
  const midItems = fullBuildItems?.filter((i) => i.gameTimeS >= EARLY_MAX_S && i.gameTimeS < MID_MAX_S);
  const lateItems = fullBuildItems?.filter((i) => i.gameTimeS >= MID_MAX_S);

  const { data: steamProfile } = useQuery({
    queryKey: ["steam-profile", accountId],
    queryFn: async () => {
      const res = await api.players_api.steam({ accountIds: [accountId!] });
      return res.data[0] ?? null;
    },
    enabled: accountId != null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    <div
      className={cn(
        "flex w-full max-w-[880px] rounded-md overflow-hidden bg-card text-sm text-muted-foreground shadow-lg border-l-[6px]",
        borderColor,
      )}
    >
      {/* Main Content Area */}
      {fullBuildItems ? (
        <div className="flex flex-1 items-start gap-4 p-2 pl-3">
          {/* Match Info + Player Stats */}
          <div className="flex shrink-0 flex-col">
            <div className="flex items-center gap-2">
              <div className={cn("font-bold leading-tight", accentColor)}>{isWin ? "Victory" : "Defeat"}</div>
              {averageBadge != null && ranks && (
                <BadgeImage badge={averageBadge} ranks={ranks} className="size-6 shrink-0" />
              )}
            </div>
            <div className="text-xs text-muted-foreground">{formatDuration(durationSeconds)}</div>
            <div className="text-xs text-muted-foreground/60">{timeAgo}</div>
            <div className="text-xs text-muted-foreground/60">{matchId}</div>
            <div className="my-1.5 h-px w-full bg-border/50" />
            {steamProfile?.personaname && (
              <div className="text-xs font-medium text-foreground truncate max-w-28 mb-1">{steamProfile.personaname}</div>
            )}
            <div className="flex items-start gap-2">
              <HeroImage heroId={heroId} className="mt-0.5 size-8 shrink-0 rounded-md border border-border/50" />
              <div className="flex flex-col">
                <div className="mt-0.5 text-base font-bold leading-none tracking-wide text-foreground">
                  {kills}
                  <span className="mx-0.5 text-sm font-medium text-muted-foreground/50">/</span>
                  {deaths}
                  <span className="mx-0.5 text-sm font-medium text-muted-foreground/50">/</span>
                  {assists}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{computeKDA(kills, deaths, assists)} KDA</div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="flex shrink-0 flex-col gap-1.5">
            <FullBuildPhase label="Early" items={earlyItems!} />
            <FullBuildPhase label="Mid" items={midItems!} />
            <FullBuildPhase label="Late" items={lateItems!} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-4 p-2 pl-3">
          {/* Match Info */}
          <div className="flex w-24 shrink-0 flex-col">
            <div className={cn("font-bold leading-tight", accentColor)}>{gameMode}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{timeAgo}</div>
            <div className="text-xs text-muted-foreground/60">{matchId}</div>
            <div className="my-2 h-px w-full bg-border/50" />
            <div className="flex items-center gap-2">
              <div>
                <div className="font-bold leading-tight text-foreground">{isWin ? "Victory" : "Defeat"}</div>
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
              <HeroImage heroId={heroId} className="mt-0.5 size-11 shrink-0 rounded-md border border-border/50" />
              <div className="flex flex-col">
                <div className="mt-0.5 text-xl font-bold leading-none tracking-wide text-foreground">
                  {kills}
                  <span className="mx-0.5 text-base font-medium text-muted-foreground/50">/</span>
                  {deaths}
                  <span className="mx-0.5 text-base font-medium text-muted-foreground/50">/</span>
                  {assists}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{computeKDA(kills, deaths, assists)} KDA</div>
              </div>
            </div>
            <div className="mt-1 flex flex-col text-xs text-muted-foreground">
              {killParticipation != null && <div>{killParticipation}% KP</div>}
              {headshotPercent != null && <div>{headshotPercent}% HS</div>}
            </div>
          </div>

          {/* Items */}
          <div className="flex shrink-0 flex-col gap-1.5">
            <div className="grid grid-cols-6 gap-1">
              {topRow.map((itemId, i) => (
                <ItemImage key={`top-${i}-${itemId}`} itemId={itemId} className="size-8 rounded-sm" />
              ))}
              {bottomRow.map((itemId, i) => (
                <ItemImage key={`bot-${i}-${itemId}`} itemId={itemId} className="size-8 rounded-sm" />
              ))}
            </div>
            {(placement || placementLabel) && (
              <div className="mt-0.5 flex gap-2">
                {placement && (
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {placement}
                  </span>
                )}
                {placementLabel && (
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {placementLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Players List */}
          {teams && (
            <div className="ml-auto flex gap-8 pl-2">
              {teams.map((team, teamIdx) => (
                <div key={teamIdx} className="flex flex-col gap-1.5">
                  {team.map((player, playerIdx) => (
                    <div key={playerIdx} className="flex items-center gap-2">
                      <HeroImage heroId={player.heroId} className="size-4 shrink-0 rounded-full" />
                      <div className="w-[72px] truncate text-xs text-muted-foreground">{player.name}</div>
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
        <button
          type="button"
          onClick={onToggleExpand}
          className={cn("flex w-8 shrink-0 cursor-pointer items-center justify-center transition-colors", expandBg)}
        >
          <ChevronDown
            className={cn("size-4 transition-transform", expandIconColor, expanded && "rotate-180")}
          />
        </button>
      )}
    </div>
  );
}
