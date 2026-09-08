---
title: Solo vs duo queue win rates in ranked
description: Duo players win 50.9% of ranked games, solo players 50.0%. Pairs with no game together before ranked win 54%, pairs with 500+ shared games win 49%. Data through 6 September 2026.
date: 2026-09-07
author: Manuel - Deadlock API Team
tags:
  - data
  - meta
---

Players queueing as a duo won **50.9%** of their ranked games. Solo players won **50.0%**. That 0.9-point gap hides two
very different groups: pairs with no game together in our records before ranked launched won 54% of their games, while
pairs with more than 500 shared games won 49%.

Valve does not tell us who queued together, so we infer duos from friend lists, lobby slots and co-play patterns. The
[collapsed section at the end](#how-we-detect-duos) has the details. The sample is every captured ranked match from
launch on 30 July through 6 September 2026, minus players still in calibration: 641,345 matches and 248,636 players.

## Small at most ranks, bigger at the top

![Win rate by rank for solo and duo players](/blog/images/duo-queue-win-rate-by-rank.svg "Win rate by the rank shown at match start. Thin bars show 95% intervals, the range the true value plausibly sits in.")

At Initiate, duos win slightly less than solos, 49.6% against 50.1%. From Seeker through Phantom the gap runs 0.5 to 2.0
points. In the Ascendant and Eternus group duos won **53.8%** against 49.8%, a gap of 4 points with an interval from 2.8
to 5.2 whether we count uncertainty by match or by player. It rests on 13,442 duo games from 857 players who held that
rank at the time.

In 66,018 matches where exactly one team had a duo, the duo side won 51.3%, so facing a duo without one costs you about
one extra loss in a hundred games. In the Ascendant and Eternus group it is 54.6%, about one in twenty.

## Who queues with a partner

![Share of a player's ranked games that contain at least one detected duo, by rank](/blog/images/duo-queue-participation-by-rank.svg "For each rank, the share of players' calibrated games in which at least one detected duo played, on either team.")

Most games have a duo somewhere in them: 45% at Initiate, 58% to 69% from Seeker to Emissary, 79% at Oracle, 85% at
Phantom and 80% in the Ascendant and Eternus group. Two or more duos in one match go from 13% at Initiate to 52% at
Phantom. Duo players themselves are still a minority: 14% of player appearances at Initiate are in a duo, rising to 27%
at Phantom. Below Emissary, 40% to 49% of players have at least one detected duo game. That rises to 61% at Oracle, 84%
at Phantom, and 148 of the 151 players whose usual rank is Ascendant or Eternus.

## New partners win more together, long-standing partners do not

For each detected pair, we counted the matches in our records where the two shared a team before ranked launched, in any
mode. Of 74,391 pairs, 10,807 had no history, and they won **54.1%** of their ranked games together. Pairs with more
than 500 shared games won **49.4%**.

![Win rate of the same players with their partner and alone, by how much the pair had played together before ranked](/blog/images/duo-queue-new-vs-veteran-duos.svg "The same players, in games with their most frequent partner and in their own solo games, grouped by how many games the pair had shared before ranked launched. Bars are 95% intervals.")

Fresh accounts do not explain it. Players from pairs with no recorded history won 54.2% with that partner and 49.9% of
their solo games. Pairs where both accounts already had 200 or more games before ranked won 53.6% together, and the 239
pairs with a brand-new account won 50.7%.

These are different pairs, not the same pair over time. Following only the 438 no-history pairs that reached twenty
games together, the win rate fell from 62.4% in games 1 to 5 to 54.5% in games 16 to 20.

## How much rank a duo is worth

![Subranks climbed per 100 games for players who never duo and players who mostly duo, by starting rank](/blog/images/duo-queue-duo-rank.svg "Mean rank progress per 100 captured games for players with at least thirty calibrated games, grouped by their rank at their first game after calibration. Bars are 95% intervals across players.")

Across calibrated games a win gained 321 rank points on average while a loss cost 207, out of the 1,000 that make a
subrank. The whole ladder drifts upward: players who never queued as a duo still climbed **5.8 subranks per 100 games**
overall, and players with three quarters or more of their games as a duo climbed 6.9. At the same starting rank the
difference is one to one and a half subranks per 100 games.

That extra climb lasts only while a pair wins more than the players around it, because climbing brings stronger
opponents. Across 194,054 matches with all twelve players calibrated, the team whose average rank was one subrank higher
won 6.3 points more often. A duo is two of six players, so its rank edge is diluted threefold, and a new pair's
4.2-point edge is used up once both partners sit about **two subranks** above their solo level, a third of a tier. The
slope differs by rank, and the same arithmetic gives one and a half to five subranks, so read it as an order of
magnitude. Long-standing pairs never show that premium: players whose most frequent partner accounts for more than 60%
of their pre-ranked games won 51.2% solo and 50.3% together.

<details>
<summary id="how-we-detect-duos" class="cursor-pointer text-2xl font-semibold tracking-tight text-foreground mt-10 mb-4">How we detect duos, and why you might not trust it</summary>

![Frequency of seven detection signals among confirmed parties and teammates not in a party](/blog/images/duo-detection-signals.svg "Signals in 680,471 complete February 2026 matches that still carried Valve's party labels. Confirmed parties include groups larger than two. Friendship links come from the snapshot at extraction. The percentage axis is logarithmic.")

Until March 2026, match records carried party ids. We trained a classifier on 400,000 confirmed party pair-games from
February, a pair-game being one pair of teammates in one match, and 400,000 synthesised opponent pair-games. Its inputs
are Steam friendship, adjacent lobby slots, lane, and whether the two came from the same previous match at the same
time. 81% of confirmed party pairs are friends against 0.09% of other teammates.

On held-out pairs, the detector recovered 97.0% of 44,828 confirmed two-person party games and wrongly labelled 126 of
200,000 games between teammates who were confirmed not to be a party. In today's ranked data, it found 95.1% of the
2,639 games marked with Valve's party-abandon penalty. Moving the score threshold between 0.3 and 0.9 keeps the
Ascendant and Eternus duo rate between 53.6% and 54.5%, and the no-history pair rate between 54.1% and 54.3%.

The weakest spot is the top. The Ascendant and Eternus group is a few hundred players who mostly know each other and
meet repeatedly, which is exactly what the detector keys on, so its error rate there is unknown. Friend lists are their
state at extraction, not at match time, and co-play features also count later games, so pairs that keep queueing
together are easier to detect, and those tend to be the pairs that win. We also looked for boosting accounts among the
new pairs: 669 accounts never played a solo ranked game, only games with their partner, and won 56.5% of them. That is
the pattern a boosting account would show, but those accounts played under 3% of the new pairs' games, so excluding them
barely moves the 54%.

</details>

## What this means for ranked

A friend you have never played with is worth about 4 points of win rate and an extra subrank or so per 100 games, while
a partner you already have hundreds of games with is worth nothing measurable.

For another cut of the data, join us on [Discord](https://discord.gg/pqWQfTPQJu).
