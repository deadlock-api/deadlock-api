import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Search, Terminal, X } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, lazy, useCallback, useMemo, useState } from "react";

import { CopyButton } from "~/components/copy-button";
import { LakeTableRow } from "~/components/data-dumps/TableRow";
import {
  type ColumnInfo,
  type LakeTable,
  type Manifest,
  type PlaygroundTable,
  SQL_PLAYGROUND_DEFAULT_QUERY,
  lakeTables,
} from "~/components/data-dumps/types";
import { UsageInstructions } from "~/components/data-dumps/UsageInstructions";
import { MANIFEST_URL, formatBytes, formatTimestamp } from "~/components/data-dumps/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { prewarmDuckDb } from "~/lib/duckdb-client";
import { seo } from "~/lib/seo";

const SqlPlayground = lazy(() =>
  import("~/components/data-dumps/SqlPlayground").then((m) => ({ default: m.SqlPlayground })),
);

export const Route = createFileRoute("/data-dumps")({
  component: DataDumps,
  head: () =>
    seo({
      title: "MCP & Data Lake | Deadlock API",
      description:
        "Query the hourly-updated public data lake through a read-only MCP server, DuckDB, or download the Parquet files for offline analysis and research.",
      path: "/data-dumps",
    }),
});

async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
  return res.json();
}

function DataDumps() {
  const [searchParam, setSearch] = useQueryState("q", parseAsString);
  const [sqlQueryParam, setSqlQueryParam] = useQueryState("sql", parseAsString);
  const [userOpened, setUserOpened] = useState(false);
  const playgroundOpen = userOpened || (sqlQueryParam !== null && sqlQueryParam.trim().length > 0);
  const setPlaygroundOpen = useCallback(
    (next: boolean) => {
      setUserOpened(next);
      if (!next) setSqlQueryParam(null);
    },
    [setSqlQueryParam],
  );
  const search = (searchParam ?? "").trim();
  const sqlQuery = sqlQueryParam ?? SQL_PLAYGROUND_DEFAULT_QUERY;
  const onSqlQueryChange = (q: string) => {
    setSqlQueryParam(q.length === 0 ? null : q);
  };

  const manifest = useQuery({
    queryKey: ["lake-manifest"],
    queryFn: fetchManifest,
    staleTime: 60_000,
  });

  const tables: LakeTable[] = useMemo(() => (manifest.data ? lakeTables(manifest.data) : []), [manifest.data]);

  const schemaByTable = useMemo(() => {
    const map = new Map<string, { columns: ColumnInfo[] }>();
    for (const t of tables) map.set(t.name, { columns: t.columns });
    return map;
  }, [tables]);

  const playgroundTables: PlaygroundTable[] = useMemo(
    () =>
      tables
        .filter((t) => t.status === "ready" && t.files.length > 0)
        .map((t) => ({ name: t.name, urls: t.files.map((f) => f.url) })),
    [tables],
  );

  const lowerSearch = search.toLowerCase();
  const matchedColumns = useCallback(
    (table: LakeTable): string[] =>
      lowerSearch ? table.columns.filter((c) => c.name.toLowerCase().includes(lowerSearch)).map((c) => c.name) : [],
    [lowerSearch],
  );
  const visibleTables = useMemo(
    () =>
      tables.filter((t) => !lowerSearch || t.name.toLowerCase().includes(lowerSearch) || matchedColumns(t).length > 0),
    [tables, lowerSearch, matchedColumns],
  );
  const totalBytes = useMemo(() => visibleTables.reduce((sum, t) => sum + t.totalBytes, 0), [visibleTables]);
  const totalFiles = useMemo(() => visibleTables.reduce((sum, t) => sum + t.files.length, 0), [visibleTables]);

  return (
    <div className="space-y-6">
      <section className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">MCP & Data Lake</h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
          The public tables of the Deadlock API database are exported every hour to a public data lake. Query it from
          your AI assistant via MCP, attach it in DuckDB, or download the Parquet files for offline analysis, research,
          or community projects. No credentials needed.
        </p>
      </section>

      <div className="mx-auto max-w-5xl space-y-3">
        <ManifestUrlBar onOpenPlayground={() => setPlaygroundOpen(true)} />
        <UsageInstructions />
      </div>

      {playgroundOpen && (
        <Suspense fallback={null}>
          <SqlPlayground
            open={playgroundOpen}
            onOpenChange={setPlaygroundOpen}
            tables={playgroundTables}
            schemaByTable={schemaByTable}
            query={sqlQuery}
            onQueryChange={onSqlQueryChange}
          />
        </Suspense>
      )}

      <div className="mx-auto max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-1 text-sm text-muted-foreground">
            {manifest.data ? (
              <>
                Manifest v{manifest.data.version} · updated {formatTimestamp(manifest.data.generated_at)}
                {manifest.isFetching && <Loader2 className="ml-2 inline size-3.5 animate-spin" />}
              </>
            ) : (
              "Tables"
            )}
          </div>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <SearchInput value={search} onChange={(v) => setSearch(v || null)} />
          </div>
        </div>

        {manifest.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
            Failed to load the data lake manifest:{" "}
            {manifest.error instanceof Error ? manifest.error.message : "Unknown error"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="hidden w-16 text-right sm:table-cell">Files</TableHead>
                  <TableHead className="hidden w-20 text-right md:table-cell">Rows</TableHead>
                  <TableHead className="hidden w-24 text-right sm:table-cell">Size</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">Data up to</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manifest.isPending ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : visibleTables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {search ? "No table or column matches the search." : "No tables published yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleTables.map((t) => <LakeTableRow key={t.name} table={t} matchedColumns={matchedColumns(t)} />)
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {manifest.data && visibleTables.length > 0 && (
          <div className="flex justify-end px-1 text-xs text-muted-foreground tabular-nums">
            {visibleTables.length} tables · {totalFiles} files · {formatBytes(totalBytes)} total
          </div>
        )}
      </div>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1 sm:flex-none">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search tables & columns…"
        aria-label="Search tables and columns"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full pl-8 text-xs sm:w-56"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function ManifestUrlBar({ onOpenPlayground }: { onOpenPlayground: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span className="shrink-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Manifest</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{MANIFEST_URL}</code>
      <CopyButton iconOnly text={MANIFEST_URL} title="Copy manifest URL" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenPlayground}
        onMouseEnter={() => {
          void prewarmDuckDb();
        }}
        onFocus={() => {
          void prewarmDuckDb();
        }}
        className="h-7 shrink-0 gap-1.5 text-xs"
        title="Open SQL Playground"
      >
        <Terminal className="size-3.5" />
        SQL Playground
      </Button>
    </div>
  );
}
