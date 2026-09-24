import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";

import { LakeTableRow } from "~/components/features/data-dumps/TableRow";
import {
  type ColumnInfo,
  type LakeTable,
  type Manifest,
  type PlaygroundTable,
  SQL_PLAYGROUND_DEFAULT_QUERY,
  lakeTables,
} from "~/components/features/data-dumps/types";
import { UsageInstructions } from "~/components/features/data-dumps/UsageInstructions";
import { MANIFEST_URL, formatBytes, formatTimestamp } from "~/components/features/data-dumps/utils";
import { CopyableUrl } from "~/components/patterns/code/CopyableCode";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { SearchInput } from "~/components/ui/search-input";
import { Spinner } from "~/components/ui/spinner";
import { Inline, Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { prewarmDuckDb } from "~/lib/duckdb-client";
import { pageTitle, seo } from "~/lib/seo";

const SqlPlayground = lazy(() =>
  import("~/components/features/data-dumps/SqlPlayground").then((m) => ({ default: m.SqlPlayground })),
);

export const Route = createFileRoute("/data-dumps")({
  component: DataDumps,
  head: () =>
    seo({
      title: pageTitle("MCP & Data Lake"),
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
  // A shared `?sql=` link opens the playground; after that the dialog owns its open state, so emptying the editor
  // (which empties the param) never closes it.
  const [playgroundOpen, setPlaygroundOpenState] = useState(() => sqlQueryParam !== null);
  // The playground unmounts as it closes, so its dialog cannot hand focus back to the button that opened it (Law 17).
  const openerRef = useRef<HTMLElement | null>(null);
  const setPlaygroundOpen = useCallback(
    (next: boolean) => {
      if (next && document.activeElement instanceof HTMLElement) openerRef.current = document.activeElement;
      setPlaygroundOpenState(next);
      if (!next) {
        void setSqlQueryParam(null);
        requestAnimationFrame(() => openerRef.current?.focus());
      }
    },
    [setSqlQueryParam],
  );
  const search = (searchParam ?? "").trim();
  // Not set shows the example query; an editor the user emptied stays empty ("").
  const sqlQuery = sqlQueryParam ?? SQL_PLAYGROUND_DEFAULT_QUERY;
  const onSqlQueryChange = (q: string) => {
    void setSqlQueryParam(q);
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
    <PageShell density="content" width="wide">
      <PageHeader
        size="lg"
        title="MCP & Data Lake"
        description="The public tables of the Deadlock API database are exported every hour to a public data lake. Query it from your AI assistant via MCP, attach it in DuckDB, or download the Parquet files for offline analysis, research, or community projects. No credentials needed."
      />

      <Stack gap={3}>
        <ManifestUrlBar onOpenPlayground={() => setPlaygroundOpen(true)} />
        <UsageInstructions />
      </Stack>

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

      <Stack gap={3}>
        <Inline>
          <Inline className="px-1 text-sm text-muted-foreground">
            {manifest.data ? (
              <>
                Manifest v{manifest.data.version} · updated {formatTimestamp(manifest.data.generated_at)}
                {manifest.isFetching && <Spinner size="sm" label="Refreshing manifest" />}
              </>
            ) : (
              "Tables"
            )}
          </Inline>
          <SearchInput
            size="sm"
            placeholder="Search tables & columns…"
            aria-label="Search tables and columns"
            // The raw text, not the trimmed `search`: trimming the field's own value would eat the space between words.
            value={searchParam ?? ""}
            onValueChange={(v) => setSearch(v || null)}
            className="w-full sm:ms-auto sm:w-64"
          />
        </Inline>

        {manifest.isError ? (
          <ErrorState
            title="Failed to load the data lake manifest"
            description={manifest.error instanceof Error ? manifest.error.message : "Unknown error"}
            retrying={manifest.isFetching}
            onRetry={() => void manifest.refetch()}
          />
        ) : (
          <Card size="flush">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="hidden w-16 text-end sm:table-cell">Files</TableHead>
                  <TableHead className="hidden w-20 text-end md:table-cell">Rows</TableHead>
                  <TableHead className="hidden w-24 text-end sm:table-cell">Size</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">Data up to</TableHead>
                  <TableHead className="w-20 text-end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manifest.isPending ? (
                  <TableRow data-plain>
                    <TableCell colSpan={6}>
                      <LoadingState size="sm" text="Loading tables…" label="tables" className="py-6" />
                    </TableCell>
                  </TableRow>
                ) : visibleTables.length === 0 ? (
                  <TableEmptyRow colSpan={6}>
                    {search ? "No table or column matches the search." : "No tables published yet."}
                  </TableEmptyRow>
                ) : (
                  visibleTables.map((t) => <LakeTableRow key={t.name} table={t} matchedColumns={matchedColumns(t)} />)
                )}
              </TableBody>
            </Table>
          </Card>
        )}

        {manifest.data && visibleTables.length > 0 && (
          <Text as="div" variant="caption" tone="muted" align="end" numeric="tabular" className="px-1">
            {visibleTables.length} tables · {totalFiles} files · {formatBytes(totalBytes)} total
          </Text>
        )}
      </Stack>
    </PageShell>
  );
}

function ManifestUrlBar({ onOpenPlayground }: { onOpenPlayground: () => void }) {
  return (
    <CopyableUrl label="Manifest" value={MANIFEST_URL} copyLabel="Copy manifest URL">
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
        className="shrink-0 text-xs"
        title="Open SQL Playground"
      >
        <Terminal className="size-3.5" />
        SQL Playground
      </Button>
    </CopyableUrl>
  );
}
