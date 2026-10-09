import { Link } from "@tanstack/react-router";
import { ChartColumn, ListOrdered, type LucideIcon, Medal, ScrollText } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { LinkCard } from "~/components/patterns/content/LinkCard";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ProfileHeader, ProfileHeaderMedia } from "~/components/patterns/page/ProfileHeader";
import { Section } from "~/components/patterns/page/Section";
import { Badge } from "~/components/ui/badge";
import { Pips } from "~/components/ui/pips";
import { Inline } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { heroSlug } from "~/lib/hero-slug";

const MAX_COMPLEXITY = 3;

interface HeroPreReleaseProps {
  heroId: number;
  heroName: string;
  /** The hero's own color, a CSS color from the asset data. */
  accent?: string;
  complexity: number;
  tags: readonly string[];
  /** The other pre-release heroes, linked to their pages of their own. */
  upcoming: readonly { id: number; name: string }[];
}

function ToolCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: "/analytics/heroes" | "/analytics/heroes/tier-list" | "/analytics/abilities" | "/patches";
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <LinkCard asChild size="sm" orientation="horizontal" media={<Icon />} title={title} description={description}>
      <Link to={to} preload="intent" />
    </LinkCard>
  );
}

/**
 * The page of a hero the game has announced but not put in matchmaking yet. It holds the address the stats page will
 * use from release day on, so search engines know it before the first match is played.
 */
export function HeroPreRelease({ heroId, heroName, accent, complexity, tags, upcoming }: HeroPreReleaseProps) {
  return (
    <PageShell density="content">
      <ProfileHeader
        accent={accent}
        media={
          <ProfileHeaderMedia shape="portrait">
            <HeroImage heroId={heroId} art="portrait" title="" className="size-full" />
          </ProfileHeaderMedia>
        }
        eyebrow={
          <>
            <Badge variant="warning" size="sm">
              Pre-release
            </Badge>
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" size="sm">
                {tag}
              </Badge>
            ))}
            {complexity > 0 && (
              <Inline gap={1.5} align="center">
                Complexity
                <Pips value={complexity} max={MAX_COMPLEXITY} label={`Complexity ${complexity} of ${MAX_COMPLEXITY}`} />
              </Inline>
            )}
          </>
        }
        title={
          <>
            {heroName} <span className="text-muted-foreground">Stats &amp; Builds</span>
          </>
        }
        description={`${heroName} is an upcoming Deadlock hero, still in pre-release. ${heroName}'s win rate, pick rate, best items, skill order and counters appear on this page from tracked matches as soon as ${heroName} is playable in matchmaking.`}
      >
        <StatGroup variant="plain" className="grid-cols-2 @lg:grid-cols-4">
          <Stat label="Win Rate" value={undefined} />
          <Stat label="Pick Rate" value={undefined} />
          <Stat label="Ban Rate" value={undefined} />
          <Stat label="Matches" value="0" sub="tracked" />
        </StatGroup>
      </ProfileHeader>

      {upcoming.length > 0 && (
        <Section title="More Upcoming Heroes">
          <nav aria-label="More upcoming heroes" className="@container">
            <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
              {upcoming.map((hero) => (
                <LinkCard
                  key={hero.id}
                  asChild
                  size="sm"
                  orientation="horizontal"
                  media={<HeroImage heroId={hero.id} art="portrait" title="" className="w-10" />}
                  title={hero.name}
                  description="Pre-release"
                >
                  <Link to="/analytics/heroes/$heroName" params={{ heroName: heroSlug(hero.name) }} preload="intent" />
                </LinkCard>
              ))}
            </div>
          </nav>
        </Section>
      )}

      <Section title="Current Heroes">
        <nav aria-label="Current hero stats" className="@container">
          <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
            <ToolCard
              to="/analytics/heroes/tier-list"
              icon={Medal}
              title="Tier List"
              description="Every playable hero ranked from S to D tier."
            />
            <ToolCard
              to="/analytics/heroes"
              icon={ChartColumn}
              title="Hero Stats"
              description="Win rate, pick rate and ban rate of every hero."
            />
            <ToolCard
              to="/analytics/abilities"
              icon={ListOrdered}
              title="Ability Builds"
              description="The most common skill orders and how often they win."
            />
            <ToolCard
              to="/patches"
              icon={ScrollText}
              title="Patch Notes"
              description="What the latest patch changed, with the stats before and after."
            />
          </div>
        </nav>
      </Section>
    </PageShell>
  );
}
