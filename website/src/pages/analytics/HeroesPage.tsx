import { HeroFiltersSection } from "~/components/features/heroes/HeroFiltersSection";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import { type HeroTab, useHeroFilters } from "~/hooks/useHeroFilters";
import { analyticsTabPath, ANALYTICS_VIEWS } from "~/lib/analytics-tabs";

import {
  HeroByDurationTab,
  HeroByExperienceTab,
  HeroByRankTab,
  HeroCombosTab,
  HeroMatchupDetailsTab,
  HeroMatchupsTab,
  HeroOverallStatsTab,
  HeroOverTimeTab,
  HeroScoreboardTab,
  HeroTierListTab,
} from "./HeroesPageTabs";

/** The heroes analytics page: shared filters, then one tab component per view, each owning its controls and data. */
export function HeroesPage() {
  const filters = useHeroFilters();
  const view = ANALYTICS_VIEWS.heroes[filters.tab];

  return (
    <PageShell>
      <PageHeader title={view.heading} description={view.summary} />

      <HeroFiltersSection {...filters} />

      <Tabs
        value={filters.tab ?? undefined}
        onValueChange={(value) => filters.setTab(value as HeroTab)}
        className="w-full"
      >
        <ResponsiveTabsList
          aria-label="Hero stats sections"
          value={filters.tab ?? undefined}
          onValueChange={(value) => filters.setTab(value as HeroTab)}
        >
          <ResponsiveTab value="stats" href={analyticsTabPath("heroes", "stats")}>
            Overall Stats
          </ResponsiveTab>
          <ResponsiveTab value="tier-list" href={analyticsTabPath("heroes", "tier-list")}>
            Tier List
          </ResponsiveTab>
          <ResponsiveTab value="stats-over-time" href={analyticsTabPath("heroes", "stats-over-time")}>
            Over Time
          </ResponsiveTab>
          <ResponsiveTab value="stats-by-duration" href={analyticsTabPath("heroes", "stats-by-duration")}>
            By Duration
          </ResponsiveTab>
          <ResponsiveTab value="stats-by-rank" href={analyticsTabPath("heroes", "stats-by-rank")}>
            By Rank
          </ResponsiveTab>
          <ResponsiveTab value="stats-by-experience" href={analyticsTabPath("heroes", "stats-by-experience")}>
            By Experience
          </ResponsiveTab>
          <ResponsiveTab value="hero-combs" href={analyticsTabPath("heroes", "hero-combs")}>
            Combos
          </ResponsiveTab>
          <ResponsiveTab value="matchups" href={analyticsTabPath("heroes", "matchups")}>
            Matchups
          </ResponsiveTab>
          <ResponsiveTab value="hero-matchup-details" href={analyticsTabPath("heroes", "hero-matchup-details")}>
            Matchup Details
          </ResponsiveTab>
          <ResponsiveTab value="hero-scoreboard" href={analyticsTabPath("heroes", "hero-scoreboard")}>
            Scoreboard
          </ResponsiveTab>
        </ResponsiveTabsList>

        <TabsContent value="stats">
          <HeroOverallStatsTab filters={filters} />
        </TabsContent>
        <TabsContent value="tier-list">
          <HeroTierListTab filters={filters} />
        </TabsContent>
        <TabsContent value="stats-over-time">
          <HeroOverTimeTab filters={filters} />
        </TabsContent>
        <TabsContent value="stats-by-duration">
          <HeroByDurationTab filters={filters} />
        </TabsContent>
        <TabsContent value="stats-by-rank">
          <HeroByRankTab filters={filters} />
        </TabsContent>
        <TabsContent value="stats-by-experience">
          <HeroByExperienceTab filters={filters} />
        </TabsContent>
        <TabsContent value="matchups">
          <HeroMatchupsTab filters={filters} />
        </TabsContent>
        <TabsContent value="hero-combs">
          <HeroCombosTab filters={filters} />
        </TabsContent>
        <TabsContent value="hero-matchup-details">
          <HeroMatchupDetailsTab filters={filters} />
        </TabsContent>
        <TabsContent value="hero-scoreboard">
          <HeroScoreboardTab filters={filters} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
