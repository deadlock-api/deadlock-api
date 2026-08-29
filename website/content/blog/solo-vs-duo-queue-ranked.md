---
title: Solo vs duo queue win rates in ranked
description: Duo players win 50.9% of ranked games, solo players 49.8%. The gap is about a point for most of the ladder, six at Ascendant, and largest for brand-new duos.
date: 2026-08-29
author: Manuel - Deadlock API Team
tags:
  - data
  - meta
---

Since ranked launched on 30 July 2026, a player queued as a duo has won **50.9%** of their games and a solo player **49.8%**. Weighting each game by how sure we are it was a duo game, the gap is **1.0 percentage point**. That is the number we stand behind, and it is small. It stops being small at the top of the ladder, and in the first few games any two players spend together.

Whiskers on the charts are 95% confidence intervals, computed so that the twelve players of one match do not count as twelve independent results. How we tell duos apart from random teammates is in the last section.

## Duo win rate by rank tier

![Solo and duo win rate by rank, and the win rate of the team with the only duo in the match](/blog/images/duo-queue-win-rate-by-rank.png "A: win rate of solo and duo player-games by rank at the start of the match; duo player-games per tier under the x-axis. B: matches with exactly one duo on one team and none on the other, by the average rank of the match (Eternus has one such match and is omitted). Whiskers are 95% confidence intervals clustered by match.")

At Initiate duos win slightly less than solos (49.5% vs 50.1%); from Seeker to Oracle the duo advantage is 0.5 to 1.3 points. At Phantom it is **2.3 points** (51.5% vs 49.2%). At Ascendant it is **5.7 points** (54.9% vs 49.2%, plus or minus 1.3). Eternus duos win 65.6%, but Eternus only exists since the third week of the season (120 players, 2,800 player-games, 556 of them duo), so the interval is plus or minus 5.1 points.

Panel B is the cleaner test: one team has exactly one duo, the other none. In 167,435 such matches the duo side won **51.2%**. At Phantom it won 52.0%, and in the 420 one-sided Ascendant matches **57.4%** (interval 53% to 62%). Stacking helps more: two duos against none wins 53.0% (19,652 matches), three against none 56.5% (492 matches). Every match has one winner, so averaged over all players the win rate is 50% and a duo advantage is paid by someone. Phantom solo players have the lowest solo win rate of any tier, 49.2%.

## Who duos, by rank

![Duo participation by rank tier](/blog/images/duo-queue-participation-by-rank.png "Players with at least ten ranked games, grouped by median rank: the share who played at least one duo game, and the share of their games that were duo games. Player counts above the bars; Eternus (one player) omitted.")

Below Emissary, 37% to 47% of players have played a duo game and 10% to 15% of their games are duo games. At Oracle 61% of players duo, at Phantom 91%, and all 61 Ascendant players have queued with a partner (the [rank distribution](/badge-distribution) shows how small those top pools are). Even there only about a third of games are duo games: nearly everyone duos sometimes, almost nobody always.

If you are below Emissary, duos win about one point more than solos. If you are Phantom or above, most opponents will have one, and the ones who do win a few points more.

## New duos win more than veteran duos

For each detected duo we counted the games the two had played together before ranked existed, in any mode, back to 2023. 57,265 of the 70,419 pairs had a history (median 59 games, maximum 3,093); 13,154 had never shared a team.

![Ranked duo win rate by games played together before ranked, and by the pair's nth game together](/blog/images/duo-queue-new-vs-veteran-duos.png "A: ranked duo win rate by games the two had played together before ranked launched; squares repeat it for pairs below Phantom. B: every detected pair followed game by game, from their first ranked game together onward; pairs that stopped queuing together simply contribute fewer games.")

Brand-new pairs win **55.3%** of their ranked games; pairs with over 500 games together win **49.7%**, and every bucket between falls in order. It does not look like smurfing: pairs with an account under 50 games before ranked win 52.6%, on 1,678 games. It is not rank: below Phantom the numbers are 55.9% and 49.7%. A rank gap inside the pair adds to it but does not explain it: new pairs a full tier apart win 58.3% against 54.8% for evenly matched new pairs, and only 15% of new pairs' games have such a gap. And it is not only the season's first weeks: new pairs won 58.0% in weeks one and two and 53.5% in three and four.

Panel B explains it. Followed game by game, every duo's edge shrinks: across all detected pairs, the first five games together are won 51.4% of the time and games from the sixteenth on 50.4%; brand-new pairs start at **56.6%** and are at 52.3% from their sixteenth game. Part of that decline is the whole ranked population settling over its first month (the weekly split above shows about four points of it for new pairs), but the game-by-game drop is larger than that. Whatever a duo brings, the ratings absorb most of it within a dozen games, and a pair with a thousand games of history arrived already absorbed. When two duos meet, the one with the shorter shared history wins 51.9% of the time and the higher-rated one 51.6%.

Two things that do not matter much: how many different partners a player rotates through (51.1% with one partner, 52.3% with three or more, and the latter also play twice as many games), and solo skill. The correlation between a player's solo and duo win rate is 0.13, and most of that is one month of luck not carrying over.

## How we know who is in a duo

![Detection signals for confirmed parties versus random teammates](/blog/images/duo-detection-signals.png "Share of pair-games showing each signal, for pairs Valve's party id confirms were a party versus random teammates, in 680,471 February 2026 matches. Log scale.")

Valve stopped including party ids in match data on 15 March 2026, so duos have to be inferred, and in ranked's small top pools shared games alone are not enough: chance explains 435,944 of the 440,348 pairs seen together twice and never against each other. A party leaves better traces. It sits in adjacent lobby slots (61% of confirmed parties, 24% of random teammates); each player's previous match was the one the other had just played, started within a minute (47% against about 1%); and 81% of party pair-games are between Steam friends, against 0.1% for random teammates.

A classifier trained on those signals does the labelling: positives are 4.98 million party pair-games from February 2026, negatives 4.67 million ranked pair-games where the two landed on opposite teams. On pairs it never saw it finds 87.9% of party pair-games and mislabels 0.10% of random teammates. Of 1,923 ranked players Valve penalized for a partner's abandon, a penalty that requires a party, it had labelled 93.1% as duo. Nothing in it looks at who won.

## What this does not say

A one-point residual edge is consistent with a matchmaker that treats a duo as two solo players and lets their first games together pay for the coordination; whether Valve already discounts parties we cannot tell from outside. The Ascendant numbers rest on 420 one-sided matches and 6,500 duo player-games, one month into the first season. And a gap between people who duo and people who do not is not the gain you would get from duoing, because they are not the same people.

Questions, or a cut of this data we did not show: [Discord](https://discord.gg/pqWQfTPQJu).
