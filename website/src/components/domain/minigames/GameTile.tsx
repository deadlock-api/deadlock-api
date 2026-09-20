import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { LinkCard } from "~/components/patterns/content/LinkCard";
import { IconTile } from "~/components/ui/icon-tile";

interface GameTileProps extends Omit<React.ComponentProps<"a">, "title" | "href" | "children"> {
  to: string;
  search?: { date?: string };
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: React.ComponentProps<typeof LinkCard>["tone"];
  /** The state of today's run, on the trailing edge of the footer. */
  badge?: React.ReactNode;
}

/** A game on a hub page. */
export function GameTile({ to, search, title, description, icon: Icon, tone, badge, ...props }: GameTileProps) {
  return (
    <LinkCard
      asChild
      size="sm"
      tone={tone}
      title={title}
      as="h2"
      description={description}
      media={
        <IconTile size="sm">
          <Icon />
        </IconTile>
      }
      cta="Play"
      footer={badge}
      {...props}
    >
      <Link to={to} search={search} preload="intent" className="cursor-target" />
    </LinkCard>
  );
}
