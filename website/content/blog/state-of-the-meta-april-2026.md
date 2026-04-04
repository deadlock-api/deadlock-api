---
title: "State of the meta: April 2026"
description: "A data-driven look at Deadlock's current meta since the March 25 patch, with win rates broken down across every rank from Initiate to Eternus."
date: 2026-04-04
author: Manuel - Deadlock API Team
tags:
  - data
  - meta
---

Haze is the best hero in Deadlock right now. At 56.7% win rate, she sits at the top of the roster across 550,000 ranked matches played since the March 25 patch. Dynamo is right behind at 56.4%, and Seven rounds out the top three at 55.3%.

What makes these numbers more convincing than the usual tier list debate is that they hold up at every rank. We bucketed the data by badge level from Initiate all the way to Eternus, and the same three heroes sit at the top nearly everywhere. The meta is remarkably uniform across skill levels.

## The top tier

Haze (56.7%, 282K matches), Dynamo (56.4%, 248K matches), and Seven (55.3%, 223K matches) form a clear top three. Haze appears as the #1 or #2 hero in almost every badge bracket we checked. At Arcanist she's 56.2%. At Emissary she's 57.4%. At Phantom she's 57.3%. At Ascendant she's 54.8%. The only bracket where she drops out of the top two is Eternus, where Dynamo edges ahead.

![Hero win rates, top 10 and bottom 10](/blog/images/meta_winrate_bars.png)

Dynamo's strength is easy to overlook if you only watch the kill feed. He averages 15.2 assists per game, the highest in the roster. At Eternus (badge 11), Dynamo is the #1 hero at 57-59% win rate. He gets _better_ the higher you go.

Graves is the fourth strongest hero at 54.7% and has the highest pick count of any hero this patch (345K matches). That volume rules out any small-sample effect. Kelvin (54.4%, 141K matches) rounds out the top five, and Infernus (53.5%, 258K matches) sits at sixth. After months of debate about whether Infernus is overrated, this patch is pretty clear: he wins.

## The rank breakdown

The scatter plot below maps every hero by pick volume and win rate. The dashed line is 50%.

![Pick rate vs win rate for all heroes](/blog/images/meta_pickrate_scatter.png)

Most heroes stay within a narrow band across ranks. A few don't:

**Vyper** barely registers in the overall standings at 48.3% (89K matches). At Eternus, though, he consistently appears in the top 3 with 54-58% win rates. He's a hero that rewards mechanical skill in ways that don't show up at lower ranks.

**Victor** sits at a middling 49.5% overall (103K matches). At Eternus, he drops to 38-43%. The March 25 patch restored his health per boon to 46, removed his lifesteal penalty, and gave him a new Tier 3 Jumpstart upgrade with +50% debuff resistance. None of that was enough to make him competitive at the top.

**Haze** is one of the few heroes who is equally strong everywhere. She's 56-58% from Seeker through Ascendant. Most pub-stomper heroes lose win rate as you climb. Haze doesn't.

**Bebop** is bad at every rank. He's bottom 3 in virtually every badge bracket, hovering between 42-45% regardless of the lobby's skill level. His 8.0 average deaths per game are the highest in the roster.

**Holliday** is the worst hero in the game at every single rank we checked. She sits at 44.2% overall and drops as low as 41% in some brackets. The March 25 patch buffed her Crackshot T3 cooldown reduction and gave Bounce Pad ally benefits, but these were small changes for a hero that needs bigger ones.

## Counter matchups

The top heroes also crush the bottom of the roster in direct matchups.

Haze beats Holliday 62.5% of the time (7,800 matches). Dynamo beats Bebop 61.7% (14,300 matches). Haze into Bebop is 61.6% (17,800 matches). Haze into Rem is 61.4% (28,000 matches). Dynamo beats Venator 60.8% (17,300 matches) and Shiv 60.7% (12,500 matches).

If you're playing Holliday or Bebop and the enemy team has a Haze or Dynamo, you're starting with roughly a 12-point win rate deficit before the game begins.

