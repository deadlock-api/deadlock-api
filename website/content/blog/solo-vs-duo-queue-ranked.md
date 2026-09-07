---
title: Solo vs duo queue win rates in ranked
description: Detected duos win 50.9% of ranked games after calibration, solos 50.0%. Updated through 6 September 2026, with rank splits and shared history.
date: 2026-09-07
author: Manuel - Deadlock API Team
tags:
  - data
  - meta
---

Detected duo players won **50.9%** of their ranked games after calibration, compared with **50.0%** for solo players.
The difference is **0.9 percentage points**, with a match-clustered 95% interval of 0.8 to 1.1 points. The gap is modest
overall and larger in the top two ranks.

Our sample runs from ranked's launch on **30 July through 6 September 2026**, using games that started before 00:00 UTC
on 7 September. We retained 657,330 complete matches with unambiguous duo classifications. The main comparison uses
**6,241,811 calibrated player-games** from 248,221 players. A player-game is one player's appearance in one match. A
solo player can still have a duo elsewhere on their team.

Calibration matters here.
Valve's [Matchmaking Update](https://steamcommunity.com/games/1422450/announcements/detail/680756685198854911) requires
players to calibrate alone. We exclude anyone with calibration games remaining, even if a rank badge is already visible.
Throughout this post, a win means a **team victory**. Abandon rules can make the ranked result credited to an individual
different from their team's result.

The latest complete week looks similar. From 31 August through 6 September, detected duos won 50.8% and solos 49.9%,
again a 0.9-point gap.

## The gap widens at the top

![Solo and detected duo team-victory rates by rank, with Ascendant and Eternus combined](/blog/images/duo-queue-win-rate-by-rank.png "A: player-games grouped by displayed rank at match start, excluding calibration. Intervals are 95% and clustered by match. B: matches with exactly one detected duo against none, with all twelve players calibrated. Rank is the match average on a six-subrank scale. Counts appear under the labels. These intervals use Wilson's method. Ascendant and Eternus are combined in both panels.")

At Initiate, detected duos win slightly less often than solos, 49.6% versus 50.1%. From Seeker through Oracle, the
duo-minus-solo difference ranges from 0.5 to 1.2 points. At Phantom it reaches **2.0 points**, with duos at 51.4% and
solos at 49.4%.

We combine Ascendant and Eternus into one group. Across **11,483 duo player-games**, their win rate is **54.2%**,
compared with **50.0%** for solos. Using the unrounded rates, the difference is **4.3 points**, with an interval from
3.1 to 5.5 points.

Panel B asks a simpler team-level question: how often does a team with exactly one duo beat a team without any? Across
**66,149 fully calibrated matches**, the duo side won **51.3%**, with an interval from 51.0% to 51.7%. That rises to
52.2% at Phantom and **55.6% in the combined Ascendant and Eternus group**, across 1,556 matches. The interval for that
top group is 53.1% to 58.0%.

Teams with two detected duos against none won 53.6% across 12,671 matches. Three against none won 53.7%, but there are
only 449 matches in that group and its interval spans 49.1% to 58.2%. The data does not establish that adding a third
duo improves the result.

## Who queues with a partner

![Duo participation by median rank, with Ascendant and Eternus combined](/blog/images/duo-queue-participation-by-rank.png "Players with at least ten retained calibrated games, grouped by their median displayed rank during the sample. Ascendant and Eternus are combined. Red shows the share with any detected duo game. Blue shows the share of player-games classified as duo. Player counts are on the right.")

Below Emissary, 39.4% to 48.4% of qualifying players have at least one detected duo game. That rises to **61.1% at
Oracle** and **84.3% at Phantom**. Among players whose median rank is Ascendant or Eternus, **144 of 148 (97.3%)** have
a detected duo game.

Those are counts within this particular sample and median-rank grouping, not everyone who ever reached those ranks.
The [rank distribution](/badge-distribution) provides a separate view of the ladder.

Even in these groups, most player-games are classified as solo. At Phantom, 84.3% of qualifying players have a detected
duo game, yet duos account for only **25.5% of their player-games**. The corresponding game share is **19.8%** in the
combined Ascendant and Eternus group.

## Pairs without recorded history win more

