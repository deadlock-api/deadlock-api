## Codemap

Client-side SPA (ssr: false) built with React Router v7, TanStack Query, nuqs (URL state), Tailwind v4, shadcn/ui.
Two auto-generated OpenAPI clients: `deadlock_api_client` (game data) and `assets_deadlock_api_client` (static assets).
All filter state persisted in URL query params via nuqs. Asset data cached infinitely; analytics cached 24h.

```
app
├── root.tsx                    # App shell: QueryClient, PatronAuthProvider, NuqsAdapter, sidebar layout. Widgets bypass layout.
├── routes.ts                   # flatRoutes() file-system routing
├── entry.client.tsx            # React 19 hydrateRoot with StrictMode
├── tailwind.css                # Theme vars (oklch), dark/light modes, primary=#fa4454
├── dayjs.ts                    # dayjs with utc + duration plugins, re-exported as `day`
│
├── routes
│   ├── _index.tsx              # Landing page: service cards, patron CTA, sponsor logos
│   ├── heroes.tsx              # Hero analytics: 5 tabs (stats, over-time chart, matchups, combs, matchup details)
│   ├── items.tsx               # Item analytics: 3 tabs (stats with confidence intervals, purchase analysis, combos)
│   ├── leaderboard/            # Ranked leaderboard: region filter, hero filter, Fuse.js search, paginated, jump-to-rank
│   ├── badge-distribution/     # Rank distribution bar chart with date range filter
│   ├── chat.tsx                # AI chat: Turnstile verification → SSE streaming → markdown rendering with tool indicators
│   ├── patron.tsx              # Patron dashboard: Patreon OAuth, Steam account CRUD (add/delete/replace/reactivate), player cards
│   ├── streamkit.tsx           # Stream toolkit: command builder + widget builder (box/raw) with live preview
│   ├── streamkit_.widgets.$region.$accountId.$widgetType.tsx  # OBS embed: 3x zoom, transparent bg, auto-reload on version bump
│   ├── data-privacy.tsx        # GDPR: data deletion & tracking re-enable via Steam OpenID auth
│   ├── ingest-cache.tsx        # Community data tool: scans Steam httpcache binaries for replay URLs, uploads match salts
│   ├── auth.patreon.callback.tsx  # OAuth callback: sets session cookie, redirects to /patron
│   └── deadlockstats-privacy.tsx  # Mobile app privacy policy (static page)
│
├── components
│   ├── AppSidebar.tsx          # Fixed desktop sidebar + mobile sheet drawer, nav links, social links, service links
│   ├── HeroImage.tsx           # <HeroImage heroId={number} className? />  — minimap image via cached assets query
│   ├── HeroName.tsx            # <HeroName heroId={number} className? />  — <span> with hero name
│   ├── ItemImage.tsx           # <ItemImage itemId={number} className? />  — shop image via cached assets query
│   ├── ItemName.tsx            # <ItemName itemId={number} className? />  — <span> with item name
│   ├── ItemTier.tsx            # <ItemTier itemId={number} />  — renders tier number from cached assets
│   ├── BadgeImage.tsx          # <BadgeImage badge={rankId} ranks={RankV2[]} imageType?="small"|"large" />  — rank badge with webp/png fallback
│   ├── PatchOrDatePicker.tsx   # <PatchOrDatePicker patchDates={PatchInfo[]} value={{startDate?, endDate?}} onValueChange={} defaultTab?="patch"|"custom" />
│   ├── PatronCTA.tsx           # <PatronCTA message? />  — upsell banner, auto-hidden for active patrons
│   ├── NumberSelector.tsx      # <NumberSelector value={number} onChange={(n)=>} label step min? max? />  — +/- stepper
│   ├── heroes-page/            # Hero stats tables, matchup tables, over-time Recharts line chart
│   ├── items-page/             # Item stats table (Wilson confidence intervals), buy timing chart, combos explorer
│   ├── chat/                   # ChatInput (2048 char limit), ChatMessage (react-markdown), ChatMessageList, ToolIndicator, TurnstileVerification
│   ├── streamkit/
│   │   ├── command/            # Chatbot command builder: template input, variable picker, URL generator, bot instructions
│   │   ├── widget-builder.tsx  # Widget config UI: type/theme/vars/labels/opacity, live preview, OBS URL generator
│   │   └── widgets/            # Embeddable widget components: box (header+stats+match history, 3 themes), raw (single stat text)
│   ├── primitives/             # DateRangePicker, DualRangeSlider, ImgWithSkeleton, ProgressBar, TimeRangeFilter
│   ├── selectors/
│   │   ├── HeroSelector.tsx        # <HeroSelector onHeroSelected={(id|null)=>} selectedHero? allowSelectNull? label? />
│   │   │                           # also: <HeroSelectorMultiple onHeroesSelected={(ids)=>} selectedHeroes={number[]} label? />
│   │   ├── ItemSelector.tsx        # <ItemSelector onItemSelected={(id|null)=>} selectedItem? allowSelectNull? label? />  — Fuse.js search
│   │   ├── RankSelector.tsx        # <RankSelector onRankSelected={(rankId)=>} selectedRank? label? />  — with badge images
│   │   ├── ItemTierSelector.tsx    # Toggle group for item tier filtering
│   │   ├── StringSelector.tsx      # Generic filterable string selector
│   │   └── TimeWindowSelector.tsx  # <TimeWindowSelector minTime? maxTime? onTimeChange={(min,max)=>} />  — dual range slider for game time filtering (0-3600s)
│   └── ui/                     # shadcn/ui (New York variant) — excluded from Biome linting
│
├── hooks
│   ├── useChatStream.ts        # SSE streaming hook: sends POST to AI API, handles start/delta/end/tool_start/tool_end/error events
│   ├── usePatronAuth.ts        # Context consumer for PatronAuthContext
│   ├── useRateLimit.ts         # Tracks X-RateLimit-* headers, computes time-until-reset
│   └── streamkit/              # useStats (polls variables/resolve every 5min), useMatchHistory (polls match-history), useWidgetTheme
│
├── contexts
│   └── PatronAuthContext.tsx   # Global auth: checks /v1/patron/status on mount, provides login/logout/refreshStatus
│
├── lib
│   ├── api.ts                  # Game data API singleton (AnalyticsApi, LeaderboardApi, PlayersApi) — 10s timeout
│   ├── assets-api.ts           # Assets API singleton (HeroesApi, ItemsApi, DefaultApi) — 5s timeout
│   ├── constants.ts            # PATCHES array (date ranges), API_ORIGIN, ASSETS_ORIGIN, game duration bounds
│   ├── patron-api.ts           # Patron CRUD: status, list/add/delete/replace/reactivate steam accounts, player card, Steam ID conversion
│   ├── data-privacy-api.ts     # POST to /v1/data-privacy/request-deletion and request-tracking
│   ├── steam-auth.ts           # Steam OpenID: URL generation, response validation, callback parsing, claimed ID extraction
│   ├── rank-utils.ts           # getRankImageUrl (size/format fallback chain), getRankLabel
│   ├── leaderboard.ts          # extractBadgeMap: builds Map<rankId, SubtierInfo> from RankV2[]
│   ├── nuqs-parsers.ts         # Custom nuqs parsers: parseAsDayjs, parseAsDayjsRange, parseAsSetOf
│   └── utils.ts                # cn(), useDebouncedState, snakeToPretty, randomColorHex, hexToRgba, range
│
├── queries
│   ├── item-stats-query.ts     # queryOptions factory for item stats (consistent cache keys)
│   └── patron-queries.ts       # React Query hooks: usePatronStatus, useSteamAccounts, usePlayerCard, mutation hooks
│
├── constants
│   └── streamkit/widget.ts     # UPDATE_INTERVAL_MS (5min), DEFAULT_VARIABLES/LABELS, THEME_STYLES
│
└── types
    ├── api_hero_stats.ts       # HERO_STATS enum, hero_stats_transform(), TIME_INTERVALS
    ├── chat.ts                 # Message, ToolExecution, SSE event types, ConversationState, ChatError
    ├── general.ts              # Color type (RGB | RGBA | HEX)
    └── streamkit/              # Widget props (BoxWidgetProps, RawWidgetProps), Variable, Region, Theme, Color types
```

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
pnpx opensrc <package>           # npm package (e.g., npx opensrc zod)
pnpx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
pnpx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
pnpx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```
