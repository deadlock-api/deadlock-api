import HeroImage from "~/components/HeroImage";
import ItemImage from "~/components/ItemImage";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type { Dayjs } from "~/dayjs";
import type { APIMatchPlayer } from "~/types/api_match_metadata";
import type { AssetsHero } from "~/types/assets_hero";
import type { AssetsItem } from "~/types/assets_item";
import { cn } from "../../lib/utils";
import RankImage from "../RankImage";

export interface MatchDisplayData {
  match: {
    match_id: number;
    start_time: Dayjs;
    duration_s?: number;
    winning_team?: string;
    game_mode?: string;
    match_mode?: string;
    average_rank_team0?: number;
    average_rank_team1?: number;
  };
  player: {
    account_id: number;
    hero_id: number;
    kills: number;
    deaths: number;
    assists: number;
    team: string;
    items: Array<{
      item_id: number;
      game_time_s: number;
      sold_time_s: number;
    }>;
    denies?: number;
    last_hits?: number;
    net_worth?: number;
    player_level?: number;
  };
  isWin: boolean;
  kda: number;
  finalItems: {
    item_id: number;
    game_time_s: number;
    sold_time_s: number;
  }[];
  hero?: AssetsHero;
  hasFullData: boolean;
  players?: APIMatchPlayer[];
}

interface MatchCardProps {
  matchData: MatchDisplayData;
  itemsMap?: Record<number, AssetsItem>;
  heroesMap?: Record<number, AssetsHero>;
  setSteamId?: (steamId: number) => void;
}

const formatSouls = (souls: number) => {
  const formatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return formatter.format(souls);
};

const HIDE_SKILL_PRIORITY = true;

// All ranks are a multiple of 10 + 1-6, so 90 is invalid, and 87 is also invalid. 81-86, 91-96 are valid, etc.
const clampRankId = (rankId: number) => {
  const tier = Math.floor(rankId / 10);
  const subrank = rankId % 10;
  if (subrank === 0) {
    return tier * 10 + 1;
  }
  if (subrank > 6) {
    return tier * 10 + 6;
  }
  return rankId;
};

