import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useRef, useState } from "react";

import { SteamAvatar } from "~/components/domain/player/SteamAvatar";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { OptionRow } from "~/components/ui/option-row";
import { parseSteamIdToId3 } from "~/lib/steam";

export interface TrackerAccountOption {
  accountId: number;
  name: string;
  avatar?: string;
}

/** Search only the already-authorized account list; typing never starts another lookup. */
export function TrackerAccountList({ accounts }: { accounts: TrackerAccountOption[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const nameQuery = trimmed.toLowerCase();
  const normalizedId = parseSteamIdToId3(trimmed);
  const results = accounts.filter((account) => {
    const id = String(account.accountId);
    return (
      account.name.toLowerCase().includes(nameQuery) ||
      (normalizedId !== trimmed ? id === normalizedId : id.includes(trimmed))
    );
  });

  const clear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      {(accounts.length > 1 || query.length > 0) && (
        <>
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              type="search"
              aria-label="Filter linked accounts by name or Steam ID"
              placeholder="Find a name or Steam ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  clear();
                }
              }}
            />
            {query && (
              <Button variant="ghost" size="icon" onClick={clear} aria-label="Clear account filter">
                <X />
              </Button>
            )}
          </div>
          <output className="px-3 text-xs text-muted-foreground tabular-nums">
            {trimmed ? `${results.length} of ${accounts.length} accounts` : `${accounts.length} linked accounts`}
          </output>
        </>
      )}
      {results.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No matching accounts"
          description="Try another name or Steam ID, or clear the filter."
        />
      ) : (
        <ul aria-label="Linked tracker accounts" className="flex flex-col gap-1">
          {results.map(({ accountId, avatar, name }) => (
            <li key={accountId}>
              <OptionRow
                asChild
                selected={false}
                leading={<SteamAvatar src={avatar} />}
                description={<span className="font-mono">{accountId}</span>}
                trailing={<ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />}
              >
                <Link to="/tracker/players/$accountId" params={{ accountId: String(accountId) }}>
                  {name}
                </Link>
              </OptionRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
