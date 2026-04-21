import { useQuery } from "@tanstack/react-query";
import type { GameServerInfo } from "deadlock_api_client";
import { AlertTriangle, Plug, Search, Server, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";

import { StringSelector } from "~/components/selectors/StringSelector";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";
import { serversQueryOptions } from "~/queries/servers-query";

const DISCORD_URL = "https://discord.gg/pqWQfTPQJu";

export function meta() {
  return createPageMeta({
    title: "Game Servers | Deadlock API",
    description:
      "Browse currently active Deadlock game servers. Filter by region and game mode, then connect directly with one click.",
    path: "/servers",
  });
}

function connectUrl(server: GameServerInfo) {
  return `steam://connect/${server.ip}:${server.port}`;
}

function prettyGameMode(mode: string) {
  return mode
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatSince(timestamp: string | number | Date, now: number) {
  const seconds = Math.max(0, day(now).diff(day(timestamp), "second"));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export default function Servers() {
  const { data, isPending, isError, error, dataUpdatedAt } = useQuery(serversQueryOptions);
  const showEmptyState = !isPending && !isError;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const [region, setRegion] = useQueryState("region", parseAsString);
  const [gameMode, setGameMode] = useQueryState("mode", parseAsString);
  const [search, setSearch] = useQueryState("q", parseAsString);

  const deduped = useMemo(() => {
    const byAddress = new Map<string, GameServerInfo>();
    for (const s of data ?? []) {
      const key = `${s.ip}:${s.port}`;
      const existing = byAddress.get(key);
      if (!existing || day(s.last_updated).isAfter(day(existing.last_updated))) {
        byAddress.set(key, s);
      }
    }
    return [...byAddress.values()];
  }, [data]);

  const { regions, gameModes, totalPlayers } = useMemo(() => {
    const regionSet = new Set<string>();
    const modeSet = new Set<string>();
    let players = 0;
    for (const s of deduped) {
      regionSet.add(s.region);
      modeSet.add(s.game_mode);
      players += s.current_player_count;
    }
    return {
      regions: [...regionSet].sort((a, b) => a.localeCompare(b)),
      gameModes: [...modeSet].sort((a, b) => a.localeCompare(b)),
      totalPlayers: players,
    };
  }, [deduped]);

  const filtered = useMemo(() => {
    const q = search?.trim().toLowerCase() ?? "";
    return deduped
      .filter((s) => {
        if (region && s.region !== region) return false;
        if (gameMode && s.game_mode !== gameMode) return false;
        if (q && !`${s.ip}:${s.port}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.region !== b.region) return a.region.localeCompare(b.region);
        return b.current_player_count - a.current_player_count;
      });
  }, [deduped, region, gameMode, search]);

  const regionOptions = useMemo(() => regions.map((r) => ({ value: r, label: r.toUpperCase() })), [regions]);
  const gameModeOptions = useMemo(() => gameModes.map((m) => ({ value: m, label: prettyGameMode(m) })), [gameModes]);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Game Servers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live registered Deadlock game servers</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Browse currently active Deadlock game servers from the community server network. Filter by region and game
            mode, then hit Connect to deeplink straight into the server through Steam.
          </p>
        </div>

        <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p className="text-amber-100/90">
            <span className="font-semibold text-amber-200">Super early stage.</span> Open community game servers for
            Deadlock are just getting off the ground. If you want to help build this out, come say hi on{" "}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-200 underline underline-offset-2 hover:text-amber-100"
            >
              our Discord
            </a>
            .
          </p>
        </div>

        <div className="mx-auto flex max-w-4xl flex-wrap items-stretch justify-center gap-3">
          <StatCard icon={Server} label="Servers" value={deduped.length} />
          <StatCard icon={Users} label="Players online" value={totalPlayers} />
          <StatCard icon={Plug} label="Regions" value={regions.length} />
        </div>

        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search IP"
              value={search ?? ""}
              onChange={(e) => setSearch(e.target.value || null)}
              className="w-60 pl-8"
            />
          </div>
          <StringSelector
            label="Region"
            options={regionOptions}
            selected={region}
            onSelect={(v) => setRegion(v || null)}
            allowSelectNull
            nullLabel="All"
          />
          <StringSelector
            label="Game Mode"
            options={gameModeOptions}
            selected={gameMode}
            onSelect={(v) => setGameMode(v || null)}
            allowSelectNull
            nullLabel="All"
          />
        </div>

        {isError ? (
          <div className="py-8 text-center text-sm text-destructive">Failed to load servers: {error?.message}</div>
        ) : (
          <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Region</TableHead>
                  <TableHead>Game Mode</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="w-28 text-right">Connect</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10" />
                  </TableRow>
                ) : showEmptyState && filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      No servers match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => <ServerRow key={s.server_id} server={s} now={now} />)
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {dataUpdatedAt > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Last refreshed {formatSince(dataUpdatedAt, now)} · auto-refreshes every 30s
          </p>
        )}
      </section>
    </div>
  );
}

function ServerRow({ server, now }: { server: GameServerInfo; now: number }) {
  const isStale = day(now).diff(day(server.last_updated), "second") > 60;
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="font-mono text-xs uppercase">
          {server.region}
        </Badge>
      </TableCell>
      <TableCell>{prettyGameMode(server.game_mode)}</TableCell>
      <TableCell className="font-mono text-xs">
        {server.ip}:{server.port}
      </TableCell>
      <TableCell className="text-right tabular-nums">{server.current_player_count}</TableCell>
      <TableCell
        className={cn("text-right text-xs tabular-nums", isStale ? "text-amber-400" : "text-muted-foreground")}
      >
        {formatSince(server.last_updated, now)}
      </TableCell>
      <TableCell className="text-right">
        <Button asChild size="sm" className="h-8 gap-1">
          <a href={connectUrl(server)} title={`Connect to ${server.ip}:${server.port}`}>
            <Plug className="size-3.5" />
            Connect
          </a>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
      <Icon className="size-4 text-primary" />
      <div>
        <div className="text-lg leading-tight font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