export default function MatchCard({ matchData, itemsMap, heroesMap, setSteamId }: MatchCardProps) {
  const { match, player, isWin, kda, finalItems, hero, hasFullData, players } = matchData;
  const durationMinutes = Math.floor((match.duration_s || 0) / 60);
  const durationSeconds = ((match.duration_s || 0) % 60).toString().padStart(2, "0");
  const formattedDuration = `${durationMinutes}:${durationSeconds}`;

  const displayItems = finalItems.slice(0, 12);
  const paddedDisplayItems = hasFullData
    ? displayItems
    : Array.from({ length: 12 })
        .fill(null)
        .map((_) => null);

  const rankToDisplay =
    matchData.match.average_rank_team0 && matchData.match.average_rank_team1
      ? clampRankId(Math.floor((matchData.match.average_rank_team0 + matchData.match.average_rank_team1) / 2))
      : undefined;

  return (
    <Card
      className={cn(
        "text-foreground border-opacity-50 rounded-2xl shadow-lg overflow-hidden py-2",
        isWin ? "border-l-4 border-l-emerald-400" : "border-l-4 border-l-destructive",
      )}
    >
      <CardContent className="px-2 py-0 m-1">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-x-4 gap-y-8 bg-card overflow-hidden w-full ">
          {/* Left section */}
          <div className="flex flex-col gap-1 bg-muted items-start min-w-[120px]">
            <div className={`font-bold ${isWin ? "text-emerald-400" : "text-destructive"}`}>
              {isWin ? "Win" : "Loss"}
            </div>
            {hasFullData && (
              <div>
                <div className="font-bold text-foreground">{match.game_mode}</div>
                <div className="text-xs text-muted-foreground">{match.start_time.format("MM/DD HH:mm")}</div>
                <div className="text-xs text-muted-foreground">Match ID: {match.match_id}</div>
              </div>
            )}
            {!hasFullData && (
              <div>
                <div className="text-xs text-muted-foreground">{match.start_time.format("MM/DD HH:mm")}</div>
                <div className="text-xs text-muted-foreground">Match ID: {match.match_id}</div>
              </div>
            )}
            <hr className="w-full border-border my-1" />
            <div className="flex items-center justify-between gap-2 w-full">
              <div className="text-sm text-muted-foreground">{formattedDuration}</div>
              {rankToDisplay && (
                <div className="rounded-md ">
                  <RankImage rankId={rankToDisplay} size="small" className="h-8" />
                </div>
              )}
            </div>
          </div>
          {/* Center section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-x-3 mb-2">
              <div className="size-10">
                {hero ? (
                  <HeroImage heroId={hero.id} className="size-10 min-w-10 rounded-full border border-border" />
                ) : (
                  <div className="size-full bg-muted rounded-full border border-border" />
                )}
              </div>
              <div className="flex flex-col items-start">
                <div className="flex items-baseline gap-2 font-bold text-foreground ">
                  <span>{player.kills}</span>
                  <span className="text-muted-foreground font-normal">/</span>
                  <span>{player.deaths}</span>
                  <span className="text-muted-foreground font-normal">/</span>
                  <span>{player.assists}</span>
                </div>
                <div className="text-xs text-muted-foreground font-semibold">{kda.toFixed(2)} KDA</div>
              </div>
              {!HIDE_SKILL_PRIORITY && (
                <div className="flex flex-col ml-4">
                  <span className="text-xs text-muted-foreground mb-1">Skill Priority</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 bg-primary rounded" />
                    <span className="text-base">&gt;</span>
                    <div className="w-5 h-5 bg-primary rounded" />
                    <span className="text-base">&gt;</span>
                    <div className="w-5 h-5 bg-primary rounded" />
                  </div>
                </div>
              )}
              <div className="flex flex-col ml-2 text-xs text-muted-foreground gap-0.5">
                <div>
                  SPM {player.net_worth ? (player.net_worth / ((match.duration_s || 0) / 60)).toFixed(0) : "--"}
                </div>
                <div>Net Worth {player.net_worth ? formatSouls(player.net_worth) : "--"}</div>
                <div>Denies {player.denies ? player.denies.toLocaleString() : "--"}</div>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-2 w-fit mb-1">
              {Array.from({ length: 12 }).map((_, gridIdx) => {
                // CSS Grid fills row by row: positions 0,1,2,3,4,5 then 6,7,8,9,10,11
                // To get visual layout: 0 2 4 6 8 10 / 1 3 5 7 9 11
                // We need to map: grid pos 0->item 0, pos 1->item 2, pos 2->item 4, etc.
                //                 grid pos 6->item 1, pos 7->item 3, pos 8->item 5, etc.
                const row = Math.floor(gridIdx / 6);
                const col = gridIdx % 6;
                const itemIdx = col * 2 + row; // col 0: items 0,1; col 1: items 2,3; etc.
                const item = paddedDisplayItems[itemIdx];
                const key = `col${col}-row${row}`;
                if (!item) return <div key={key} className="w-8 h-8 rounded border border-border bg-muted" />;
                const itemData = itemsMap?.[item.item_id];
                return itemData ? (
                  <div key={key}>
                    <ItemImage itemId={item.item_id} className="w-8 h-8 rounded border border-border" />
                  </div>
                ) : (
                  <Skeleton key={key} className="w-8 h-8 rounded border border-border" />
                );
              })}
            </div>
          </div>
          {/* Right section: player list, grid 2 columns */}
          <div className="bg-muted flex items-start">
            <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 w-full">
              {(players || []).map((p) => (
                <div key={p.account_id} className="flex items-center gap-2">
                  {heroesMap?.[p.hero_id] ? (
                    <HeroImage heroId={p.hero_id} className="w-5 h-5 rounded-full border border-border" />
                  ) : (
                    <div className="w-5 h-5 bg-border rounded-full" />
                  )}
                  <span
                    className="truncate text-muted-foreground text-xs hover:underline hover:cursor-pointer"
                    onClick={() => setSteamId?.(p.account_id)}
                  >
                    Player {p.account_id}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
