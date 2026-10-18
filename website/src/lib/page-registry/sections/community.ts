import { heroCodename, heroId, heroIds, previousPatchId, sortParam } from "../readers";
import type { RegisteredPage } from "../types";

export const COMMUNITY_PAGES: RegisteredPage[] = [
  {
    id: "rank_distribution",
    title: "Rank Distribution",
    description: "how many players are in each rank: rank distribution, what percentile a rank is",
    path: "/community/badge-distribution",
    search: { metric: sortParam({ matches: "matches" }) },
    filters: ["time"],
  },
  {
    id: "heatmap",
    title: "Kill Heatmap",
    description: "a map heatmap of where kills and deaths happen, optionally for one hero",
    path: "/community/heatmap",
    search: { hero_id: heroId(), view: sortParam({ kills: "kills", deaths: "deaths", kda: "kd" }) },
    filters: ["mode", "rank", "time"],
  },
  {
    id: "patch_notes",
    title: "Patch Notes",
    description: "what changed in a patch: patch notes and the stats before and after the latest update",
    context:
      "For the changes themselves. Whether a hero or item got stronger or weaker over time is heroes_over_time or " +
      "item_stats.",
    path: "/patches/$patchId",
    pathParams: { patchId: previousPatchId() },
    fallbackPath: "/patches",
  },
  {
    id: "voice_lines",
    title: "Voice Lines",
    description: "a hero's voice lines and sounds to listen to: everything a hero says in a match",
    path: "/sounds",
    search: { character: heroCodename() },
  },
  {
    id: "hero_conversations",
    title: "Hero Conversations",
    description:
      "conversations between heroes to listen to: the lines heroes say to each other, optionally for one hero",
    path: "/sounds",
    search: { heroes: heroIds() },
    fixed: { tab: "conversations" },
  },
  {
    id: "sound_effects",
    title: "Sound Effects",
    description: "game sound effects to listen to: abilities, weapons, items, music and the menus",
    path: "/sounds",
    fixed: { tab: "effects" },
  },
  {
    id: "crosshair",
    title: "Crosshair Editor",
    description: "design a crosshair and copy its code into the game",
    path: "/crosshair",
  },
  {
    id: "streamkit",
    title: "Stream Kit",
    description: "rank and stats overlays and widgets for a livestream",
    path: "/streamkit",
  },
  {
    id: "data_dumps",
    title: "MCP & Data Lake",
    description:
      "the MCP server or connector for Claude, ChatGPT, Cursor and other AI assistants; download the raw match data " +
      "or query it with SQL or DuckDB; the public data lake and data dumps",
    path: "/data-dumps",
  },
  {
    id: "ingest_cache",
    title: "Send In Your Matches",
    description:
      "upload or send in your own matches so trackers show them: missing matches, how to upload, the background tool",
    path: "/ingest-cache",
  },
  {
    id: "deadlockdle",
    title: "Deadlockdle",
    description: "a daily guessing game about heroes, items and abilities",
    path: "/games/deadlockdle",
  },
  {
    id: "flashcards",
    title: "Flashcards",
    description: "flashcards to learn hero abilities and item effects",
    path: "/games/flashcards",
  },
  {
    id: "guess_the_rank",
    title: "Guess the Rank",
    description: "a daily game: watch gameplay clips and guess the player's rank, then see how others guessed",
    path: "/games/guess-the-rank",
  },
];
