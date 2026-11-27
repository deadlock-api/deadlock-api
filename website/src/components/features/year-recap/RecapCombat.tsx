import { Sparkles } from "lucide-react";

import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { GameIcon, type GameIconName } from "~/components/domain/assets/GameIcon";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ITEM_SLOT_COLOR } from "~/components/domain/assets/item-slot-color";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { StoryChapter, StoryFigure } from "~/components/patterns/story/Story";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { Heading, useNextHeadingLevel } from "~/components/ui/heading";
import { IconTile } from "~/components/ui/icon-tile";
import { ProgressBar, ProgressBarSegment } from "~/components/ui/progress-bar";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Text } from "~/components/ui/text";
import { formatPercent } from "~/lib/format";
import { formatClock } from "~/lib/stat-format";
import { damageSplit, type DamageStyle, hasDetails, kda, mergeDamageSources, ratio } from "~/lib/year-recap/recap";
import type { ModeRecap, RecapRecordStat } from "~/lib/year-recap/types";

import { compact, Coverage, count, FigureArt, RecordCard } from "./shared";
import { type DamageSourceArt, useNamedDamageSources } from "./useDamageSources";

/** Kills, deaths, assists, damage and aim over every match of the main mode. */
export function CombatChapter({ id, main }: { id: string; main: ModeRecap }) {
  const { totals } = main;
  const ratioKda = kda(totals);
  const perMatch = totals.kills / Math.max(1, totals.matches);
  const accuracy = ratio(totals.shots_hit, totals.shots_hit + totals.shots_missed);
  const crit = ratio(totals.hero_bullets_crit, totals.hero_bullets_hit);
  const detailed = hasDetails(totals);
  const killTypes = totals.bullet_kills + totals.ability_kills + totals.melee_kills;
  const killsBy: { label: string; icon: GameIconName } =
    totals.ability_kills >= totals.bullet_kills && totals.ability_kills >= totals.melee_kills
      ? { label: "abilities", icon: "spirit" }
      : totals.bullet_kills >= totals.melee_kills
        ? { label: "bullets", icon: "bullets" }
        : { label: "melee", icon: "melee" };
  return (
    <StoryChapter
      id={id}
      eyebrow="Kills and KDA"
      title={ratioKda >= 3 ? "A menace on the map" : ratioKda >= 1.5 ? "Always in the fight" : "Fearless, to a fault"}
      description={`A KDA of ${ratioKda.toFixed(2)}: ${count(totals.kills)} kills and ${count(totals.assists)} assists for ${count(totals.deaths)} deaths.`}
    >
      <FigureArt art={<GameIcon name="kill" size="xl" className="text-primary" />}>
        <StoryFigure
          size="lg"
          value={count(totals.kills)}
          unit="kills"
          caption={
            totals.kills === 0
              ? "Pacifism is a valid strategy. Probably."
              : `About ${perMatch.toFixed(1)} a match, and ${compact(totals.player_damage)} damage to enemy heroes.`
          }
        />
      </FigureArt>
      <StatGroup size="sm" overflow="wrap" className="grid-cols-2 @2xl/story:grid-cols-4">
        <Stat icon={<GameIcon name="assist" size="sm" />} label="Assists" value={count(totals.assists)} />
        <Stat icon={<GameIcon name="death" size="sm" />} label="Deaths" value={count(totals.deaths)} />
        <Stat icon={<GameIcon name="damage" size="sm" />} label="Hero damage" value={compact(totals.player_damage)} />
        <Stat
          icon={<GameIcon name="guardian" size="sm" />}
          label="Objective damage"
          value={compact(totals.boss_damage)}
        />
        {accuracy != null && (
          <Stat
            icon={<GameIcon name="bullets" size="sm" />}
            label="Accuracy"
            value={formatPercent(accuracy)}
            sub="of every shot fired"
          />
        )}
        {crit != null && (
          <Stat
            icon={<GameIcon name="headshot" size="sm" />}
            label="Crit rate"
            value={formatPercent(crit)}
            sub="of hero hits"
          />
        )}
        {detailed && (
          <Stat
            icon={<GameIcon name="headshot" size="sm" />}
            label="Headshot kills"
            value={count(totals.headshot_kills)}
          />
        )}
        {detailed && killTypes > 0 && (
          <Stat
            icon={<GameIcon name={killsBy.icon} size="sm" />}
            label="Kills by"
            value={formatPercent(
              Math.max(totals.ability_kills, totals.bullet_kills, totals.melee_kills) / killTypes,
              0,
            )}
            sub={killsBy.label}
          />
        )}
      </StatGroup>
      {detailed && (
        <Coverage covered={totals.detailed_matches} total={totals.matches} what="headshots and kill types recorded" />
      )}
    </StoryChapter>
  );
}

