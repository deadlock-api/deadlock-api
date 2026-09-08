---
title: Solo vs duo queue win rates in ranked
description: Duo players win 50.9% of ranked games, solo players 50.0%. The gap reaches 4 percentage points at the top, belongs to partnerships with no shared history, and is worth about one extra subrank per 100 games. Data through 6 September 2026.
date: 2026-09-07
author: Manuel - Deadlock API Team
tags:
  - data
  - meta
---

Players queueing as a duo won **50.9%** of their ranked games. Solo players won **50.0%**. That 0.9-point gap hides two
very different groups: pairs with no game together in our records before ranked launched won 54% of their games, while
pairs with more than 500 shared games won 49%. So the honest answer to "should I queue with my friend" is: it depends on
which friend.

Valve does not tell us who queued together, so we infer duos from friend lists, lobby slots and co-play patterns. How
that works, and why you might not trust it, is in the collapsed section at the end. The sample is every captured ranked
match from launch on 30 July through 6 September 2026, minus players still in calibration, their first ranked games
before the game has settled on a rank: 641,345 matches and 248,636 players. Calibrating players lose more than average,
which is why the rates below sit slightly above 50%. A win means the team won, and a player counted as solo can still
have a duo among the other five on their team.

## Small at most ranks, bigger at the top

![Win rate by rank for solo and duo players](/blog/images/duo-queue-win-rate-by-rank.svg "Win rate by the rank shown at match start. Thin bars show 95% intervals, the range the true value plausibly sits in.")

At Initiate, duos win slightly less than solos, 49.6% against 50.1%. From Seeker through Oracle the gap runs 0.5 to 1.2
points and reaches 2.0 at Phantom. In the combined Ascendant and Eternus group duos won **53.8%** against 49.8%, a gap
of 4 points with an interval from 2.9 to 5.2 when counted by player. It rests on 13,442 duo games from 857 players, and
it is where our duo detection is least reliable, so treat it as roughly right.

From the solo player's seat: in 66,018 matches where exactly one team had a duo, the duo side won 51.3%, so facing a duo
without one costs you about one extra loss in a hundred games. In the top group it is 54.6%, about one in twenty.

## Who queues with a partner

![Share of ranked games played as a duo and as solo, by rank](/blog/images/duo-queue-participation-by-rank.svg "Calibrated ranked games in each rank, split into games classified as duo and solo.")

Duo games are a minority everywhere: 14% of games at Initiate, 17% to 19% from Seeker to Ritualist, 25% at Oracle and
27% at Phantom. The players behind them are a different story. Below Emissary, 40% to 49% of players have at least one
detected duo game. That rises to 61% at Oracle, 84% at Phantom and 148 of 151 players at Ascendant and Eternus. Nearly
everyone at the top has queued with a partner, but they still mostly queue alone.

## New partners win more together, long-standing partners do not

For each detected pair, we counted the matches in our records where the two shared a team before ranked launched, in any
mode. Our records cover most matches, not all, so "no history" means none we saw. Of 74,391 pairs, 10,807 had none, and
they won **54.1%** of their ranked games together. Pairs with more than 500 shared games won **49.4%**.

![Win rate of the same players with their partner and alone, by how much the pair had played together before ranked](/blog/images/duo-queue-new-vs-veteran-duos.svg "The same players, in games with their most frequent partner and in their solo games, grouped by how many games the pair had shared before ranked launched. Bars are 95% intervals.")

The obvious objection is smurfs, and fresh accounts do not explain it. Players from pairs with no recorded history won
54.2% with that partner and 49.9% of their solo games: ordinary players at their rank who win more together. Pairs where
both accounts had at least 200 games before ranked still won 53.6%, while the 239 pairs with a brand-new account won
50.7%. One group does look like boosting, 669 accounts that never played a solo ranked game and won 56.5% with their
partner, but they are under 3% of all duo games by these players. At the other end, players from pairs with more than
500 shared games won 49.5% with the partner and 49.8% alone.

