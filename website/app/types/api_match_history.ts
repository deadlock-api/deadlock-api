import { z } from "zod/v4";
import { day } from "../dayjs";

const matchHistorySchema = z
  .object({
    account_id: z.int().nonnegative(),
    match_id: z.int().nonnegative(),
    hero_id: z.int().nonnegative(),
    hero_level: z.int().nonnegative(),
    start_time: z
      .int()
      .nonnegative()
      .transform((val) => day.unix(val)),

    game_mode: z.int(),
    match_mode: z.int(),
    player_team: z.int().transform((val) => (val === 0 ? "Team0" : "Team1")),

    player_kills: z.int().nonnegative(),
    player_deaths: z.int().nonnegative(),
    player_assists: z.int().nonnegative(),
    denies: z.int().nonnegative(),
    net_worth: z.int().nonnegative(),
    last_hits: z.int().nonnegative(),
    match_duration_s: z.int().nonnegative(),
    match_result: z
      .int()
      .nonnegative()
      .transform((val) => (val === 0 ? "Win" : "Loss")),
    objectives_mask_team0: z.int().nonnegative(),
    objectives_mask_team1: z.int().nonnegative(),

    abandoned_time_s: z.int().nonnegative().nullable().optional(),
    team_abandoned: z.boolean().nullable().optional(),
  })
  .strict();

export const MatchHistory = {
  schema: matchHistorySchema,
};

export type $MatchHistory = z.infer<typeof MatchHistory.schema>;