## Spirit items still dominate

The six most-purchased items this patch are all Spirit slot. The "purchases" column counts how many players bought the item across all matches (multiple players per match can buy the same item):

| Item              | Purchases | Avg buy time |
| ----------------- | --------- | ------------ |
| Extra Spirit      | 3.73M     | 6:16         |
| Improved Spirit   | 3.71M     | 11:51        |
| Superior Cooldown | 3.02M     | 23:42        |
| Compress Cooldown | 2.79M     | 17:20        |
| Boundless Spirit  | 2.70M     | 28:17        |
| Extra Charge      | 2.54M     | 6:52         |

Boundless Spirit is a Tier 4 item costing 6,400 souls, and it's the fifth most-purchased item in the game with a 52.9% win rate. For a late-game luxury item to be bought that often, Spirit builds have to be the default path for the majority of heroes.

The March 21 patch rescaled spirit investment bonuses (from 7/11/15/19/38/52/64/76/89/101 down to 7/11/15/19/38/48/57/66/75/100) and also reduced ability range on a long list of items: Greater Expansion (35% to 30%), Ballistic Enchantment (25% to 20%), Echo Shard lost its +5% ability range entirely, and several others took smaller hits. Spirit is still dominant, but the gap narrowed.

Silencer leads all items in win rate at 61.9% (313K purchases), followed by Lucky Shot at 59.7% (283K purchases). Both are late-game buys (35 and 33 minute averages), so part of that win rate reflects teams that are already ahead picking up luxury items.

Metal Skin is the worst item at 37.6% across 339K purchases. Disarming Hex is second worst at 39.7%.

## What the March patches actually changed

Three patches landed in March, each with a different scope.

The **March 6 patch** dropped roughly 900 changes. The headline mechanics: you can now jump during slide, Shrine HP became asymmetric (5,000 for the first, 10,000 for the second), and nearly every hero got touched. Valve's stated philosophy was to buff the weak rather than nerf the strong.

The **March 21 patch** was a systems-level adjustment. Vitality investment went back to percentage-based HP increases. Spirit investment got rescaled downward. Ability range was nerfed across a dozen items. Hero-specific changes were extensive: Dynamo got more ammo (18 to 20) and wider Kinetic Pulse (5m to 5.5m). Graves got Borrowed Decree summoning 2 Ghouls on cast. Infernus got a faster reload (2.491s to 2.25s). Wraith's Telekinesis took significant nerfs to range (13m to 10m), debuff duration (2.75s to 2.25s), and cooldown (120s to 130s). Ivy's Air Drop cooldown jumped from 65s to 85s (reduced by 25% when used on allies).

The **March 25 patch** was more surgical. Graves took nerfs to Grasping Hands scaling (1.9 to 1.6) and Borrowed Decree Ghoul stats. Despite those nerfs, he's still at 54.7%. Mirage got hit on Fire Scarabs, Dust Devil, and Djinn's Mark scaling. Victor got mixed changes: buffs to health and lifesteal, but his Jumpstart T3 lost the ability to purge debuffs. Celeste got a base regen nerf (2 to 1).

## What to play

Haze and Dynamo are the two safest picks in the game. Both win at 56%+ and their strength doesn't depend on your rank. Seven is the third best option and also holds up everywhere.

If you're in higher ranks (Phantom+), Vyper becomes a strong pick that most players at lower ranks can't extract value from. Graves is a safe choice at every rank with massive sample sizes confirming his strength.

Avoid Bebop, Holliday, and Sinclair. All three sit below 46% and get hard-countered by the most popular heroes in the meta. Rem is also weak at 45.6% despite being one of the most-picked heroes in the game (316K matches).

Spirit itemization is the default. The nerfs to spirit scaling and ability range on March 21 didn't change that reality, they just made it slightly less extreme.

Check the numbers yourself on our [hero analytics](/heroes) and [item analytics](/items) pages. If you see something we missed, let us know on [Discord](https://discord.gg/pqWQfTPQJu).
