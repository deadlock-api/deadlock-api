import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { cn } from "~/lib/utils";

const MotionPageShell = motion.create(PageShell);

interface GamePageProps extends Omit<React.ComponentProps<typeof MotionPageShell>, "title" | "children" | "width"> {
  title: string;
  subtitle?: React.ReactNode;
  hub: "/games/deadlockdle" | "/games/flashcards";
  hubSearch?: { date?: string };
  /** Sits on the trailing edge of the title: the archive marker. */
  badge?: React.ReactNode;
  width?: "wide" | "prose";
  /** Only for previews that show the page inside another page, which already has its top-level heading. */
  titleAs?: React.ComponentProps<typeof PageHeader>["titleAs"];
  children: React.ReactNode;
}

/** The page of one game: the way back to its hub, the title in the game face, then the game. */
export function GamePage({
  title,
  subtitle,
  hub,
  hubSearch,
  badge,
  width = "wide",
  titleAs,
  children,
  className,
  ...props
}: GamePageProps) {
  return (
    <MotionPageShell
      density="content"
      width={width}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      {...props}
      className={cn("theme-terminal", className)}
    >
      <PageHeader
        align="start"
        titleAs={titleAs}
        eyebrow={
          <Link
            to={hub}
            search={hubSearch}
            className="cursor-target inline-flex items-center gap-1.5 font-mono tracking-wider uppercase transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-3" />
            Back to Hub
          </Link>
        }
        title={
          <span className="bg-linear-to-b from-foreground to-foreground/50 bg-clip-text font-game font-normal text-transparent uppercase">
            {title}
          </span>
        }
        description={subtitle && <span className="font-mono">{subtitle}</span>}
        actions={badge}
      />
      {children}
    </MotionPageShell>
  );
}
