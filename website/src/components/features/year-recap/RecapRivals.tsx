import { GameIcon, type GameIconName } from "~/components/domain/assets/GameIcon";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { HeroName } from "~/components/domain/assets/HeroName";
import { StoryChapter } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { useHeroById } from "~/hooks/useAssetById";
import { formatPercent } from "~/lib/format";
import { hasDamageMatrix, hasDetails, MIN_SAMPLE } from "~/lib/year-recap/recap";
import type { ModeRecap } from "~/lib/year-recap/types";

import { compact, Coverage, count, heroAccent, plural } from "./shared";

function RivalCard({
  heroId,
  icon,
  label,
  line,
  detail,
}: {
  heroId: number;
  /** The game's glyph for the kind of rivalry. */
  icon: GameIconName;
  label: string;
  line: string;
  detail?: string;
}) {
  const { hero, isLoading } = useHeroById(heroId);
  return (
    <Card tone="inset" size="sm" accent={heroAccent(hero)}>
      <CardContent className="flex items-center gap-4 text-start">
        <HeroImage
          hero={hero}
          loading={isLoading}
          art="portrait"
          decorative
          shape="rounded"
          className="w-16 shrink-0"
        />
        <Stack gap={1} className="min-w-0">
          <Inline gap={1.5} wrap="nowrap">
            <GameIcon name={icon} size="sm" className="text-muted-foreground" />
            <Text variant="eyebrow">{label}</Text>
          </Inline>
          <Text className="type-heading" wrap="truncate">
            <HeroName hero={hero} loading={isLoading} />
          </Text>
          <Text variant="body">{line}</Text>
          {detail && (
            <Text variant="caption" tone="muted">
              {detail}
            </Text>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Who they hurt and who hurt them: the favourite victim (damage-matrix matches), the nemesis (most kills on them),
 * the enemy hero met most and the matchups that went best and worst, each from enough matches to say so.
 */
export function RivalsChapter({ id, main }: { id: string; main: ModeRecap }) {
  const { totals } = main;
  const victim = hasDamageMatrix(totals) ? main.damage_targets[0] : undefined;
  const nemesis = hasDetails(totals) ? main.killers[0] : undefined;
  const faced = (hasDetails(totals) ? main.enemies : []).filter((enemy) => enemy.matches >= MIN_SAMPLE);
  const easiest = faced.reduce<(typeof faced)[number] | undefined>(
    (best, enemy) => (!best || enemy.wins / enemy.matches > best.wins / best.matches ? enemy : best),
    undefined,
  );
  const hardest = faced.reduce<(typeof faced)[number] | undefined>(
    (worst, enemy) => (!worst || enemy.wins / enemy.matches < worst.wins / worst.matches ? enemy : worst),
    undefined,
  );
  return (
    <StoryChapter
      id={id}
      eyebrow="Victims and nemeses"
      title="Nothing personal"
      description="Some heroes you could not leave alone. Some could not leave you alone."
    >
      <Grid columns={{ base: 1, md: 2 }} gap={3}>
        {victim && (
          <RivalCard
            heroId={victim.hero_id}
            icon="damage"
            label="Favourite victim"
            line={`${compact(victim.damage)} damage dealt`}
            detail={`across ${count(victim.matches)} ${plural(victim.matches, "match", "matches")}`}
          />
        )}
        {nemesis && (
          <RivalCard
            heroId={nemesis.hero_id}
            icon="death"
            label="Nemesis"
            line={`Killed you ${count(nemesis.deaths)} ${plural(nemesis.deaths, "time")}`}
            detail="more than any other hero"
          />
        )}
        {easiest && easiest.wins / easiest.matches > 0.5 && (
          <RivalCard
            heroId={easiest.hero_id}
            icon="kill"
            label="Easiest matchup"
            line={`${formatPercent(easiest.wins / easiest.matches)} won against it`}
            detail={`in ${count(easiest.matches)} matches`}
          />
        )}
        {hardest && hardest !== easiest && hardest.wins / hardest.matches < 0.5 && (
          <RivalCard
            heroId={hardest.hero_id}
            icon="armor"
            label="Toughest matchup"
            line={`${formatPercent(hardest.wins / hardest.matches)} won against it`}
            detail={`in ${count(hardest.matches)} matches`}
          />
        )}
      </Grid>
      {victim && <Coverage covered={totals.damage_matrix_matches} total={totals.matches} what="damage by target" />}
      {nemesis && <Coverage covered={totals.detailed_matches} total={totals.matches} what="their killers recorded" />}
    </StoryChapter>
  );
}
