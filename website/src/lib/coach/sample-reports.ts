import type { Report } from "./report";

// A worked "match review" used by /chat?demo=match and during design
// iteration. Exercises most block types so the renderer never goes
// untested. Hero/item ids are real Deadlock ids; coordinates are eyeballed.

// A clean "ahead, then collapse" story: climbs to a 72% peak around the 12:00
// lead, wobbles at the first bad fight, then slides hard after the 15:00 ace.
function winCurve(): { t: number; p: number }[] {
  const pts: { t: number; p: number }[] = [];
  for (let t = 0; t <= 2040; t += 60) {
    let p = 0.5;
    if (t <= 720)
      p = 0.5 + (t / 720) * 0.22; // building the lead
    else if (t <= 900)
      p = 0.72 - ((t - 720) / 180) * 0.04; // peak, slight wobble
    else if (t <= 1500)
      p = 0.68 - ((t - 900) / 600) * 0.26; // the slide
    else p = 0.42 - ((t - 1500) / 540) * 0.34; // the collapse
    p += 0.015 * Math.sin(t / 90); // small fight-to-fight noise
    pts.push({ t, p: Math.min(0.97, Math.max(0.04, Number(p.toFixed(3)))) });
  }
  pts[pts.length - 1].p = 0.06;
  return pts;
}

// Each route point is [x, y] or [x, y, dead]. A `dead` point is parked at the
// team fountain so the renderer can gray the player out.
type RoutePoint = [number, number] | [number, number, boolean];

function track(
  heroId: number,
  team: 0 | 1,
  isFocus: boolean,
  route: RoutePoint[],
): {
  label: string;
  hero_id: number;
  team: 0 | 1;
  is_focus: boolean;
  samples: { t: number; at: { x: number; y: number }; dead?: boolean }[];
} {
  return {
    label: isFocus ? "You" : `Hero ${heroId}`,
    hero_id: heroId,
    team,
    is_focus: isFocus,
    samples: route.map(([x, y, dead], i) => ({
      t: (i / (route.length - 1)) * 2040,
      at: { x, y },
      ...(dead ? { dead: true } : {}),
    })),
  };
}

