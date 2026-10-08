import { heroId, heroIds, previousPatchId, sortParam } from "../readers";
import type { RegisteredPage } from "../types";

export const COMMUNITY_PAGES: RegisteredPage[] = [
  {
    id: "rank_distribution",
    label: "Rank distribution",
    description: "how many players are in each rank: rank distribution, what percentile a rank is",
    path: "/community/badge-distribution",
    search: { metric: sortParam({ matches: "matches" }) },
    filters: ["time"],
  },
  {
    id: "heatmap",
    label: "Kill heatmap",
    description: "a map heatmap of where kills and deaths happen, optionally for one hero",
    path: "/community/heatmap",
    search: { hero_id: heroId(), view: sortParam({ kills: "kills", deaths: "deaths", kda: "kd" }) },
    filters: ["mode", "rank", "time"],
  },
  {
    id: "patch_notes",
    label: "Patch notes",
    description: "what changed in a patch: patch notes and the stats before and after the latest update",
    context:
      "For the changes themselves. Whether a hero or item got stronger or weaker over time is heroes_over_time or " +
      "item_stats.",
    path: "/patches/$patchId",
    pathParams: { patchId: previousPatchId() },
    fallbackPath: "/patches",
  },
  {
    id: "sounds",
    label: "Sounds",
    description: "hero voice lines and game sound effects to listen to",
    path: "/sounds",
    search: { heroes: heroIds() },
  },
  {
    id: "crosshair",
    label: "Crosshair editor",
    description: "design a crosshair and copy its code into the game",
    path: "/crosshair",
  },
  {
    id: "streamkit",
    label: "Stream kit",
    description: "rank and stats overlays and widgets for a livestream",
    path: "/streamkit",
  },
  {
    id: "data_dumps",
    label: "Data dumps",
    description: "download the raw match data or query it with SQL; the public data lake",
    path: "/data-dumps",
  },
  {
    id: "deadlockdle",
    label: "Deadlockdle",
    description: "a daily guessing game about heroes, items and abilities",
    path: "/games/deadlockdle",
  },
  {
    id: "flashcards",
    label: "Flashcards",
    description: "flashcards to learn hero abilities and item effects",
    path: "/games/flashcards",
  },
];
