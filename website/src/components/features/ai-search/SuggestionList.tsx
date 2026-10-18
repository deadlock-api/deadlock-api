import { SparklesIcon, SwordsIcon } from "lucide-react";

import { HeroImage } from "~/components/domain/assets/HeroImage";
import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import type { useListboxCursor } from "~/components/ui/hooks/use-listbox-cursor";
import { OptionRow } from "~/components/ui/option-row";
import { Skeleton } from "~/components/ui/skeleton";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

import type { Suggestion, useSuggestions } from "./use-suggestions";

const GROUPS = [
  { key: "page", label: "Page" },
  { key: "matches", label: "Match" },
  { key: "heroes", label: "Heroes" },
  { key: "players", label: "Players" },
] as const;

function leadingOf(row: Suggestion) {
  if (row.kind === "hero") return <HeroImage heroId={row.id} className="size-6" />;
  if (row.kind === "page" && row.heroId !== undefined) return <HeroImage heroId={row.heroId} className="size-6" />;
  if (row.kind === "player") return <SteamAvatar src={row.avatar} size="sm" />;
  if (row.kind === "match") return <SwordsIcon aria-hidden="true" className="size-4 text-muted-foreground" />;
  return <SparklesIcon aria-hidden="true" className="size-4 text-primary" />;
}

/** A hero's own page reads like the hero rows ("Bebop", "Hero page") rather than "Hero Page", "Bebop". */
function isHeroPage(row: Suggestion) {
  return row.kind === "page" && row.id === "hero_page" && row.filters.length === 1;
}

function labelOf(row: Suggestion) {
  if (row.kind === "match") return `Match ${row.matchId}`;
  if (row.kind !== "page") return row.name;
  return isHeroPage(row) ? row.filters[0] : row.title;
}

function descriptionOf(row: Suggestion) {
  if (isHeroPage(row)) return "Hero page";
  if (row.kind === "page" && row.id === "match") {
    return row.stored === false ? "We don't have this match yet" : row.stored ? "Match details" : undefined;
  }
  if (row.kind === "page") return row.filters.length > 0 ? row.filters.join(" · ") : undefined;
  if (row.kind === "hero") return "Hero page";
  if (row.kind === "match") return "Match details";
  return "Player tracker";
}

/** A suggestion row's shape (portrait, label, a line under it) while the model works out the page. */
function SuggestionSkeleton() {
  return (
    <Inline gap={2} wrap="nowrap" className="px-2 py-1.5">
      <Skeleton className="size-6 shrink-0" />
      <Stack gap={1} className="py-1">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-48" />
      </Stack>
    </Inline>
  );
}

interface SuggestionListProps {
  id: string;
  suggestions: ReturnType<typeof useSuggestions>;
  /** The cursor's props for the option at an index into `suggestions.all`. */
  getOptionProps: ReturnType<typeof useListboxCursor<Suggestion>>["getOptionProps"];
  onPick: (row: Suggestion) => void;
}

/**
 * The listbox of the search's combobox: the page the question routes to, hero pages and players, in groups. The
 * field keeps the focus and the keyboard cursor; a row takes the cursor only when the pointer really moves over it.
 */
export function SuggestionList({ id, suggestions, getOptionProps, onPick }: SuggestionListProps) {
  let index = 0;
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the popup list of a custom combobox; a native select or datalist cannot carry it
      role="listbox"
      id={id}
      aria-label="Suggestions"
      className="flex max-h-96 min-h-0 flex-col gap-1 overflow-y-auto"
    >
      {GROUPS.map((group) => {
        const rows = suggestions[group.key];
        // The page waits on the model: a row of the same size holds its place, so nothing below jumps when it answers.
        const placeholder = group.key === "page" && rows.length === 0 && suggestions.pagePending;
        if (rows.length === 0 && !placeholder) return null;
        const labelId = `${id}-${group.key}`;
        return (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a group of options inside the ARIA listbox above
          <Stack key={group.key} role="group" aria-labelledby={labelId} aria-busy={placeholder || undefined} gap={0}>
            <Text id={labelId} variant="eyebrow" tone="muted" className="px-2 pt-1 pb-0.5">
              {group.label}
            </Text>
            {placeholder && <SuggestionSkeleton />}
            {rows.map((row) => {
              const at = index++;
              return (
                <OptionRow
                  key={row.key}
                  {...getOptionProps(at)}
                  leading={leadingOf(row)}
                  description={descriptionOf(row)}
                  hint={row.kind === "player" ? row.accountId : undefined}
                  onClick={() => onPick(row)}
                >
                  {labelOf(row)}
                </OptionRow>
              );
            })}
          </Stack>
        );
      })}
    </div>
  );
}
