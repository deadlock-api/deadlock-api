import type { PlayerMatchHistoryEntry } from "deadlock_api_client";

export const ACCOUNT_ID = 74963221;
export const CURRENT_MATCH = 2998;
export const API_ORIGIN = "http://127.0.0.1:4319";
export const TRACKER_URL = `/tracker/players/${ACCOUNT_ID}?date_range=_&match=${CURRENT_MATCH}`;

// Deliberately synthetic, small assets keep browser checks independent of live data and image CDNs.
const image =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%2367b3c2'/%3E%3C/svg%3E";
export const heroes = [
  { id: 11, name: "Dynamo", class_name: "hero_dynamo" },
  { id: 1, name: "Infernus", class_name: "hero_infernus" },
].map(({ id, name, class_name }) => ({
  id,
  name,
  class_name,
  player_selectable: true,
  disabled: false,
  in_development: false,
  images: { minimap_image: image, minimap_image_webp: image },
  items: { signature1: "ability_test" },
}));

export const upgrades = Array.from({ length: 20 }, (_, index) => ({
  id: 100 + index,
  name: `${index < 10 ? "Sold" : "Final"} Item ${index + 1}`,
  class_name: `item_test_${index}`,
  shopable: true,
  disabled: false,
  cost: 500,
  item_tier: 1,
  item_slot_type: "spirit",
  shop_image: image,
  shop_image_webp: image,
  shop_image_small: image,
}));

export const abilities = [{ id: 10, name: "Test Pulse", class_name: "ability_test", image, image_webp: image }];

export const history: PlayerMatchHistoryEntry[] = Array.from({ length: 50 }, (_, index) => ({
  account_id: ACCOUNT_ID,
  match_id: 3000 - index,
  start_time: Date.parse("2026-09-15T12:00:00Z") / 1000 - index * 7200,
  hero_id: index % 2 === 0 ? 11 : 1,
  hero_level: 20,
  game_mode: 1,
  match_mode: 1,
  player_team: 0,
  match_result: index % 2,
  player_match_outcome: 1,
  player_kills: 5,
  player_deaths: 2,
  player_assists: 8,
  net_worth: 18000,
  match_duration_s: 1200,
  last_hits: 80,
  denies: 3,
  objectives_mask_team0: 0,
  objectives_mask_team1: 0,
}));

const items = [
  ...[0, 300, 600].map((time, index) => ({ item_id: 10, game_time_s: time, upgrade_id: index })),
  ...upgrades.map((item, index) => ({
    item_id: item.id,
    game_time_s: (index + 1) * 50,
    sold_time_s: index < 10 ? (index + 1) * 50 + 25 : 0,
  })),
];

export const metadata = {
  winning_team: "Team0",
  objectives: [],
  mid_boss: [],
  players: [
    { account_id: ACCOUNT_ID, personaname: "Tracker Tester", hero_id: 11, team: "Team0", player_slot: 1 },
    { account_id: 42, personaname: "Test Opponent", hero_id: 1, team: "Team1", player_slot: 2 },
  ].map(({ account_id, personaname, hero_id, team, player_slot }, index) => ({
    account_id,
    hero_id,
    team,
    player_slot,
    steam: { personaname },
    assigned_lane: 1,
    kills: 5,
    deaths: 2,
    assists: 8,
    net_worth: 18000 - index * 1000,
    player_level: 20,
    last_hits: 80,
    denies: 3,
    max_player_damage: 10000,
    max_player_damage_taken: 9000,
    max_boss_damage: 2000,
    items: index === 0 ? items : [],
    stats: [0, 540, 1200].map((time) => ({ time_stamp_s: time, net_worth: time * (15 - index), player_healing: 100 })),
    death_details: [
      { game_time_s: 300, killer_player_slot: index === 0 ? 2 : 1, death_duration_s: 20, time_to_kill_s: 3 },
    ],
  })),
};

export interface GraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
}

export function requestedMatchId(body: GraphqlRequest): number | undefined {
  for (const value of Object.values(body.variables ?? {})) {
    if (value && typeof value === "object" && "match_id" in value) {
      return (value as { match_id: { eq: number } }).match_id.eq;
    }
  }
  return undefined;
}

export function fixtureResponse(url: URL, body?: GraphqlRequest): unknown {
  if (url.pathname === "/health") return { ok: true };
  if (url.pathname === "/v1/assets/heroes") return heroes;
  if (url.pathname === "/v1/assets/ranks" || url.pathname === "/v1/assets/ranked-seasons") return [];
  if (url.pathname.startsWith("/v1/assets/items"))
    return url.pathname.endsWith("/by-type/ability") ? abilities : upgrades;
  if (url.pathname === "/v1/players/steam")
    return [{ account_id: ACCOUNT_ID, personaname: "Tracker Tester", avatarfull: image }];
  if (url.pathname.endsWith("/match-history")) return history;
  if (url.pathname.endsWith("/rank")) return { badge: 0 };
  if (
    url.pathname.endsWith("/mate-stats") ||
    url.pathname.endsWith("/enemy-stats") ||
    url.pathname.endsWith("/metrics")
  )
    return [];
  if (url.pathname === "/v1/graphql")
    return { data: body?.query.includes("matches") ? { matches: [metadata] } : { items: abilities } };
  if (url.pathname.includes("/patreon/")) return {};
  return undefined;
}
