---
allowed-tools: Bash(xh:*), Bash(jq:*), Bash(curl:*)
description: Update patches
---

## Context

- 5 most recent patch dates: `curl 'https://api.deadlock-api.com/v1/patches' | jq '.[0:5] | map ({title,pub_date})'`

## Your Task

Update @app/lib/constants.ts with the latest patch(es). Most new patches are minor, and they will simply replace the most recent minor patch. If there's major patches then LIFO them out so that there's max 2 major patches in the list. Then the 1st major patch goes up to the current date, and the 2nd one goes up to that major patch. Minor patches always go to current date.

Potential additional instructions: $ARGUMENTS
