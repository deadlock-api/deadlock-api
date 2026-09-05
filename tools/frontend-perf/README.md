# Frontend performance checks

Baseline: `39169c7a`. Measurements focus on client rendering and computation after data loads.
The runner injects [Bippy](https://github.com/aidenybai/bippy), the fiber instrumentation used by
[React Scan](https://github.com/aidenybai/react-scan), through Chrome DevTools Protocol; nothing ships in the website.

## Reproduce

Use Node 24+ and an isolated browser. Start the website separately (`cd website && pnpm dev --host 127.0.0.1`).

```sh
npm install --prefix tools/frontend-perf --package-lock=false
agent-browser --session frontend-perf --args '--remote-debugging-port=9226' open http://127.0.0.1:3000
node tools/frontend-perf/profile.mjs heroes /tmp/heroes-profile.json
node tools/frontend-perf/verify-grid.mjs 39169c7a
```

Scenarios: `heroes`, `items`, `heroExperience`, `heroChart`, `heroDuration`, `heroRank`,
`heatmap`, `games`, `leaderboard`, `teamBuilder`, and `rankFilter`.
Set `BASE_URL` and `CDP_PORT` to use other servers/browser sessions. For a normal production
build, set `CPU_ONLY=1`: React self-times are unavailable there, so use browser CPU metrics and render counts.
Build each revision with the same dependencies and serve locally with `wrangler dev --port PORT`.
Run comparisons sequentially, with identical viewport, data, and interactions; avoid other builds during sampling.

Each run records eight alternating interactions, component renders/changed props, browser CPU time,
API requests, table text, chart paths/legend state, and heatmap draw counts/pixel hashes.
Report the median of the final seven samples, discarding the first as warmup.
Times include instrumentation overhead and are local comparisons, not user latency or field Web Vitals.
Animated charts wait 1.8 seconds per interaction to include the full animation. Preserve animation behavior in comparisons.

## Findings

Production builds, Chrome 150 on Linux, 1280×577 at DPR 1, September 5, 2026:

Correction: the earlier games, duration, and purchase-chart figures counted disabling animations as an optimization.
Those figures are withdrawn. Their original animations are restored; the calculation and rerender fixes remain.

| Interaction | Component renders before → after | Median script ms before → after |
| --- | ---: | ---: |
| Hero table: sort win rate | 2,316 → 171 | 19.54 → 7.94 |
| Experience table: sort trend | 6,463 → 136 | 31.09 → 5.94 |
| Heatmap: adjust sensitivity | 49 → 32 | 20.54 → 11.32 |
| Over-time chart: toggle hero | 1,176 → 815 | 31.07 → 21.95 |

The retained comparisons have identical table text, final chart paths/legend state, and heatmap pixel hashes
where applicable. None of these sampled interactions issued API requests. Raw recordings are in ignored `results/`.
Initial development profiling also covered item sorting, leaderboard search, and the team-builder hero picker.

Hero table cells now remain reusable when row order changes, using the existing React Compiler.
Combined query results keep experience and duration data stable across unrelated renders.
Sidebar links subscribe only to whether their route is active, avoiding 17 renders on query-string changes.
Unused bump-chart machinery was still measuring SVG paths and scheduling another over-time chart render; it is removed.
Heatmap normalization uses native typed-array sorting, and its resize observer handles the initial draw without a duplicate.

The grid comparison checks 336 combinations against the baseline, including empty data, all three modes,
and sensitivity boundaries; normalized values, raw tooltip counts, and the color lookup table must match exactly.

Validation: production build, TypeScript, and lint pass (six existing lint warnings). Browser checks cover
grouped sorting, experience stat/search changes and tooltips, plus heatmap team/mode changes, mobile resize, and 3D.

## Items follow-up

Measured against the workspace after the first pass, with the same production setup and sampling method above.
Run `itemTiming`, `itemFlow`, `itemCombos`, or `itemPicker` with `profile.mjs`; recordings use the `items-` prefix in `results/`.

| Interaction | Component renders before → after | Median script ms before → after |
| --- | ---: | ---: |
| Build flow: hover/leave first item | 466 → 245 | 8.18 → 5.03 |
| Combo table: alternate 100/200 rows | 4,457 → 4,257 | 48.75 → 41.90 |

Unused moving averages and debug logging are removed. Flow cards reuse their
contents, and lock pickers retain their callbacks. Combo item cells stay cached and previous-period counts are normalized
only for displayed rows. Main-table sorting and quick-select toggles were already reusing their rows/cards.
All eight paired samples match on table text, chart paths, node positions, and hover opacity where applicable, with no API
requests during sampling. Another 288 chart-data comparisons preserve visible values across bucket types and estimate settings.

Isolation follow-up (eight development samples): flow hover rerenders 0 closed lock pickers instead of 4, and only the
17 cards whose opacity changes instead of all 24. Combo-limit changes rerender 0 existing item cells instead of 100.
Targeted `memo` boundaries skip those unchanged siblings. Page/sidebar components stay idle; all captured output matches.
