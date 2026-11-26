---
allowed-tools: Bash(xh:*), Bash(jq:*), Bash(curl:*)
description: Check the patch list and override a patch's name or start
---

## Context

- The newest posts of the patch feed: `curl -s 'https://api.deadlock-api.com/v2/patches' | jq '.[0:8] | map({source, title, pub_date})'`
- The overrides: `PATCHES` in @src/lib/constants.ts

## Your Task

The site builds its patch list from the `/v2/patches` feed (`mergePatchFeed` in @src/lib/patches.ts): one entry per
release day, each running until the next one starts, hero releases included (`kind: "hero"`). A new patch shows up
on its own within about ten minutes (the Worker's feed cache) and needs no commit.

Add or change an entry in `PATCHES` only to override what the feed gets wrong:

- a name: a big update's own name ("City Never Sleeps") where the feed only says "Update";
- an exact start: where the feed has only a backfilled forum post (no Steam post within two days of the release
  day), the merge guesses 20:00 UTC. Use the release's real instant (the Steam post's `pub_date`, or the build time
  from steam.inf, which is Pacific time).

An entry is `{ id: "YYYY-MM-DD", name: "<Name> (YYYY-MM-DD)", shortName, startDate: day.utc("<ISO>").local() }`, newest
first. Ends are never written: each patch ends where the next starts.

Potential additional instructions: $ARGUMENTS
