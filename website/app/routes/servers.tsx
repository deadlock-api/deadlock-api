import { useQuery } from "@tanstack/react-query";
import type { GameServerInfo, SteamServer } from "deadlock_api_client";
import { ChevronDown, ChevronUp, ExternalLink, Plug, Search, Server, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { parseAsBoolean, parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";

import { StringSelector } from "~/components/selectors/StringSelector";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { day } from "~/dayjs";
import { createPageMeta } from "~/lib/meta";
import { serversQueryOptions, steamServersQueryOptions } from "~/queries/servers-query";

export function meta() {
  return createPageMeta({
    title: "Game Servers | Deadlock API",
    description:
      "Browse currently active Deadlock game servers. Filter by region and game mode, then connect directly with one click.",
    path: "/servers",
  });
}

const DEFAULT_PORT = 27015;
const DEFAULT_MAP = "dl_midtown";
const DEADWORKS_URL = "https://deadworks.net/";

const STEAM_REGION_LABELS: Record<number, string> = {
  [-1]: "World",
  0: "US-East",
  1: "US-West",
  2: "S. America",
  3: "Europe",
  4: "Asia",
  5: "Australia",
  6: "Middle East",
  7: "Africa",
  255: "World",
};

function steamRegionLabel(code: number) {
  return STEAM_REGION_LABELS[code] ?? `R${code}`;
}

function connectUrl(server: GameServerInfo) {
  return `steam://connect/${server.ip}:${server.port}`;
}

function formatAddress(ip: string, port: number) {
  return port === DEFAULT_PORT ? ip : `${ip}:${port}`;
}

function formatSteamAddress(addr: string) {
  return addr.endsWith(`:${DEFAULT_PORT}`) ? addr.slice(0, -`:${DEFAULT_PORT}`.length) : addr;
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
  const [showAll, setShowAll] = useQueryState("all", parseAsBoolean.withDefault(false));

  const {
    data: steamData,
    isPending: isSteamPending,
    isError: isSteamError,
    error: steamError,
  } = useQuery({ ...steamServersQueryOptions, enabled: showAll });

  const deduped = useMemo(() => {
    const byAddress = new Map<string, GameServerInfo>();
    for (const s of data ?? []) {
      if (s.hostname === "Deadlock") continue;
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
        if (q && !`${s.hostname} ${s.ip}:${s.port}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.region !== b.region) return a.region.localeCompare(b.region);
        return b.current_player_count - a.current_player_count;
      });
  }, [deduped, region, gameMode, search]);

  const regionOptions = useMemo(() => regions.map((r) => ({ value: r, label: r.toUpperCase() })), [regions]);
  const gameModeOptions = useMemo(() => gameModes.map((m) => ({ value: m, label: prettyGameMode(m) })), [gameModes]);

  const registeredAddrs = useMemo(() => new Set(deduped.map((s) => `${s.ip}:${s.port}`)), [deduped]);

  const steamOnly = useMemo(() => {
    const q = search?.trim().toLowerCase() ?? "";
    return (steamData ?? [])
      .filter((s) => s.name !== "Deadlock")
      .filter((s) => !registeredAddrs.has(s.addr))
      .filter((s) => {
        if (q && !`${s.name} ${s.addr} ${s.map}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.region !== b.region) return a.region - b.region;
        return b.players - a.players;
      });
  }, [steamData, registeredAddrs, search]);

  const steamTotalPlayers = useMemo(() => steamOnly.reduce((sum, s) => sum + s.players, 0), [steamOnly]);

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
              placeholder="Search hostname / IP"
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
                  <TableHead>Server Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Players</TableHead>
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
                  filtered.map((s) => <ServerRow key={s.server_id} server={s} />)
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {dataUpdatedAt > 0 && (
          <p className="text-center text-xs text-muted-foreground tabular-nums">
            Last refreshed <span className="inline-block w-20 text-left">{formatSince(dataUpdatedAt, now)}</span> ·
            auto-refreshes every 30s
          </p>
        )}

        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setShowAll(showAll ? null : true)} className="gap-1.5">
            {showAll ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {showAll ? "Hide all Steam servers" : "Show all Steam servers"}
          </Button>
        </div>

        {showAll && (
          <div className="space-y-2">
            <div className="text-center">
              <h2 className="text-xl font-semibold tracking-tight">All Steam Game Servers</h2>
              <p className="mx-auto mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Every Deadlock server registered with the Steam master server, excluding the ones already listed above.
                {steamOnly.length > 0 && ` ${steamOnly.length} servers · ${steamTotalPlayers} players online.`}
              </p>
            </div>

            {isSteamError ? (
              <div className="py-8 text-center text-sm text-destructive">
                Failed to load Steam servers: {steamError?.message}
              </div>
            ) : (
              <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Region</TableHead>
                      <TableHead>Server Name</TableHead>
                      <TableHead>Map</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="text-right">Players</TableHead>
                      <TableHead className="w-28 text-right">Connect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isSteamPending ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10" />
                      </TableRow>
                    ) : steamOnly.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          No additional Steam servers found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      steamOnly.map((s) => <SteamServerRow key={`${s.steamid}-${s.addr}`} server={s} />)
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ServerRow({ server }: { server: GameServerInfo }) {
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 font-mono text-xs text-primary uppercase">
          {server.region}
        </Badge>
      </TableCell>
      <TableCell>{prettyGameMode(server.game_mode)}</TableCell>
      <TableCell className="whitespace-normal">
        {server.hostname && <div className="line-clamp-3 w-80 text-sm leading-snug">{server.hostname}</div>}
      </TableCell>
      <TableCell className="font-mono text-xs">{formatAddress(server.ip, server.port)}</TableCell>
      <TableCell className="text-right tabular-nums">{server.current_player_count}</TableCell>
      <TableCell className="text-right">
        <Button asChild size="sm" className="h-8 gap-1">
          <a href={connectUrl(server)} title={`Connect to ${server.hostname || formatAddress(server.ip, server.port)}`}>
            Connect
            <Plug className="size-3.5" />
          </a>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SteamServerRow({ server }: { server: SteamServer }) {
  const isDefaultMap = server.map === DEFAULT_MAP;
  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 font-mono text-xs text-primary uppercase">
          {steamRegionLabel(server.region)}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal">
        {server.name && <div className="line-clamp-3 w-80 text-sm leading-snug">{server.name}</div>}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{server.map || "—"}</TableCell>
      <TableCell className="font-mono text-xs">{formatSteamAddress(server.addr)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {server.players}
        {server.max_players > 0 && <span className="text-muted-foreground">/{server.max_players}</span>}
      </TableCell>
      <TableCell className="text-right">
        {isDefaultMap ? (
          <Button asChild size="sm" className="h-8 gap-1">
            <a href={`steam://connect/${server.addr}`} title={`Connect to ${server.name || server.addr}`}>
              Connect
              <Plug className="size-3.5" />
            </a>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="h-8 gap-1">
            <a
              href={DEADWORKS_URL}
              target="_blank"
              rel="noreferrer noopener"
              title="Custom map — requires the Deadworks client"
            >
              Deadworks
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        )}
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
