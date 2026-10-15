import { Link } from "@tanstack/react-router";
import { ChartColumn } from "lucide-react";

import { TerminalButton } from "~/components/domain/minigames/TerminalButton";
import { trackDeadlockdle } from "~/lib/deadlockdle/analytics";
import type { GameMode } from "~/lib/deadlockdle/types";
import { heroSlug } from "~/lib/hero-slug";
import { itemSlug } from "~/lib/item-slug";

type AnswerStatsLinkProps = {
  mode: GameMode;
  date: string;
  isArchive: boolean;
} & ({ hero: string; item?: never } | { item: string; hero?: never });

/** From a solved puzzle to the real stats of its answer: the hero's page or the item's. */
export function AnswerStatsLink({ mode, date, isArchive, hero, item }: AnswerStatsLinkProps) {
  const track = () => trackDeadlockdle("stats_clicked", mode, date, isArchive, { to: hero ? "hero" : "item" });
  return (
    <TerminalButton asChild size="sm">
      {hero !== undefined ? (
        <Link to="/analytics/heroes/$heroName" params={{ heroName: heroSlug(hero) }} preload="intent" onClick={track}>
          <ChartColumn />
          {hero} stats
        </Link>
      ) : (
        <Link to="/analytics/items/$itemName" params={{ itemName: itemSlug(item) }} preload="intent" onClick={track}>
          <ChartColumn />
          {item} stats
        </Link>
      )}
    </TerminalButton>
  );
}