For each retained duo, we counted captured matches in which the two accounts shared a team before ranked launched,
across modes. Of **73,846 detected pairs**, **10,727** had no shared pre-ranked game in our records. Missing history
does not prove that they had never played together.

![Duo team-victory rates by recorded pre-ranked shared history and by detected ranked game number](/blog/images/duo-queue-new-vs-veteran-duos.png "A: pair-games grouped by recorded shared team matches before ranked launched. Blue squares restrict both players to below Phantom. B: outcomes grouped by the pair's detected ranked game number. Different pairs contribute to later groups as others stop appearing. Both panels show 95% intervals clustered by match.")

Pairs with no recorded pre-ranked history won **54.2%** across 48,585 pair-games. Pairs with more than 500 recorded
shared games won **49.4%** across 86,268 pair-games. Restricting both players to below Phantom leaves a similar
difference, 54.6% versus 49.4%. This is a broad rank restriction, not a full adjustment for differences between the
players.

The game-number comparison also shows higher win rates early on. Across all detected pairs, games 1 to 5 were won 51.3%
of the time and games 16 onward 50.4%. For pairs with no recorded pre-ranked history, those figures are **55.3% and
52.7%**. Their intermediate groups do not decline steadily: games 6 to 10 are at 52.2%, followed by 53.5% for games 11
to 15.

The pairs in those groups change substantially. All 10,727 pairs without recorded history contribute to the first group,
but only 609 reach the sixteenth detected game. As a check across all detected pairs, we followed the same **8,065 pairs
with at least twenty detected games** across four equal five-game blocks. They won 53.3% in games 1 to 5 and 51.5% in
games 16 to 20.

That fixed cohort still selects pairs that kept playing. Calendar time also changes as a pair accumulates games, and
detection itself uses co-play history. These results cannot tell us whether the decline comes from matchmaking
adjustments, changing opponents, or which pairs continue queuing together.

## How we infer duos

Explicit party labels are unavailable in the current ranked records, so we infer membership from friendship links, lobby
positions and co-play patterns. The classifier was trained on 400,000 confirmed party pair-games from February 2026 and
400,000 ranked opponent pair-games. Opponent examples use simulated slot and lane signals to approximate those of
teammates.

![Frequency of friendship, adjacent slots and shared previous observed matches among confirmed parties and nonparty teammates](/blog/images/duo-detection-signals.png "Signals in 680,471 complete February 2026 matches with party labels. Confirmed parties include groups larger than two. Friendship links come from the snapshot at extraction, not historical friend lists. Previous match means the previous observed match within the extracted cohort. The percentage axis is logarithmic.")

Validation holds out account pairs from training. The detector recovered **96.9% of 44,828 held-out pair-games from
confirmed two-person parties**. It also flagged 121 of 200,000 February pair-games whose teammates were confirmed not to
share a party. In the ranked sample, it identified 2,472 of 2,618 player-games marked with Valve's party-abandon
penalty, or **94.4%**. These checks do not establish the error rate among today's unlabelled ranked teammates.

We use a score threshold of 0.5 and enforce calibration and party-rank restrictions before pooling the top two ranks for
reporting. Matches with conflicting assignments are excluded in full. Changing the threshold to 0.3, 0.7 or 0.9 leaves
the overall calibrated gap at about 0.9 points. Weighting observations by scores under three assumed party prevalences
gives gaps of 0.8 to 0.9 points. Those weights are sensitivity checks, not verified probabilities of party membership.

The labels are retrospective. Co-play features can include later games, and friend lists reflect their state at
extraction. No game outcome is a model feature, but winning can still relate to friendships and continued co-play. The
intervals account for dependence inside each match. They do not include detector error, incomplete capture or repeated
players across matches.

## What this means for ranked

Detected duos win slightly more often overall, with a **0.9-point gap** that grows to **4.3 points in the combined
Ascendant and Eternus group**. Most qualifying players at the top have queued with a partner, yet most of their games
are still classified as solo. Pairs without recorded shared history also win more often than pairs with hundreds of
shared games. Together, these findings show that the solo–duo gap varies with rank and shared history. They do not tell
us how much a particular player would gain by inviting a partner.

For another cut of the data, join us on [Discord](https://discord.gg/pqWQfTPQJu).