const RECORDS: {
  stat: RecapRecordStat;
  label: string;
  icon: GameIconName;
  format?: "compact" | "clock" | "seconds";
}[] = [
  { stat: "kills", label: "Most kills", icon: "kill" },
  { stat: "player_damage", label: "Most hero damage", icon: "damage", format: "compact" },
  { stat: "souls", label: "Richest game", icon: "soul", format: "compact" },
  { stat: "assists", label: "Most assists", icon: "assist" },
  { stat: "player_healing", label: "Most healing", icon: "heal", format: "compact" },
  { stat: "last_hits", label: "Most last hits", icon: "lanes" },
  { stat: "shortest_win_s", label: "Fastest win", icon: "clock", format: "clock" },
  { stat: "longest_match_s", label: "Longest match", icon: "clock", format: "clock" },
  { stat: "deaths", label: "Roughest night", icon: "death" },
  { stat: "headshot_kills", label: "Most headshot kills", icon: "headshot" },
  { stat: "parries", label: "Most parries", icon: "parry" },
  { stat: "cc_ms", label: "Most crowd control", icon: "stun", format: "seconds" },
  { stat: "boss_damage", label: "Most objective damage", icon: "guardian", format: "compact" },
  { stat: "damage_mitigated", label: "Most damage mitigated", icon: "armor", format: "compact" },
];

const formatRecord = (value: number, format: (typeof RECORDS)[number]["format"]) =>
  format === "compact"
    ? compact(value)
    : format === "clock"
      ? formatClock(value)
      : format === "seconds"
        ? `${count(value / 1000)}s`
        : count(value);

/** At most this many records: the first ones in `RECORDS` order that the player has. */
const RECORDS_SHOWN = 9;

/** The best single games of the year, each a card that opens the match. */
export function RecordsChapter({ id, main }: { id: string; main: ModeRecap }) {
  const shown = RECORDS.flatMap(({ stat, label, icon, format }) => {
    const record = main.records.find((candidate) => candidate.stat === stat);
    return record && record.value > 0 ? [{ ...record, label, icon, value: formatRecord(record.value, format) }] : [];
  }).slice(0, RECORDS_SHOWN);
  const kills = main.records.find((record) => record.stat === "kills");
  return (
    <StoryChapter
      id={id}
      eyebrow="Best games"
      title="Your highlight reel"
      description={
        kills
          ? `Your best game had ${kills.value} kills. Here are the matches you will tell your friends about.`
          : "The matches you will tell your friends about."
      }
    >
      <Grid columns={{ base: 1, sm: 2, xl: 3 }} gap={3}>
        {shown.map((record) => (
          <RecordCard
            key={record.stat}
            label={record.label}
            icon={record.icon}
            value={record.value}
            heroId={record.hero_id}
            won={record.won}
            matchId={record.match_id}
            startTime={record.start_time}
          />
        ))}
      </Grid>
    </StoryChapter>
  );
}

const STYLE: Record<DamageStyle, { title: string }> = {
  gunslinger: { title: "Gunslinger" },
  spirit: { title: "Spirit caster" },
  brawler: { title: "Brawler" },
  hybrid: { title: "Jack of all trades" },
};

// Bullets in the weapon color, abilities in the spirit color, melee in the vitality color: the shop's own categories.
const SPLIT_COLORS = {
  bullet: ITEM_SLOT_COLOR.weapon,
  ability: ITEM_SLOT_COLOR.spirit,
  melee: ITEM_SLOT_COLOR.vitality,
};

/** The game's glyph for each kind of damage, painted in its shop category's color (the same as its bar segment). */
const SPLIT_ICONS = {
  bullet: { name: "bullets", className: "text-item-weapon" },
  ability: { name: "spirit", className: "text-item-spirit" },
  melee: { name: "melee", className: "text-item-vitality" },
} as const satisfies Record<keyof typeof SPLIT_COLORS, { name: GameIconName; className: string }>;