export const SAMPLE_MATCH_REPORT: Report = {
  summary:
    "Tough loss on Haze. You won lane and hit a 4k soul lead by 12:00, then over-extended into the enemy jungle three times and handed back the game in mid-game fights.",
  blocks: [
    {
      type: "header",
      title: "Haze match review",
      subtitle: "Ranked, 34:00, Sapphire Flame loss",
      verdict: "You won the lane and lost the map.",
      verdict_tone: "critical",
      hero_id: 35,
      chips: [
        { label: "Result", value: "Loss", icon: "skull", tone: "critical" },
        { label: "KDA", value: "12 / 9 / 7", icon: "swords" },
        { label: "Souls/min", value: "212", icon: "coins", tone: "success" },
        { label: "Rank", value: "Archon", icon: "trophy" },
      ],
    },
    {
      type: "stat_cards",
      cards: [
        {
          label: "Net worth",
          value: "38.4k",
          icon: "coins",
          tone: "warning",
          delta: "-6.2k",
          delta_direction: "down",
          delta_is_good: false,
          hint: "vs lane opp",
        },
        {
          label: "Last hits",
          value: "248",
          icon: "target",
          tone: "success",
          delta: "+31",
          delta_direction: "up",
          delta_is_good: true,
        },
        { label: "Deaths in jungle", value: "5", icon: "skull", tone: "critical", hint: "3 of them solo" },
        { label: "Souls unspent", value: "4.1k", icon: "hourglass", tone: "warning", hint: "peaked at 18:30" },
        { label: "Orb control", value: "61%", icon: "gauge", tone: "success", sparkline: [40, 52, 58, 61, 59, 64] },
      ],
    },
    {
      type: "section",
      title: "How the game flowed",
      icon: "activity",
      children: [
        {
          type: "win_probability_chart",
          title: "Win chance over time",
          subtitle: "You were ahead until the 15:00 jungle fight",
          points: winCurve(),
          swings: [
            { x: 720, label: "4k lead", tone: "success" },
            { x: 900, label: "First bad fight", tone: "critical" },
          ],
        },
      ],
    },
    {
      type: "grid",
      columns: 2,
      children: [
        {
          type: "bar_chart",
          title: "When you win vs. when you lose",
          x_key: "stat",
          series: [
            { key: "win", label: "Wins", color: "#34d399" },
            { key: "loss", label: "Losses", color: "#fa4454" },
          ],
          data: [
            { stat: "Kills", win: 10.2, loss: 5.1 },
            { stat: "Deaths", win: 4.8, loss: 8.9 },
            { stat: "Assists", win: 12.4, loss: 7.6 },
          ],
        },
        {
          type: "radar_chart",
          title: "Game profile",
          axes: [
            { key: "farm", label: "Farm" },
            { key: "fight", label: "Fighting" },
            { key: "objectives", label: "Objectives" },
            { key: "vision", label: "Vision" },
            { key: "survival", label: "Survival" },
          ],
          series: [
            { key: "you", label: "You" },
            { key: "avg", label: "Rank avg" },
          ],
          data: [
            { axis: "Farm", you: 82, avg: 70 },
            { axis: "Fighting", you: 64, avg: 66 },
            { axis: "Objectives", you: 48, avg: 68 },
            { axis: "Vision", you: 35, avg: 60 },
            { axis: "Survival", you: 40, avg: 65 },
          ],
        },
      ],
    },
    {
      type: "minimap",
      title: "The scene that lost the game",
      subtitle:
        "You farmed alone deep in the enemy jungle while your team grouped mid for Mid-boss. All five enemies were unaccounted for — and they were already converging on you.",
      critical: true,
      scene_clock: "15:00",
      scene_t: 900,
      headline: "The moment you lost the game",
      correction:
        "When you're 3k+ ahead, group with your team and take Mid-boss as a five. Only farm the enemy jungle when you have vision of at least 3 enemy heroes — otherwise you're gifting them the comeback.",
      win_prob: winCurve(),
      show_objectives: true,
      // A freeze-frame of one teamfight: every hero on the map at 15:00.
      // team1 (you + allies) = blue, team0 (enemies) = amber. The focus hero
      // is isolated bottom-right; the enemy five collapse on him.
      markers: [
        // YOU — isolated deep in the enemy jungle, no allies within reach.
        {
          at: { x: 0.73, y: 0.63 },
          kind: "hero",
          hero_id: 35,
          tone: "accent",
          focus: true,
          label: "Caught alone",
          detail:
            "You're alone in the enemy jungle with no camera and your whole team a full screen away at Mid-boss. With all five enemies missing, this is a 1v5 the moment you're spotted — there is no farm worth this risk. Back to your team and take Mid-boss as a five; the lead was already yours.",
        },
        // YOUR TEAM (team1, blue) — grouped mid for Mid-boss, out of position
        // to help. Portraits + team color carry identity; no name labels so
        // the board stays readable.
        { at: { x: 0.43, y: 0.4 }, kind: "hero", hero_id: 15, tone: "team1" },
        { at: { x: 0.36, y: 0.5 }, kind: "hero", hero_id: 20, tone: "team1" },
        { at: { x: 0.44, y: 0.58 }, kind: "hero", hero_id: 17, tone: "team1" },
        // One ally already dead, sitting at your fountain (top-middle).
        { at: { x: 0.5, y: 0.07 }, kind: "hero", hero_id: 27, tone: "team1", dimmed: true },
        // ENEMY TEAM (team0, amber) — five collapsing on you from the jungle.
        { at: { x: 0.86, y: 0.44 }, kind: "hero", hero_id: 31, tone: "team0" },
        { at: { x: 0.9, y: 0.58 }, kind: "hero", hero_id: 6, tone: "team0" },
        { at: { x: 0.85, y: 0.7 }, kind: "hero", hero_id: 11, tone: "team0" },
        { at: { x: 0.72, y: 0.74 }, kind: "hero", hero_id: 10, tone: "team0" },
        // One enemy dead at their fountain (bottom-middle) — a 4v5 you could
        // have won grouped, but not isolated.
        { at: { x: 0.5, y: 0.93 }, kind: "hero", hero_id: 8, tone: "team0", dimmed: true },
      ],
      paths: [
        // The enemy collapse onto you.
        {
          points: [
            { x: 0.9, y: 0.46 },
            { x: 0.83, y: 0.52 },
            { x: 0.78, y: 0.56 },
          ],
          label: "Enemy collapse",
          tone: "critical",
          width: 4,
        },
        {
          points: [
            { x: 0.8, y: 0.74 },
            { x: 0.75, y: 0.66 },
          ],
          tone: "critical",
          width: 4,
        },
        // What you should have done: rotate back to your team at Mid-boss.
        {
          points: [
            { x: 0.71, y: 0.63 },
            { x: 0.6, y: 0.57 },
            { x: 0.52, y: 0.52 },
          ],
          label: "Rotate to your team",
          tone: "success",
          dashed: true,
          width: 3.5,
        },
      ],
      zones: [
        {
          shape: "circle",
          at: { x: 0.78, y: 0.6 },
          radius: 0.18,
          label: "Kill box (you're trapped)",
          tone: "critical",
        },
        { shape: "circle", at: { x: 0.44, y: 0.49 }, radius: 0.13, label: "Your team @ Mid-boss", tone: "team1" },
      ],
      legend: [
        { label: "You (focus)", value: "", tone: "accent", icon: "crosshair" },
        { label: "Your team", value: "", tone: "team1", icon: "users" },
        { label: "Enemies", value: "", tone: "team0", icon: "swords" },
        { label: "Dead (at fountain)", value: "", tone: "neutral", icon: "skull" },
      ],
    },
    {
      type: "match_replay",
      title: "Replay: the 15:00 fight",
      subtitle: "Scrub the match. You walk into a 3-man collapse with no vision.",
      duration_s: 2040,
      win_prob: winCurve(),
      tracks: [
        // You (focus): safe farm in lane, then the fatal walk into the enemy
        // buff. You die at the 15:00 collapse and sit dead at the team-1
        // fountain (top-middle) before respawning and walking back out.
        track(35, 1, true, [
          [0.22, 0.82],
          [0.3, 0.74],
          [0.4, 0.64],
          [0.46, 0.58],
          [0.43, 0.62],
          [0.5, 0.56],
          [0.65, 0.47],
          [0.5, 0.06, true],
          [0.5, 0.06, true],
          [0.5, 0.06, true],
          [0.42, 0.18],
          [0.4, 0.3],
        ]),
        // Your teammate (Wraith) — peels off mid, doesn't follow you in.
        track(15, 1, false, [
          [0.5, 0.78],
          [0.5, 0.7],
          [0.48, 0.62],
          [0.5, 0.55],
          [0.52, 0.52],
          [0.5, 0.5],
          [0.48, 0.52],
          [0.46, 0.56],
          [0.48, 0.6],
          [0.5, 0.62],
        ]),
        // Enemy Lash — flanks from their backline to collapse on you.
        track(31, 0, false, [
          [0.82, 0.22],
          [0.78, 0.3],
          [0.74, 0.36],
          [0.72, 0.42],
          [0.71, 0.45],
          [0.7, 0.46],
          [0.69, 0.47],
          [0.68, 0.47],
          [0.67, 0.47],
          [0.66, 0.48],
        ]),
        // Enemy Abrams — second pincer from the jungle entrance.
        track(6, 0, false, [
          [0.86, 0.5],
          [0.82, 0.5],
          [0.78, 0.5],
          [0.74, 0.49],
          [0.72, 0.49],
          [0.7, 0.48],
          [0.69, 0.48],
          [0.68, 0.48],
          [0.67, 0.48],
          [0.66, 0.48],
        ]),
      ],
      annotations: [
        {
          t: 720,
          title: "Peak lead",
          body: "You hit a 4k soul lead. This was the moment to force mid-boss with your team, not to keep farming the enemy jungle.",
          tone: "success",
        },
        {
          t: 900,
          title: "First over-extend",
          body: "Pushed to the enemy secret shop alone with both enemy supports unaccounted for. Caught and killed, dropped a 900 bounty.",
          tone: "critical",
        },
        {
          t: 1500,
          title: "The fight that lost it",
          body: "Walked into the enemy jungle with no camera nearby. Three enemies collapsed; you died first and your team got aced trying to follow up.",
          tone: "critical",
        },
      ],
      objective_events: [
        { t: 360, label: "Guardian", detail: "You took the enemy mid Guardian", tone: "team1", icon: "objective" },
        { t: 600, label: "Walker", detail: "Enemy took your top Walker", tone: "team0", icon: "objective" },
        { t: 1050, label: "Mid-boss", detail: "Enemy secured the Mid-boss for free", tone: "team0", icon: "trophy" },
        { t: 1700, label: "Walker", detail: "Enemy took your mid Walker", tone: "team0", icon: "objective" },
        { t: 1980, label: "Base Guardian", detail: "Enemy broke your base", tone: "team0", icon: "shield" },
      ],
    },
    {
      type: "section",
      title: "Three fixes for next game",
      icon: "lightbulb",
      children: [
        {
          type: "callout",
          tone: "tip",
          title: "Convert leads to objectives",
          body: "When you are 3k+ up, your farm lead is *currency for objectives*. Ping mid-boss and group, don't solo the enemy jungle.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Buy a camera before deep farming",
          body: "All five of your jungle deaths had no nearby camera. One Spirit Cam on the enemy buff side turns three of those deaths into easy escapes.",
        },
        {
          type: "callout",
          tone: "critical",
          title: "Spend your souls",
          body: "You sat on 4.1k at 18:30. That is a full item you didn't have in the fight that lost the game. Back and buy when you cross 1.5k unspent.",
        },
      ],
    },
    {
      type: "grid",
      columns: 2,
      children: [
        {
          type: "item_build",
          title: "Your build (for reference)",
          phases: [
            { label: "Early", item_ids: [1248737459, 1998374599, 3970837787], note: "good tempo" },
            { label: "Mid", item_ids: [3970837787, 3261353684], note: "1 item late" },
            { label: "Late", item_ids: [2566692615, 3884003354], note: "never online" },
          ],
        },
        {
          type: "scoreboard",
          title: "Final scoreboard",
          players: [
            { hero_id: 15, team: 0, name: "Wraith", kills: 14, deaths: 6, assists: 12, net_worth: 44600 },
            { hero_id: 31, team: 0, name: "Lash", kills: 9, deaths: 7, assists: 16, net_worth: 41200 },
            {
              hero_id: 35,
              team: 1,
              name: "You (Haze)",
              kills: 12,
              deaths: 9,
              assists: 7,
              net_worth: 38400,
              is_focus: true,
            },
            { hero_id: 6, team: 1, name: "Abrams", kills: 5, deaths: 11, assists: 9, net_worth: 31000 },
          ],
        },
      ],
    },
    {
      type: "suggested_questions",
      title: "Ask me to go deeper",
      questions: [
        { text: "Why did we lose two walkers after I pushed mid?", icon: "shield" },
        { text: "Was contesting the mid-boss at 18:00 the mistake?", icon: "skull" },
        { text: "What should I have built once their Abrams got online?", icon: "trophy" },
        { text: "Where did the game actually flip?", icon: "trending-down" },
      ],
    },
  ],
};

export const SAMPLE_REPORTS: Record<string, Report> = {
  match: SAMPLE_MATCH_REPORT,
};
