import { z } from "zod/v4";
import { day } from "../dayjs";

export const APIMatchPlayerItemSchema = z.object({
  flags: z.int(),
  game_time_s: z.int(),
  imbued_ability_id: z.int(),
  item_id: z.int(),
  sold_time_s: z.int(),
  upgrade_id: z.int(),
});

export type APIMatchPlayerItem = z.infer<typeof APIMatchPlayerItemSchema>;

export const APIMatchPlayerSchema = z.object({
  abandon_match_time_s: z.int(),
  ability_points: z.int(),
  account_id: z.int(),
  assigned_lane: z.int(),
  assists: z.int(),
  deaths: z.int(),
  denies: z.int(),
  hero_id: z.int(),
  items: z.array(APIMatchPlayerItemSchema),
  kills: z.int(),
  last_hits: z.int(),
  net_worth: z.int(),
  party: z.int(),
  player_level: z.int(),
  player_slot: z.int(),
  team: z.enum(["Team0", "Team1"]),
});

export type APIMatchPlayer = z.infer<typeof APIMatchPlayerSchema>;

export const APIMatchMetadataSchema = z.object({
  average_badge_team0: z.int().nullable(),
  average_badge_team1: z.int().nullable(),
  duration_s: z.int(),
  game_mode: z.string(),
  game_mode_version: z.int().nullable(),
  is_high_skill_range_parties: z.boolean().nullable(),
  low_pri_pool: z.boolean().nullable(),
  match_id: z.int(),
  match_mode: z.string(),
  match_outcome: z.string(),
  new_player_pool: z.boolean().nullable(),
  players: z.array(APIMatchPlayerSchema),
  start_time: z.string().transform((val) => day.utc(val).local()),
  winning_team: z.enum(["Team0", "Team1"]),
});

export type APIMatchMetadata = z.infer<typeof APIMatchMetadataSchema>;
