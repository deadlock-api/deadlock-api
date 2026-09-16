import { useQuery } from "@tanstack/react-query";
import type { PlayerMatchHistoryEntry } from "deadlock_api_client";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import type { CompanionRow } from "~/lib/tracker/companions";
import { sortMatches } from "~/lib/tracker/compute";
import { cn } from "~/lib/utils";
import { heroesQueryOptions } from "~/queries/asset-queries";

import { MatchListItem } from "../matches/MatchListItem";

const CHUNK_SIZE = 20;

function SharedMatches({
  row,
  entries,
  onOpenMatch,
}: {
  row: CompanionRow;
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
}) {
  const instructionsId = useId();
  const { data: heroNames } = useQuery({
    ...heroesQueryOptions,
    select: (heroes) => new Map(heroes.map((hero) => [hero.id, hero.name])),
  });
  const matches = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.match_id, entry]));
    return sortMatches(
      row.matchIds.flatMap((id) => {
        const entry = byId.get(id);
        return entry ? [entry] : [];
      }),
      "played",
      "desc",
    );
  }, [entries, row.matchIds]);
  const [visibleCount, setVisibleCount] = useState(CHUNK_SIZE);
  const [focusedMatchId, setFocusedMatchId] = useState<number | null>(null);
  const visibleMatches = matches.slice(0, visibleCount);
  const tabbableMatchId = visibleMatches.some((entry) => entry.match_id === focusedMatchId)
    ? focusedMatchId
    : visibleMatches[0]?.match_id;
  const listRef = useRef<HTMLElement>(null);
  const firstAddedMatch = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (visibleCount <= CHUNK_SIZE || firstAddedMatch.current == null) return;
    const item = listRef.current?.querySelector<HTMLButtonElement>(`[data-match-id="${firstAddedMatch.current}"]`);
    firstAddedMatch.current = undefined;
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: "nearest" });
  }, [visibleCount]);

  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
      <nav
        ref={listRef}
        className="shrink-0 overflow-hidden rounded-md border border-border"
        aria-label="Shared match history"
        aria-describedby={instructionsId}
        onFocusCapture={(event) => {
          if (event.target instanceof HTMLButtonElement) setFocusedMatchId(Number(event.target.dataset.matchId));
        }}
      >
        <p id={instructionsId} className="sr-only">
          Use arrow keys to browse matches, Home and End for the first and last shown, and Enter to open.
        </p>
        {visibleMatches.map((entry, index) => (
          <MatchListItem
            key={entry.match_id}
            entry={entry}
            heroName={heroNames?.get(entry.hero_id) ?? `Hero ${entry.hero_id}`}
            hasRecord={false}
            selected={false}
            tabIndex={entry.match_id === tabbableMatchId ? 0 : -1}
            showTimeOfDay={false}
            sortKey="played"
            onSelect={() => onOpenMatch(entry.match_id)}
            onKeyDown={(event) => {
              if (event.altKey || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? visibleMatches.length - 1
                    : index + (event.key === "ArrowDown" ? 1 : -1);
              const next = visibleMatches[nextIndex];
              if (next)
                listRef.current?.querySelector<HTMLButtonElement>(`[data-match-id="${next.match_id}"]`)?.focus();
            }}
          />
        ))}
      </nav>
      {visibleCount < matches.length && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            firstAddedMatch.current = matches[visibleCount]?.match_id;
            setVisibleCount((count) => count + CHUNK_SIZE);
          }}
        >
          Show {Math.min(CHUNK_SIZE, matches.length - visibleCount)} more matches
        </Button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        {Math.min(visibleCount, matches.length).toLocaleString("en-US")} of {matches.length.toLocaleString("en-US")}{" "}
        matches · newest first
      </p>
    </div>
  );
}

/** Makes a shared game count actionable without opening another player's patron-gated tracker. */
export function CompanionMatchesDialog({
  row,
  name,
  relation,
  entries,
  onOpenMatch,
  className,
}: {
  row: CompanionRow;
  name: string;
  relation: "with" | "against";
  entries: PlayerMatchHistoryEntry[];
  onOpenMatch: (matchId: number) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded-sm text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-ring",
            className,
          )}
          aria-label={`View ${row.matches} ${row.matches === 1 ? "match" : "matches"} ${relation} ${name}`}
        >
          {row.matches.toLocaleString("en-US")}
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="pr-5 break-words">
            Matches {relation} {name}
          </DialogTitle>
          <DialogDescription>
            Your results in the current filters: {row.wins} wins · {row.matches - row.wins} losses ·{" "}
            {((row.wins / row.matches) * 100).toFixed(1)}% win rate. Select a match to open its details.
          </DialogDescription>
        </DialogHeader>
        <SharedMatches
          row={row}
          entries={entries}
          onOpenMatch={(matchId) => {
            setOpen(false);
            onOpenMatch(matchId);
          }}
        />
        <DialogFooter showCloseButton className="shrink-0" />
      </DialogContent>
    </Dialog>
  );
}
