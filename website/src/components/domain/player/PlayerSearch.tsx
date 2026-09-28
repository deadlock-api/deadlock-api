import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useRef, useState } from "react";

import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { SearchInput } from "~/components/ui/search-input";
import { parseSteamIdInput } from "~/lib/steam";
import { useDebouncedState } from "~/lib/utils";
import { steamSearchQueryOptions } from "~/queries/steam-queries";

/** A player picked from the search: an account, with its Steam name and avatar when the search knew them. */
export interface PlayerSearchResult {
  accountId: number;
  name?: string;
  avatar?: string;
}

const MIN_QUERY_LENGTH = 2;
const NO_ACCOUNTS: readonly number[] = [];

/**
 * The search behind `PlayerSearch`: a debounced Steam name search that only runs while `enabled`, plus the account
 * a pasted Steam id, `[U:1:…]` or profile link names, offered before the name matches.
 */
export function usePlayerSearch({ enabled = true }: { enabled?: boolean } = {}) {
  const [query, debouncedQuery, setQuery] = useDebouncedState("", 300);
  const term = debouncedQuery.trim();
  const search = useQuery({ ...steamSearchQueryOptions(term), enabled: enabled && term.length >= MIN_QUERY_LENGTH });
  const parsed = term ? parseSteamIdInput(term) : null;
  const idMatch = parsed && "steamId3" in parsed ? parsed.steamId3 : null;
  const results: PlayerSearchResult[] = (search.data ?? []).map((profile) => ({
    accountId: profile.account_id,
    name: profile.personaname,
    avatar: profile.avatarmedium || profile.avatar,
  }));
  return {
    query,
    setQuery,
    /** The query the results belong to. */
    term,
    tooShort: term.length < MIN_QUERY_LENGTH && idMatch == null,
    idMatch,
    /** Name matches, without the one the id row already offers. */
    results: results.filter((result) => result.accountId !== idMatch),
    isFetching: search.isFetching,
    isError: search.isError,
    retry: () => void search.refetch(),
  };
}

interface PlayerSearchProps extends Omit<React.ComponentProps<typeof Button>, "children"> {
  /** A player was picked; the popover closes and focus returns to the trigger. */
  onValueChange?: (player: PlayerSearchResult) => void;
  /** Accounts shown but not pickable again, such as the players already in a comparison. */
  disabledAccountIds?: readonly number[];
  /** The trigger's text. */
  label?: string;
  align?: React.ComponentProps<typeof PopoverContent>["align"];
}

/**
 * A button that opens a Steam player search: type a name, or paste a Steam id or profile link. Arrow keys move from
 * the field through the results, Enter picks, Escape closes and returns focus to the trigger.
 */
export function PlayerSearch({
  onValueChange,
  disabledAccountIds = NO_ACCOUNTS,
  label = "Search a player…",
  align = "start",
  variant = "subtle",
  size = "sm",
  ...props
}: PlayerSearchProps) {
  const [open, setOpen] = useState(false);
  const search = usePlayerSearch({ enabled: open });
  const listRef = useRef<HTMLUListElement>(null);
  const { setQuery } = search;

  const pick = (player: PlayerSearchResult) => {
    onValueChange?.(player);
    setOpen(false);
    setQuery("");
  };

  const options: PlayerSearchResult[] = [
    ...(search.idMatch != null ? [{ accountId: search.idMatch }] : []),
    ...search.results,
  ];
  const pickable = options.filter((option) => !disabledAccountIds.includes(option.accountId));

  const rows = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
  const moveFocus = (event: React.KeyboardEvent, step: 1 | -1) => {
    const all = rows();
    if (all.length === 0) return;
    event.preventDefault();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    all[at === -1 ? (step === 1 ? 0 : all.length - 1) : (at + step + all.length) % all.length]?.focus();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button data-slot="player-search" variant={variant} size={size} {...props}>
          <SearchIcon aria-hidden="true" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} aria-label="Search players" className="flex w-72 flex-col gap-2 p-2">
        <SearchInput
          aria-label="Steam name, Steam id or profile link"
          value={search.query}
          onValueChange={setQuery}
          placeholder="Steam name or id…"
          size="sm"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") moveFocus(event, 1);
            else if (event.key === "Enter" && pickable[0]) {
              event.preventDefault();
              pick(pickable[0]);
            }
          }}
        />
        <div className="max-h-64 overflow-y-auto">
          {search.tooShort ? (
            <EmptyState variant="inline" title="Type a name or paste a Steam id." className="py-2 text-xs" />
          ) : search.isError && options.length === 0 ? (
            <ErrorState
              variant="inline"
              title="The search failed."
              onRetry={search.retry}
              retrying={search.isFetching}
            />
          ) : search.isFetching && options.length === 0 ? (
            <LoadingState size="sm" text="Searching players…" label="players" className="py-2 text-xs" />
          ) : options.length === 0 ? (
            <EmptyState variant="inline" title="No players found." className="py-2 text-xs" />
          ) : (
            <ul ref={listRef} aria-label="Players" className="flex flex-col">
              {options.map((option) => {
                const taken = disabledAccountIds.includes(option.accountId);
                return (
                  <li key={option.accountId}>
                    <OptionRow
                      disabled={taken}
                      hint={taken ? "Added" : option.name ? undefined : "Account id"}
                      description={option.name ? undefined : String(option.accountId)}
                      onClick={() => pick(option)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") moveFocus(event, 1);
                        else if (event.key === "ArrowUp") moveFocus(event, -1);
                      }}
                      leading={<SteamAvatar src={option.avatar} size="sm" />}
                    >
                      {option.name ?? `Player ${option.accountId}`}
                    </OptionRow>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