function SourceArt({ art }: { art: DamageSourceArt }) {
  if (!art)
    return (
      <IconTile size="sm" aria-hidden="true">
        <Sparkles />
      </IconTile>
    );
  if ("abilityId" in art) return <AbilityImage abilityId={art.abilityId} title="" className="size-8 shrink-0" />;
  if ("itemId" in art) return <ItemImage itemId={art.itemId} alt="" title="" className="size-8 shrink-0" />;
  return <HeroImage heroId={art.heroId} decorative shape="circle" className="size-8 shrink-0" />;
}

/** Where the hero damage came from (damage-matrix matches only): the style it adds up to and the signature source. */
export function StyleChapter({ id, main }: { id: string; main: ModeRecap }) {
  const headingLevel = useNextHeadingLevel();
  const split = damageSplit(main.totals);
  const sources = useNamedDamageSources(mergeDamageSources(main.damage_sources).slice(0, 6));
  if (!split) return null;
  const style = STYLE[split.style];
  const parts = [
    { key: "bullet", label: "Bullets", share: split.bullet },
    { key: "ability", label: "Abilities", share: split.ability },
    { key: "melee", label: "Melee", share: split.melee },
  ] as const;
  const lead = [...parts].sort((a, b) => b.share - a.share)[0] ?? parts[0];
  const [signature] = sources;
  return (
    <StoryChapter
      id={id}
      eyebrow="Play style"
      title={`You are a ${style.title.toLowerCase()}`}
      description={`${formatPercent(split.bullet, 0)} of your hero damage came from bullets, ${formatPercent(split.ability, 0)} from abilities and ${formatPercent(split.melee, 0)} from melee.`}
    >
      <FigureArt
        art={<GameIcon name={SPLIT_ICONS[lead.key].name} size="xl" className={SPLIT_ICONS[lead.key].className} />}
      >
        <StoryFigure
          value={formatPercent(lead.share, 0)}
          unit={`from ${lead.label.toLowerCase()}`}
          caption={`${compact(split.total)} hero damage in the matches we could split.`}
        />
      </FigureArt>
      <Stack gap={2}>
        <ProgressBar aria-label="Hero damage by type">
          {parts.map((part) => (
            <ProgressBarSegment key={part.key} value={part.share} color={SPLIT_COLORS[part.key]} />
          ))}
        </ProgressBar>
        <Inline gap={4} justify="center">
          {parts.map((part) => (
            <Inline key={part.key} gap={1.5} wrap="nowrap">
              <GameIcon name={SPLIT_ICONS[part.key].name} size="sm" className={SPLIT_ICONS[part.key].className} />
              <Text variant="caption" tone="muted">
                <Text tone="default" className="font-semibold">
                  {part.label}
                </Text>{" "}
                {formatPercent(part.share, 0)}
              </Text>
            </Inline>
          ))}
        </Inline>
      </Stack>
      {signature && (
        <Stack gap={3}>
          <Heading as={headingLevel} size="sm">
            Your signature: {signature.name}
          </Heading>
          <Grid columns={{ base: 1, md: 2 }} gap={2}>
            {sources.map((source) => (
              <Card key={source.source} tone="inset" size="xs">
                <CardContent className="flex items-center gap-3">
                  <SourceArt art={source.art} />
                  <Stack gap={1} className="min-w-0 flex-1">
                    <Inline justify="between" wrap="nowrap" gap={2}>
                      <Text variant="label" wrap="truncate">
                        {source.name}
                        {source.detail && (
                          <Text variant="caption" tone="muted" className="font-normal">
                            {" · "}
                            {source.detail}
                          </Text>
                        )}
                      </Text>
                      <Text variant="caption" numeric="tabular" tone="muted">
                        {compact(source.damage)}
                      </Text>
                    </Inline>
                    <ProgressBar variant="thin" value={source.damage / Math.max(1, sources[0]?.damage ?? 1)} />
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Stack>
      )}
      <Coverage covered={main.totals.damage_matrix_matches} total={main.totals.matches} what="a damage breakdown" />
    </StoryChapter>
  );
}
