---
title: Valve rebuilt Deadlock's Urn three times in six weeks
description: The Urn became a King of the Hill point, then split into a solo courier job and the Unstable Rift. The souls it pays out barely moved. Who collects them, and what losing it costs, changed completely.
date: 2026-07-23
author: Manuel - Deadlock API Team
tags:
  - data
  - meta
  - patch
---

In spring, a team that was ahead at twelve minutes and then lost the Urn fight still won 54.1% of the time. Today it wins 35.9%. Same lead, same objective, opposite ending.

Valve rebuilt the Urn three times between 22 May and 30 June. The strange part is what survived all three rebuilds: the Urn pays out almost exactly the same slice of a team's souls as it did in spring. What changed is who pockets it, and how much it hurts to lose it.

## The two years before all this

For most of its life the Urn has been drifting toward the status of a thing you could safely ignore.

![The Urn's share of team income fell steadily through 2025 to an all-time low of 1.8% in November, then climbed back through 2026 to roughly where it started](/blog/images/urn_share_history.png)

The rest of the economy kept growing and the Urn's payout did not keep up. By November 2025 it was under 2% of all souls earned, its lowest ever, and only 46.4% of players finished a match with any Urn souls at all. Most lobbies were contesting it once, or never.

Then the line turns around and climbs all the way back through 2026. (The shaded fortnight in mid-2025 is a bookkeeping artifact, not a buff: for two weeks the game filed souls from destructible crates under the Urn, until Valve separated them on 22 May 2025.)

## Three rebuilds in six weeks

![Urn income spiked to 8% after the 22 May rework, fell to 3.6% under the June King of the Hill version, and settled at 5.4% after the 30 June split, while the top earner's cut jumped from 20% to 37%](/blog/images/urn_rework_2026.png)

The 22 May patch shipped with a note asking players for feedback, which was fair, because it changed nearly everything. You now melee the Urn to pick it up instead of standing still to channel it. The drop-off moved to the bridge in mid. Delivery started a contested depositing phase, and an enemy could heavy melee the Urn to flip it back.

It produced the single richest week the Urn has ever had, peaking at 8.0% of everything teams earned. Valve spent the next two patches undoing it, moving the drop-off under a side-lane bridge, stretching the deposit timers, and pushing the spawn interval out from 10/15/20 minutes to 12/18/24.

On 4 June the Urn became a different objective again: delivering it now started a King of the Hill capture point that both teams could progress at once, and the bounty was cut by 20%. Another 10% came off on 11 June. By 29 June the Urn was down to 3.6% of team income, its lowest since January.

Then on 30 June Valve stopped trying to make one objective do two jobs. The capture point became the Unstable Rift, spawning on its own timer with no delivery required. The Urn went back to being a courier run, worth 250 souls plus 70 a minute, paid to whoever carries it home. Both still pay into the same soul bucket, so the red line above tracks the pair of them.

## The Urn stopped paying the team

The bottom half of that chart is where the change lives. Across April and May, the biggest Urn earner on a team took 20.2% of the haul, against the 16.7% an even six-way split would give them. It was a group payout with a tip for the runner.

![The top Urn earner banked 2,566 souls per match under the old Urn versus 2,092 for a teammate; under the Unstable Rift it is 4,170 versus 1,756](/blog/images/urn_runner_premium.png)

Now they take 37.0%. In absolute souls the runner went from 2,566 a match to 4,170 while everyone else dropped from 2,092 to 1,756, so the gap between them widened from about 470 souls to roughly 2,400. Deliver the Urn and you personally walk away with a few thousand souls nobody else touches.

Nobody got squeezed out, though. Before the rework, 13.9% of teams finished a match having earned nothing at all from the Urn. Now it is 3.0%. The Rift pays everyone a little, the Urn pays one person a lot, and between them almost every team ends up touching the objective in almost every game.

## Losing it costs far more than it used to

![The gap between a leading team that won the Urn fight and one that lost it widened from 24 points to 48 points across three patch dates, while the overall comeback rate barely moved](/blog/images/urn_decisiveness.png)

Take every match, find which team was ahead on souls twelve minutes in, and then split by who collected more Urn souls over the rest of the game.

The dashed line barely moves, and that is the surprise. A twelve-minute lead was worth a 65.7% win rate before the rework and is worth 63.4% now. Three objective reworks moved the baseline comeback rate by 2.3 points. If the goal was to make Deadlock less snowbally in general, that is not what came out.

The other two lines are the opposite. In spring the objective was worth 23.7 points to a leading team, the difference between 77.8% and 54.1%. Now it is worth 48.1, from 84.0% down to 35.9%. Losing the Unstable Rift while ahead turns a comfortable favorite into an underdog.

Two things stop this from being a clean causal story. Teams winning fights also tend to win objectives, so some of this is just good teams being good. And the trailing team is not actually taking the objective more often than it used to, it is taking it slightly less. The Urn did not get easier to steal. It got much more expensive to lose.

## Who ends up with the souls

With one player now collecting most of the payout, it is worth asking who that player tends to be.

![Calico is her team's top Urn earner in 28.7% of games, the highest of any hero, while Vindicta is lowest at 10.2%; Celeste and The Doorman fell sharply after the rework and Haze and Wraith rose](/blog/images/urn_runners_by_hero.png)

Calico tops the list at 28.7%, the only hero clear of the pack, with Holliday next at 21.0%. She did not get there by adapting: she was on 28.6% before the rework. She leads because Celeste, who topped the old era outright at 30.6%, fell to 19.5%, the steepest drop of any hero. Vindicta has been last the whole time and sits at 10.2%, just under McGinnis, Venator and Seven.

The two biggest risers are Haze, up 6.2 points to 19.0%, and Wraith, up 4.1 to 14.8%. The 30 June patch explains them: the Urn runner is no longer revealed on the minimap, no longer disarmed and no longer silenced. That turns carrying it from a defenseless jog into something a fighting hero can do. A follow-up on 9 July then trimmed the runner's sprint and move speed bonuses, taking some of the edge off the pure mobility picks.

Two things to keep in mind on that chart. Matches where two teammates tie for the top are not counted for either of them. And because the Urn and the Rift pay into the same soul bucket, a hero topping this list today is banking both, not just carrying the Urn home.

## What actually changed

The Urn is still a small line item. About one soul in twenty comes from it, well behind lane troopers, hero kills, neutral camps and the lane objectives. That share was 5.70% before the reworks started and it is 5.43% now.

So the size of the prize is essentially where it was in April. Everything around it moved: one player collects it instead of six, and losing it costs a leading team twice what it used to. Six weeks of patches, and the interesting part is the part that stayed still.

You can pull the same soul-source breakdowns for any hero or time window through our [analytics endpoints](https://api.deadlock-api.com/docs). If you want to dig into this with other people who like Deadlock numbers, our [Discord](https://discord.gg/pqWQfTPQJu) is open.