These are different pairs, not the same pair over time. Within a pair the edge shrinks but does not vanish: new pairs
won 55.2% of their first five games together and 52.6% from game 16 on, and the 8,267 pairs with twenty or more games
show the same shape. Matchmaking, stronger opponents, which pairs keep queueing, or simply duoing at different hours and
in a different mood than soloing: we cannot separate these.

## How much rank a duo is worth

![Subranks climbed per 100 games for players who never duo and players who mostly duo, by starting rank](/blog/images/duo-queue-duo-rank.svg "Mean rank progress per 100 captured games for players with at least thirty calibrated games, grouped by the rank of their first calibrated game. Bars are 95% intervals across players.")

Ranked progress is a ladder of wins and losses. A subrank is 1,000 rank points, six subranks make a tier, and across
calibrated games a win gained 321 points on average while a loss cost 207. So the whole ladder drifts upward: players
who never queued as a duo still climbed **5.8 subranks per 100 games**, and players with three quarters or more of their
games as a duo climbed 6.9. At the same starting rank the difference is one to one and a half subranks per 100 games.
Nobody was placed above Oracle at calibration, so the chart has no group for Phantom and above.

That extra climb lasts only while a pair wins more than half its games, because climbing brings stronger opponents.
Across 194,054 matches with all twelve players calibrated, the team whose average rank was one subrank higher won 6.3
points more often. A duo is two of six players, so a new pair's 4.2-point edge is spent once both partners sit about
**two subranks** above their solo level, a third of a tier: 4.2 divided by 6.3, times three. A rough estimate, not a
rule. Long-standing pairs never show that premium: players whose most frequent partner accounts for more than 60% of
their pre-ranked games won 51.2% solo and 50.3% together.

<details>
<summary class="cursor-pointer text-2xl font-semibold tracking-tight text-foreground mt-10 mb-4">How we detect duos, and why you might not trust it</summary>

![Frequency of seven detection signals among confirmed parties and teammates not in a party](/blog/images/duo-detection-signals.svg "Signals in 680,471 complete February 2026 matches that still carried Valve's party labels. Confirmed parties include groups larger than two. Friendship links come from the snapshot at extraction. The percentage axis is logarithmic.")

Until March 2026, match records carried party ids. We trained a classifier on 400,000 confirmed party pair-games from
February, a pair-game being one pair of teammates in one match, and 400,000 synthesised opponent pair-games. Its inputs
are Steam friendship, adjacent lobby slots, lane, and whether the two came from the same previous match at the same
time. Friendship alone separates the groups well: 81% of confirmed party pairs are friends against 0.09% of other
teammates.

On held-out pairs, the detector recovered 97.0% of 44,828 confirmed two-person party games and wrongly labelled 126 of
200,000 games between teammates who were confirmed not to be a party. In today's ranked data, it found 95.1% of the
2,639 games marked with Valve's party-abandon penalty. Raising or lowering the score threshold barely moves the numbers
that matter: between thresholds of 0.3 and 0.9 the top-group duo rate stays between 53.6% and 54.5%, and the no-history
pair rate between 54.1% and 54.3%.

The weakest spot is the top. The Ascendant and Eternus group is a few hundred players who mostly know each other and
meet repeatedly, which is exactly what the detector keys on, so its error rate there is unknown. Friend lists and
co-play features reflect their state at extraction, not at match time. The intervals cover sampling noise, not detector
error, matches we never captured, or the fact that nobody was assigned a partner at random.

</details>

## What this means for ranked

Queueing as a duo is worth a little, and how much depends on the partner. A friend you have never played with is worth
about 4 points of win rate and one to one and a half extra subranks per 100 games. A partner you already have hundreds
of games with is worth nothing measurable. At the top of the ladder the gap is largest, and that is also where we trust
the detection least.

For another cut of the data, join us on [Discord](https://discord.gg/pqWQfTPQJu).
