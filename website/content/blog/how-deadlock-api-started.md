---
title: "How Deadlock API started: from frustrated meetings to 20 million daily requests"
description: The story of how a community analytics platform grew from one developer's frustration with endless planning meetings into an open API serving half a million users.
date: 2026-03-16
author: Manuel - Deadlock API Team
tags:
  - community
  - announcement
---

Back in October 2024, a bunch of us developers formed the "Deadlock Dev Community" on Discord. The idea was to build
shared tooling around Valve's Deadlock. Honestly, there was no shortage of good ideas. The problem was that we kept
sitting in meetings debating architectures and frameworks instead of actually writing anything.

I got impatient, so I just started building. Eighteen months later, we've tracked over 18 million matches.

### Matches tracked per month since August 2024

| Month    | Matches   |
| -------- | --------- |
| Aug 2024 | 3,882     |
| Sep 2024 | 69,824    |
| Oct 2024 | 1,421,450 |
| Nov 2024 | 2,034,136 |
| Dec 2024 | 1,218,263 |
| Jan 2025 | 831,837   |
| Feb 2025 | 657,603   |
| Mar 2025 | 723,179   |
| Apr 2025 | 592,107   |
| May 2025 | 756,146   |
| Jun 2025 | 676,776   |
| Jul 2025 | 619,321   |
| Aug 2025 | 1,209,470 |
| Sep 2025 | 1,533,694 |
| Oct 2025 | 1,299,906 |
| Nov 2025 | 509,500   |
| Dec 2025 | 534,949   |
| Jan 2026 | 880,073   |
| Feb 2026 | 1,781,087 |
| Mar 2026 | 919,506   |

## Nobody was sharing data

I'd been running [valorant-twitch-bot.com](https://valorant-twitch-bot.com/) before this, so I already knew the drill:
ship something rough, see if anyone cares, fix it later. And the Deadlock ecosystem had a pretty obvious gap. A few
player tracker sites had built private APIs for their own use, but nobody shared any of it. If you wanted match history
or player stats programmatically, you were out of luck.

So I opened my editor and started writing Python. FastAPI, a cheap server, Valve's game client APIs. No analytics, no
frills, not even open source yet. People showed up almost immediately, which surprised me.

## johnpyp

About a month in, I pulled [johnpyp](https://github.com/johnpyp) into the project. We knew each other from the Dev
Community. Turns out we both preferred writing code over discussing it, so that worked out.

Two developers, no ticket system, no formal process. Something breaks, we fix it. That's still how we work, for better
or worse.

## The Rust rewrite

By December 2024, the Python API was struggling. Traffic kept growing, but our server budget was around $20 a month and
we really wanted to keep it that way.

So we just rewrote the whole thing in Rust. Took about a month, over December and January. Almost no downtime. The part
that surprised me was how much headroom we suddenly had. Same hardware, completely different story.

I genuinely love writing Rust. The compiler fights you until your code is correct, and then it runs fast enough that two
people can serve millions of requests on a $20 server. For a project that runs on community donations, that matters way
more than developer ergonomics.

## Everything is free

Every endpoint is free. Generous rate limits by default, and if your project needs more, we hand out API keys at no
cost. No premium tier, no paywall.

The reason is simple, honestly. When I started this project, every existing tracker kept their data locked away. If you
wanted to build something on top of Deadlock data, tough luck. That annoyed me then, and it still does.

We do run a [Patreon](https://www.patreon.com/c/manuelhexe) where supporters get prioritized data fetching for their
Steam accounts, starting at $1.50 a month. That covers infrastructure (currently around $200 a month, up from $20 at the
start). We've always tried to optimize our way out of scaling problems before spending more money.

## 20 million requests a day

The numbers still catch me off guard. 20 million requests per day on average. Around 550,000 unique users every week. 18
million matches analyzed and counting.

All of it runs on ClickHouse, which is a columnar database built for exactly this kind of thing. Sub-second queries over
millions of rows. Picking it early on was probably the best technical decision in the whole project, and I say that
knowing how the rest of the stack turned out.

## What people built with it

[Tracklock (now part of U.GG)](https://tracklock.gg) existed before our API, but they adopted it early on. In early
2025, sites like [Statlocker](https://statlocker.gg) and [Lockblaze](https://lockblaze.com) launched, both built
entirely on our data, and the [Mobalytics](https://mobalytics.gg) Deadlock page wouldn't exist without it either.
Statlocker and Mobalytics have also been sponsors the whole time, which honestly helps a lot with keeping the servers
up.

The smaller projects are what really get me, though. [Livelock.gg](https://livelock.gg) shows ongoing matches in real
time using our live data, and [Metalock.gg](https://metalock.gg) built a whole meta tracker and leaderboard on top of
it. There's the [DeadlockAssistant](https://top.gg/bot/1361785119374835984) Discord bot for match stats and MMR
tracking, a [Twitch overlay extension](https://github.com/wenright/DeadlockTwitchOverlay) that lets viewers hover over
items on stream to see what they do, and
a [Deadlock Match Overlay](https://dashboard.twitch.tv/extensions/8svidf83i3usptxryy06qkl7qlrw5t) Twitch extension that
shows the current match's heroes and builds right on stream. [OCElock](https://ocelock.gg) is a competitive Deadlock
league for the Oceania region, using the API for match validation and
results. [Deadlock Companion](https://www.overwolf.com/app/kofimbadam-deadlock_companion) is an Overwolf desktop app for
match tracking and profile analytics. Also on top of this API, people have built tournament organizer websites, stream
bots, university and school projects and every few weeks someone posts a machine learning project on Reddit where they
trained a model on our match data to predict outcomes or figure out the meta, which is always fun to see.

We don't require registration or track who uses the API, so most of these I only find out about when someone mentions
them in our [Discord](https://discord.gg/pqWQfTPQJu). That server has kind of taken on a life of its own. People report
bugs, sure, but they also just talk about Deadlock development stuff that has nothing to do with us.

## Where this is going

Recent traffic to the API has been remarkably steady. Over the 30 days from mid-February to mid-March 2026, we averaged
roughly **23 million requests per day**, with daily peaks above 50 million and around **110,000 unique visitors per
day**. A few highlights from that window:

| Date   | Requests   | Unique visitors |
| ------ | ---------- | --------------- |
| Feb 14 | 50,552,301 | 90,799          |
| Feb 23 | 28,273,267 | 130,302         |
| Mar 7  | 26,760,830 | 129,252         |
| Mar 14 | 25,762,323 | 130,911         |
| Mar 15 | 25,977,623 | 129,747         |

We're adding more analytics views to the [website](/heroes) and getting ready for bigger player numbers as Deadlock
grows. This blog is part of that. We want to actually write about what we find in the data, not just expose it through
endpoints and hope someone notices.

Everything is [open source](https://github.com/deadlock-api/), the [Patreon](https://www.patreon.com/c/manuelhexe) keeps
the servers running, and the [Discord](https://discord.gg/pqWQfTPQJu) is where we hang out. If you want to contribute,
the [API, Website and Data Pipeline](https://github.com/deadlock-api/deadlock-api) all take PRs. Or just show up in
Discord and tell us what's broken.
