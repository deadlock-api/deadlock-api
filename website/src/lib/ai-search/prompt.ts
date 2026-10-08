import { NO_FILTERS, type SearchIntent } from "./intent";
import { PAGE_IDS, PAGES } from "./pages";

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You route questions about the video game Deadlock to the page of deadlock-api.com that shows the answer.
You never answer the question yourself. You reply with one JSON object that picks the page and its filters.

Pages:
${PAGE_IDS.map((id) => `- ${id}: ${PAGES[id].meaning}`).join("\n")}

Fields:
- heroes: the heroes the question is about, in the order named. On team_builder: the player's own team.
- enemy_heroes: only for team_builder, the opposing team. Otherwise [].
- items: the shop items the question names.
- rank_min / rank_max: rank tiers the question limits to ("phantom and up" sets only rank_min). Otherwise null.
- mode: "ranked", "unranked" or "street_brawl" when the question says so, otherwise "default".
- time: "current_patch" for "this patch" or "since the last patch"; "previous_patch" for "before the patch" or "last patch's numbers"; "current_season", "previous_season", "last_7_days", "last_30_days"; otherwise "default".
- region: the leaderboard region the question names (NAmerica, SAmerica, Europe, Asia, Oceania), otherwise null.
- metric: the stat the question ranks by, otherwise "default".

Hidden King and Archmother are the two team sides, not heroes. A question naming one hero's counters, or one hero against another, is hero_counters.`;

const EXAMPLES: [string, SearchIntent][] = [
  ["hidden king vs archmother since last patch", { ...NO_FILTERS, page: "team_sides", time: "current_patch" }],
  ["best counter against bebop", { ...NO_FILTERS, page: "hero_counters", heroes: ["Bebop"] }],
  [
    "best heroes in eternus this season",
    { ...NO_FILTERS, page: "tier_list", rank_min: "Eternus", time: "current_season", metric: "winrate" },
  ],
  [
    "when should haze buy toxic bullets",
    { ...NO_FILTERS, page: "item_timing", heroes: ["Haze"], items: ["Toxic Bullets"] },
  ],
  ["top players in europe", { ...NO_FILTERS, page: "leaderboard", region: "Europe" }],
  [
    "seven and wraith vs abrams and dynamo",
    { ...NO_FILTERS, page: "team_builder", heroes: ["Seven", "Wraith"], enemy_heroes: ["Abrams", "Dynamo"] },
  ],
];

/** The session's opening: the routing rules, then worked examples the model continues in kind. */
export function initialPrompts(): PromptMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...EXAMPLES.flatMap(([question, intent]): PromptMessage[] => [
      { role: "user", content: question },
      { role: "assistant", content: JSON.stringify(intent) },
    ]),
  ];
}
