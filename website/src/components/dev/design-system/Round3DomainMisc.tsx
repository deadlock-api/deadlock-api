import { BrainIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { AbilityImage } from "~/components/domain/assets/AbilityImage";
import { AbilityName } from "~/components/domain/assets/AbilityName";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { ItemName } from "~/components/domain/assets/ItemName";
import { SteamSignInButton } from "~/components/domain/auth/SteamSignInButton";
import {
  DiscordIcon,
  GitHubIcon,
  PatreonIcon,
  SocialLinks,
  StatusIcon,
  SteamIcon,
} from "~/components/domain/brand/BrandIcons";
import { HeatmapViewModeFilter } from "~/components/domain/filters/HeatmapViewModeFilter";
import { GraphNodeCard } from "~/components/domain/graph/GraphNodeCard";
import { GamePage } from "~/components/domain/minigames/GamePage";
import { GameTile } from "~/components/domain/minigames/GameTile";
import { HeroSelector } from "~/components/domain/selectors/HeroSelector";
import { ItemSlotSelector } from "~/components/domain/selectors/ItemSlotSelector";
import { ItemTierSelector } from "~/components/domain/selectors/ItemTierSelector";
import { MatchTimeRangeSelector } from "~/components/domain/selectors/MatchTimeRangeSelector";
import { ModeSelector } from "~/components/domain/selectors/ModeSelector";
import { RankRangeSelector } from "~/components/domain/selectors/RankRangeSelector";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/panel-tooltip";

const ITEM_NODES = [
  { itemId: 1548066885, accent: "weapon", winRate: 0.534, pickRate: 0.31 },
  { itemId: 968099481, accent: "vitality", winRate: 0.487, pickRate: 0.12 },
  { itemId: 2678489038, accent: "spirit", winRate: 0.5, pickRate: 0.06 },
] as const;
/** Seven's three signature abilities and ultimate. */
const ABILITY_IDS = [1065103387, 1074714947, 539192269, 2061574352];

export function Round3DomainMisc() {
  const [locked, setLocked] = useState<number | null>(ITEM_NODES[0].itemId);
  const [tiers, setTiers] = useState([3, 4]);

  return (
    <>
      <Specimen
        name="SteamSignInButton"
        source="domain/auth/SteamSignInButton"
        note='Starts Steam OpenID sign-in: Button variant="steam" with the Steam mark. The caller owns the redirect, because the return path differs per page.'
      >
        <Variants label="size: lg (default), default, sm · custom label · disabled">
          <SteamSignInButton />
          <SteamSignInButton size="default" />
          <SteamSignInButton size="sm">Connect Steam</SteamSignInButton>
          <SteamSignInButton disabled />
        </Variants>
      </Specimen>

      <Specimen
        name="BrandIcons and SocialLinks"
        source="domain/brand/BrandIcons"
        note="Third-party marks as components that take the text color and size-4 by default. SocialLinks is the row of the project's outbound links; each icon lights up in its brand's color on hover."
      >
        <Variants label="PatreonIcon, StatusIcon, DiscordIcon, GitHubIcon, SteamIcon · size by className">
          <PatreonIcon />
          <StatusIcon />
          <DiscordIcon />
          <GitHubIcon />
          <SteamIcon />
          <DiscordIcon className="size-6 text-discord" />
          <StatusIcon className="size-6 text-positive" />
        </Variants>
        <Variants label="SocialLinks">
          <SocialLinks />
        </Variants>
      </Specimen>

      <Specimen
        name="GraphNodeCard"
        source="domain/graph/GraphNodeCard"
        note="One node of a build graph (item flow, ability order): image, name, meta line and win / pick rate mini-bars. The left edge carries the category. With onClick it is a button that can be selected; the graph places it through className and style."
      >
        <Variants
          label="accent: weapon, vitality, spirit · selectable (click: selected shows a pin) · status · tooltip · focus-visible"
          className="items-stretch"
        >
          {ITEM_NODES.map((node, index) => (
            <GraphNodeCard
              key={node.itemId}
              className="w-52"
              accent={node.accent}
              media={<ItemImage itemId={node.itemId} className="size-9 shrink-0" />}
              name={<ItemName itemId={node.itemId} />}
              meta={
                <>
                  <Badge variant="muted" size="sm">
                    T{index + 2}
                  </Badge>
                  <span className="tabular-nums">{((index + 1) * 1600).toLocaleString("en-US")}</span>
                </>
              }
              status={
                index === 0 && <ShieldCheckIcon aria-label="High confidence" className="size-3.5 text-positive" />
              }
              winRate={node.winRate}
              pickRate={node.pickRate}
              pickRateFill={node.pickRate / 0.31}
              selected={locked === node.itemId}
              onClick={() => setLocked(locked === node.itemId ? null : node.itemId)}
              tooltip={
                <>
                  <TooltipHeader title={<ItemName itemId={node.itemId} />} />
                  <TooltipStats>
                    <TooltipStat label="Win Rate" value={`${(node.winRate * 100).toFixed(1)}%`} />
                    <TooltipStat label="Pick Rate" value={`${(node.pickRate * 100).toFixed(1)}%`} />
                  </TooltipStats>
                </>
              }
            />
          ))}
        </Variants>
        <Variants label='accent: ability-1 ... ability-4, fill="accent" · static (no onClick) · emphasis by pick rate · dimmed · no media · disabled'>
          {ABILITY_IDS.map((abilityId, index) => (
            <GraphNodeCard
              key={abilityId}
              className="w-40"
              accent={`ability-${(index + 1) as 1 | 2 | 3 | 4}`}
              fill="accent"
              media={<AbilityImage abilityId={abilityId} className="size-10 shrink-0" />}
              name={<AbilityName abilityId={abilityId} />}
              meta={
                <>
                  <Badge variant="muted" size="sm">
                    T1
                  </Badge>
                  <span>{index + 1} pts</span>
                </>
              }
              winRate={0.47 + index * 0.02}
              pickRate={0.45 - index * 0.1}
              emphasis={1 - index * 0.3}
            />
          ))}
          <GraphNodeCard className="w-40" name="Root" winRate={0.5} pickRate={1} dimmed />
          <GraphNodeCard className="w-40" name="Disabled" winRate={0.5} pickRate={0.2} onClick={() => {}} disabled />
        </Variants>
      </Specimen>

      <Specimen
        name="Selector value vocabulary"
        source="domain/selectors/* · domain/filters/*"
        note="Every selector and filter speaks value / defaultValue / onValueChange. With value it is controlled; with only defaultValue (or nothing) it keeps its own state, and defaultValue is also what its reset returns to."
      >
        <Variants
          label={`ItemTierSelector controlled (value: ${tiers.join(", ") || "none"}) · ItemSlotSelector uncontrolled · disabled`}
        >
          <ItemTierSelector value={tiers} onValueChange={setTiers} />
          <ItemSlotSelector defaultValue={["weapon"]} />
          <ItemTierSelector defaultValue={[1]} disabled />
        </Variants>
        <Variants label="Uncontrolled filter cells: HeroSelector, ModeSelector, RankRangeSelector, MatchTimeRangeSelector, HeatmapViewModeFilter">
          <HeroSelector allowSelectNull />
          <ModeSelector defaultValue="normal_ranked" />
          <RankRangeSelector />
          <MatchTimeRangeSelector defaultValue={[600, undefined]} />
          <HeatmapViewModeFilter defaultValue="kd" />
        </Variants>
      </Specimen>

      <Specimen
        name="GameTile and GamePage heading level"
        source="domain/minigames/GameTile · domain/minigames/GamePage"
        note='GameTile is a LinkCard; "as" sets the heading level its hub outline asks for (h2 by default). GamePage passes titleAs to PageHeader, so a preview inside another page does not add a second h1.'
        className="theme-terminal grid gap-3 sm:grid-cols-2"
      >
        <GameTile
          to="/games/deadlockdle/trivia"
          title='Trivia (as="h4")'
          description="Ten questions about heroes, items and the map."
          icon={BrainIcon}
          as="h4"
        />
        <Card tone="inset" size="sm">
          <CardContent>
            <GamePage title='titleAs="div"' subtitle="No second h1." hub="/games/deadlockdle" titleAs="div">
              {null}
            </GamePage>
          </CardContent>
        </Card>
      </Specimen>
    </>
  );
}
