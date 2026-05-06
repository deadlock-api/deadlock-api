import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronRight, Folder, Home, Loader2, Search, Terminal, X } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import type { MetaFunction } from "react-router";

import { CopyButton } from "~/components/copy-button";
import { ColumnMatchBadge } from "~/components/data-dumps/ColumnMatchBadge";
import { FileRow } from "~/components/data-dumps/FileRow";
import { ShardGroupRow } from "~/components/data-dumps/ShardGroupRow";
import {
  SQL_PLAYGROUND_DEFAULT_QUERY,
  type ColumnInfo,
  type PlaygroundTable,
  type S3File,
  type ShardGroup,
} from "~/components/data-dumps/types";
import {
  BUCKET_BASE,
  BUCKET_NAME,
  BUCKET_URL,
  ROOT_PREFIX,
  type FileExt,
  formatBytes,
  getExt,
  naturalCompare,
  parseShardName,
  tableNameFromKey,
} from "~/components/data-dumps/utils";
import { HighlightedCode, type HighlightLanguage } from "~/components/HighlightedCode";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { prewarmDuckDb } from "~/lib/duckdb-client";
import { createPageMeta } from "~/lib/meta";
import { cn } from "~/lib/utils";

const SqlPlayground = lazy(() =>
  import("~/components/data-dumps/SqlPlayground").then((m) => ({ default: m.SqlPlayground })),
);

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Database Dumps | Deadlock API",
    description:
      "Browse, query and download daily database snapshots in Parquet and SQL format for offline analysis or research.",
    path: "/data-dumps",
  });
};

interface S3Listing {
  files: S3File[];
  folders: string[];
  virtualGroups: ShardGroup[];
}

async function fetchListing(prefix: string): Promise<S3Listing> {
  const root = await listOneLevel(prefix);
  const subResults = await Promise.all(
    root.folders.map(async (folder) => ({ folder, sub: await listOneLevel(folder) })),
  );
  const virtualGroups: ShardGroup[] = [];
  const hidden = new Set<string>();
  for (const { folder, sub } of subResults) {
    if (sub.folders.length > 0) continue;
    const shards: S3File[] = [];
    let baseName: string | null = null;
    let allMatch = true;
    for (const f of sub.files) {
      const parsed = parseShardName(f.key.slice(folder.length));
      if (!parsed) {
        allMatch = false;
        break;
      }
      if (baseName === null) baseName = parsed.base;
      else if (parsed.base !== baseName) {
        allMatch = false;
        break;
      }
      shards.push(f);
    }
    if (allMatch && baseName && shards.length >= 2) {
      virtualGroups.push({
        base: baseName,
        shards: shards.sort((a, b) => naturalCompare(a.key, b.key)),
        totalSize: shards.reduce((sum, s) => sum + s.size, 0),
        lastModified: shards.reduce((latest, s) => (s.lastModified > latest ? s.lastModified : latest), ""),
      });
      hidden.add(folder);
    }
  }
  return {
    files: root.files,
    folders: root.folders.filter((f) => !hidden.has(f)),
    virtualGroups,
  };
}

async function listOneLevel(prefix: string): Promise<{ files: S3File[]; folders: string[] }> {
  const url = `${BUCKET_URL}/?list-type=2&prefix=${encodeURIComponent(prefix)}&delimiter=%2F`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`S3 list failed: ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const folders = Array.from(doc.querySelectorAll("CommonPrefixes > Prefix"))
    .map((el) => el.textContent ?? "")
    .filter(Boolean);
  const files: S3File[] = Array.from(doc.querySelectorAll("Contents")).map((el) => ({
    key: el.querySelector("Key")?.textContent ?? "",
    size: Number(el.querySelector("Size")?.textContent ?? "0"),
    lastModified: el.querySelector("LastModified")?.textContent ?? "",
  }));
  return { files, folders };
}

async function fetchAllKeys(): Promise<{ parquet: string[]; sql: string[] }> {
  const parquet: string[] = [];
  const sql: string[] = [];
  let token: string | undefined;
  do {
    const params = new URLSearchParams({
      "list-type": "2",
      prefix: ROOT_PREFIX,
    });
    if (token) params.set("continuation-token", token);
    const res = await fetch(`${BUCKET_URL}/?${params.toString()}`);
    if (!res.ok) throw new Error(`S3 list failed: ${res.status}`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, "application/xml");
    for (const el of Array.from(doc.querySelectorAll("Contents"))) {
      const key = el.querySelector("Key")?.textContent ?? "";
      if (key.endsWith(".parquet") && !key.includes(".parquet/")) {
        parquet.push(key);
      } else if (key.endsWith(".sql")) {
        sql.push(key);
      }
    }
    token = doc.querySelector("NextContinuationToken")?.textContent ?? undefined;
  } while (token);
  return { parquet, sql };
}

async function fetchSqlContent(key: string): Promise<string> {
  const res = await fetch(`${BUCKET_URL}/${key}`);
  if (!res.ok) throw new Error(`Failed to fetch ${key}: ${res.status}`);
  return res.text();
}

function extractColumns(createTable: string): ColumnInfo[] {
  const openIdx = createTable.indexOf("(");
  if (openIdx < 0) return [];
  let depth = 1;
  let i = openIdx + 1;
  while (i < createTable.length && depth > 0) {
    const ch = createTable[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    i++;
  }
  const body = createTable.slice(openIdx + 1, i - 1);

  const cols: ColumnInfo[] = [];
  let buf = "";
  let parenDepth = 0;
  let inString = false;
  for (const ch of body) {
    if (ch === "'") inString = !inString;
    if (!inString) {
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
    }
    if (ch === "," && parenDepth === 0 && !inString) {
      pushColumn(buf, cols);
      buf = "";
    } else {
      buf += ch;
    }
  }
  pushColumn(buf, cols);
  return cols;
}

function pushColumn(chunk: string, cols: ColumnInfo[]): void {
  const trimmed = chunk.trim();
  if (!trimmed.startsWith("`")) return;
  const closeBacktick = trimmed.indexOf("`", 1);
  if (closeBacktick < 0) return;
  const name = trimmed.slice(1, closeBacktick);
  let type = trimmed.slice(closeBacktick + 1).trim();
  type = type.replace(/\s+COMMENT\s+'[^']*'/g, "");
  type = type.replace(/\s+STATISTICS\s*\([^)]*\)/g, "");
  cols.push({ name, type: type.trim() });
}

function sanitizePath(raw: string | null): string {
  if (!raw) return ROOT_PREFIX;
  if (!raw.startsWith(ROOT_PREFIX)) return ROOT_PREFIX;
  return raw.endsWith("/") ? raw : `${raw}/`;
}

function groupShards(files: S3File[], parent: string): { groups: ShardGroup[]; standalone: S3File[] } {
  const buckets = new Map<string, S3File[]>();
  const others: S3File[] = [];
  for (const f of files) {
    const parsed = parseShardName(f.key.slice(parent.length));
    if (parsed) {
      const arr = buckets.get(parsed.base) ?? [];
      arr.push(f);
      buckets.set(parsed.base, arr);
    } else {
      others.push(f);
    }
  }
  const groups: ShardGroup[] = [];
  for (const [base, shards] of buckets) {
    if (shards.length >= 2) {
      groups.push({
        base,
        shards: shards.sort((a, b) => naturalCompare(a.key, b.key)),
        totalSize: shards.reduce((sum, s) => sum + s.size, 0),
        lastModified: shards.reduce((latest, s) => (s.lastModified > latest ? s.lastModified : latest), ""),
      });
    } else {
      others.push(...shards);
    }
  }
  return { groups, standalone: others };
}

type TypeFilter = "all" | "parquet" | "sql";

export default function DataDumps() {
  const [pathParam, setPath] = useQueryState("path", parseAsString.withDefault(ROOT_PREFIX));
  const [searchParam, setSearch] = useQueryState("q", parseAsString);
  const [typeParam, setType] = useQueryState("type", parseAsString.withDefault("all"));
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
  const path = sanitizePath(pathParam);
  const search = (searchParam ?? "").trim();
  const typeFilter: TypeFilter = typeParam === "parquet" || typeParam === "sql" ? typeParam : "all";

  const sqlQuery = sqlQueryParam ?? SQL_PLAYGROUND_DEFAULT_QUERY;
  const onSqlQueryChange = (q: string) => {
    setSqlQueryParam(q.length === 0 ? null : q);
  };

  const listing = useQuery({
    queryKey: ["s3-listing", path],
    queryFn: () => fetchListing(path),
    staleTime: 30_000,
  });

  const allKeys = useQuery({
    queryKey: ["s3-all-keys"],
    queryFn: fetchAllKeys,
    staleTime: 5 * 60_000,
    enabled: playgroundOpen,
  });

  const sqlKeys = useMemo(() => {
    const current = (listing.data?.files ?? []).filter((f) => f.key.endsWith(".sql")).map((f) => f.key);
    const all = allKeys.data?.sql ?? [];
    return [...new Set([...current, ...all])];
  }, [listing.data?.files, allKeys.data?.sql]);

  const sqlContents = useQueries({
    queries: sqlKeys.map((key) => ({
      queryKey: ["s3-sql", key],
      queryFn: () => fetchSqlContent(key),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });

  const sqlContentSignature = sqlContents.map((q) => q.dataUpdatedAt).join("|");
  const sqlContentByKey = useMemo(() => {
    const map = new Map<string, string>();
    sqlKeys.forEach((key, i) => {
      const content = sqlContents[i]?.data;
      if (content) map.set(key, content);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sqlContentSignature stably reflects sqlContents changes; depending on the array re-runs every render
  }, [sqlKeys, sqlContentSignature]);

  const schemaByTable = useMemo(() => {
    const map = new Map<string, { columns: ColumnInfo[]; sql: string; key: string }>();
    for (const [key, content] of sqlContentByKey) {
      map.set(tableNameFromKey(key), { columns: extractColumns(content), sql: content, key });
    }
    return map;
  }, [sqlContentByKey]);

  const playgroundTables: PlaygroundTable[] = useMemo(() => {
    if (!allKeys.data) return [];
    const grouped = new Map<string, string[]>();
    for (const key of allKeys.data.parquet) {
      const t = tableNameFromKey(key);
      const arr = grouped.get(t) ?? [];
      arr.push(`${BUCKET_URL}/${key}`);
      grouped.set(t, arr);
    }
    return [...grouped.entries()]
      .map(([name, urls]) => ({ name, urls: urls.sort(naturalCompare) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allKeys.data]);

  const breadcrumbs = useMemo(() => {
    const trimmed = path.replace(/\/$/, "");
    const parts = trimmed.split("/");
    return parts.map((label, i) => ({
      label,
      path: `${parts.slice(0, i + 1).join("/")}/`,
    }));
  }, [path]);

  const sortedFolders = useMemo(() => [...(listing.data?.folders ?? [])].sort(naturalCompare), [listing.data?.folders]);
  const allFiles = useMemo(
    () => [...(listing.data?.files ?? [])].filter((f) => f.key !== path).sort((a, b) => naturalCompare(a.key, b.key)),
    [listing.data?.files, path],
  );

  const { groups: localShardGroups, standalone: standaloneFiles } = useMemo(
    () => groupShards(allFiles, path),
    [allFiles, path],
  );

  const shardGroups = useMemo(
    () => [...localShardGroups, ...(listing.data?.virtualGroups ?? [])].sort((a, b) => naturalCompare(a.base, b.base)),
    [localShardGroups, listing.data?.virtualGroups],
  );

  const lowerSearch = search.toLowerCase();

  const filterColumnsHit = useCallback(
    (tableName: string): string[] => {
      if (!lowerSearch) return [];
      const schema = schemaByTable.get(tableName);
      if (!schema) return [];
      return schema.columns.filter((c) => c.name.toLowerCase().includes(lowerSearch)).map((c) => c.name);
    },
    [lowerSearch, schemaByTable],
  );

  const visibleFolders = useMemo(() => {
    if (typeFilter === "sql") return [];
    return sortedFolders.filter((folder) => {
      if (!lowerSearch) return true;
      const name = folder.slice(path.length).replace(/\/$/, "");
      if (name.toLowerCase().includes(lowerSearch)) return true;
      return filterColumnsHit(tableNameFromKey(folder)).length > 0;
    });
  }, [sortedFolders, typeFilter, lowerSearch, path, filterColumnsHit]);

  const visibleShardGroups = useMemo(() => {
    if (typeFilter === "sql") return [];
    return shardGroups.filter((g) => {
      if (!lowerSearch) return true;
      if (g.base.toLowerCase().includes(lowerSearch)) return true;
      return filterColumnsHit(g.base).length > 0;
    });
  }, [shardGroups, typeFilter, lowerSearch, filterColumnsHit]);

  const visibleFiles = useMemo(() => {
    return standaloneFiles.filter((f) => {
      const ext: FileExt = getExt(f.key);
      if (typeFilter !== "all" && ext !== typeFilter) return false;
      if (!lowerSearch) return true;
      const name = f.key.slice(path.length);
      if (name.toLowerCase().includes(lowerSearch)) return true;
      return filterColumnsHit(tableNameFromKey(f.key)).length > 0;
    });
  }, [standaloneFiles, typeFilter, lowerSearch, path, filterColumnsHit]);

  const totalSize = useMemo(
    () =>
      visibleFiles.reduce((sum, f) => sum + f.size, 0) + visibleShardGroups.reduce((sum, g) => sum + g.totalSize, 0),
    [visibleFiles, visibleShardGroups],
  );

  const goTo = (next: string) => {
    setPath(next === ROOT_PREFIX ? null : next);
  };

  const isEmpty =
    !listing.isPending && visibleFolders.length === 0 && visibleShardGroups.length === 0 && visibleFiles.length === 0;

  return (
    <div className="space-y-6">
      <section className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Database Dumps</h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Browse, query and download daily snapshots of the Deadlock API database. Files are provided as Parquet (data)
          and SQL (schema) for offline analysis, research, or community projects.
        </p>
      </section>

      <div className="mx-auto max-w-5xl space-y-3">
        <BucketUrlBar onOpenPlayground={() => setPlaygroundOpen(true)} />
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
          <Breadcrumbs crumbs={breadcrumbs} onNavigate={goTo} isLoading={listing.isFetching && !listing.isPending} />
          <div className="ml-auto flex items-center gap-2">
            <SearchInput value={search} onChange={(v) => setSearch(v || null)} />
            <TypeToggle value={typeFilter} onChange={(v) => setType(v === "all" ? null : v)} />
          </div>
        </div>

        {listing.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
            Failed to load listing: {listing.error instanceof Error ? listing.error.message : "Unknown error"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32 text-right">Size</TableHead>
                  <TableHead className="w-44">Last Modified</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listing.isPending ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : isEmpty ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      {search || typeFilter !== "all" ? "No matches for the current filter." : "This folder is empty."}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {visibleFolders.map((folder) => (
                      <FolderRow
                        key={folder}
                        folder={folder}
                        parent={path}
                        onOpen={goTo}
                        matchedColumns={filterColumnsHit(tableNameFromKey(folder))}
                      />
                    ))}
                    {visibleShardGroups.map((g) => (
                      <ShardGroupRow key={g.base} group={g} parent={path} matchedColumns={filterColumnsHit(g.base)} />
                    ))}
                    {visibleFiles.map((file) => (
                      <FileRow
                        key={file.key}
                        file={file}
                        parent={path}
                        sqlContent={file.key.endsWith(".sql") ? (sqlContentByKey.get(file.key) ?? null) : null}
                        matchedColumns={filterColumnsHit(tableNameFromKey(file.key))}
                      />
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!listing.isPending && !listing.isError && !isEmpty && (
          <div className="flex justify-end px-1 text-xs text-muted-foreground tabular-nums">
            {visibleFiles.length + visibleShardGroups.reduce((n, g) => n + g.shards.length, 0)} files
            {visibleShardGroups.length > 0 && ` (${visibleShardGroups.length} sharded)`}
            {visibleFolders.length > 0 &&
              ` · ${visibleFolders.length} folder${visibleFolders.length === 1 ? "" : "s"}`}{" "}
            · {formatBytes(totalSize)} total
          </div>
        )}
      </div>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search files & columns…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-56 pl-8 text-xs"
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

function TypeToggle({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  const options: { value: TypeFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "parquet", label: "Parquet" },
    { value: "sql", label: "SQL" },
  ];
  return (
    <div className="inline-flex h-8 items-center rounded-md border border-white/[0.08] bg-white/[0.02] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Breadcrumbs({
  crumbs,
  onNavigate,
  isLoading,
}: {
  crumbs: { label: string; path: string }[];
  onNavigate: (path: string) => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-1 px-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate(ROOT_PREFIX)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
      >
        <Home className="size-3.5" />
        Root
      </button>
      {crumbs.slice(1).map((crumb) => (
        <span key={crumb.path} className="inline-flex items-center gap-1">
          <ChevronRight className="size-3.5 text-muted-foreground/50" />
          <button
            type="button"
            onClick={() => onNavigate(crumb.path)}
            className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            {crumb.label}
          </button>
        </span>
      ))}
      {isLoading && <Loader2 className="ml-2 size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

function FolderRow({
  folder,
  parent,
  onOpen,
  matchedColumns,
}: {
  folder: string;
  parent: string;
  onOpen: (path: string) => void;
  matchedColumns: string[];
}) {
  const name = folder.slice(parent.length).replace(/\/$/, "");
  return (
    <TableRow className="cursor-pointer hover:bg-white/[0.03]" onClick={() => onOpen(folder)}>
      <TableCell>
        <span className="inline-flex items-center gap-2 font-medium text-foreground">
          <Folder className="size-4 text-primary/80" />
          {name}/{matchedColumns.length > 0 && <ColumnMatchBadge cols={matchedColumns} />}
        </span>
      </TableCell>
      <TableCell className="text-right text-muted-foreground">—</TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(folder);
          }}
        >
          Open
        </Button>
      </TableCell>
    </TableRow>
  );
}

function BucketUrlBar({ onOpenPlayground }: { onOpenPlayground: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span className="shrink-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Bucket URL</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{BUCKET_URL}/</code>
      <CopyButton iconOnly text={`${BUCKET_URL}/`} title="Copy bucket URL" />
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

function CodeBlock({ code, language }: { code: string; language: HighlightLanguage }) {
  return (
    <div className="relative">
      <HighlightedCode code={code} language={language} />
      <CopyButton
        iconOnly
        text={code}
        title="Copy code"
        className="absolute top-1.5 right-1.5 bg-background/60 backdrop-blur"
      />
    </div>
  );
}

const AWS_CLI_EXAMPLE = `# The bucket is public and unsigned. Pass --no-sign-request to skip credentials.

# List the public folder
aws --no-sign-request --endpoint-url ${BUCKET_BASE} \\
  s3 ls s3://${BUCKET_NAME}/${ROOT_PREFIX}

# Download a single file
aws --no-sign-request --endpoint-url ${BUCKET_BASE} \\
  s3 cp s3://${BUCKET_NAME}/${ROOT_PREFIX}heroes.parquet ./heroes.parquet

# Mirror the whole public folder locally
aws --no-sign-request --endpoint-url ${BUCKET_BASE} \\
  s3 sync s3://${BUCKET_NAME}/${ROOT_PREFIX} ./public/`;

const MC_CLI_EXAMPLE = `# Add an alias for the bucket (no credentials required for the public dataset)
mc alias set deadlock ${BUCKET_BASE} "" ""

# List the public folder
mc ls deadlock/${BUCKET_NAME}/${ROOT_PREFIX}

# Recursive listing with sizes
mc ls --recursive deadlock/${BUCKET_NAME}/${ROOT_PREFIX}

# Download a single file
mc cp deadlock/${BUCKET_NAME}/${ROOT_PREFIX}heroes.parquet ./heroes.parquet

# Mirror the public folder locally
mc mirror deadlock/${BUCKET_NAME}/${ROOT_PREFIX} ./public/`;

const PYTHON_EXAMPLE = `# pip install pandas pyarrow
import pandas as pd

URL = "${BUCKET_URL}/${ROOT_PREFIX}heroes.parquet"

df = pd.read_parquet(URL)
print(df.head())`;

const JS_EXAMPLE = `// Node 18+ / Bun: load a parquet file into Apache Arrow / JS objects
//   pnpm add apache-arrow parquet-wasm
import { tableFromIPC } from "apache-arrow";
import { readParquet } from "parquet-wasm";

const URL = "${BUCKET_URL}/${ROOT_PREFIX}heroes.parquet";

const buf = new Uint8Array(await fetch(URL).then((r) => r.arrayBuffer()));
const table = tableFromIPC(readParquet(buf).intoIPCStream());
console.table(table.toArray().slice(0, 5));`;

const DUCKLAKE_EXAMPLE = `# pip install duckdb
# The snapshot is published as a DuckLake catalog backed by Parquet.
# Attaching the catalog gives you every table by name (no manual view setup).
import duckdb

DUCKLAKE_URL = "ducklake:${BUCKET_BASE}/${BUCKET_NAME}/${ROOT_PREFIX}db_snapshot.ducklake"

with duckdb.connect() as con:
    # The bucket is public, but DuckLake stores S3 paths internally,
    # so we redirect S3 reads to the public HTTPS endpoint.
    con.execute("""
        INSTALL ducklake; LOAD ducklake;
        INSTALL httpfs; LOAD httpfs;
        CREATE OR REPLACE SECRET deadlock_s3 (
            TYPE S3, KEY_ID '', SECRET '',
            ENDPOINT 's3-cache.deadlock-api.com', URL_STYLE 'path', USE_SSL true
        );
    """)
    con.execute(f"ATTACH '{DUCKLAKE_URL}' AS db (READ_ONLY)")
    con.execute("USE db.main")

    # Tables are now queryable directly:
    con.sql("SHOW TABLES").show()
    con.sql("SELECT count(*) FROM heroes").show()`;

const DUCKDB_EXAMPLE = `# pip install boto3 duckdb
# Alternative: list every parquet file in the bucket, group sharded files
# by table name, and create a DuckDB view for each table.
import re
from collections import defaultdict
from typing import Generator, Iterable

import boto3
import duckdb
from botocore import UNSIGNED
from botocore.config import Config

S3_URL = "${BUCKET_BASE}"
BUCKET_URL = f"{S3_URL}/${BUCKET_NAME}"


def list_parquet_files() -> Generator[str, None, None]:
    s3 = boto3.client(
        "s3", config=Config(signature_version=UNSIGNED), endpoint_url=S3_URL
    )
    paginator = s3.get_paginator("list_objects_v2")
    page_iterator = paginator.paginate(Bucket="${BUCKET_NAME}", Prefix="${ROOT_PREFIX}")
    for page in page_iterator:
        for obj in page["Contents"]:
            key = obj["Key"]
            if not key.endswith(".parquet"):
                continue
            yield f"{BUCKET_URL}/{key}"


def group_parquet_files_by_table(file_urls: Iterable[str]) -> dict[str, list[str]]:
    table_files = defaultdict(list)
    indexed_file_pattern = re.compile(r"(.+)_(\\d+)\\.parquet$")
    simple_file_pattern = re.compile(r"(.+)\\.parquet$")

    for url in file_urls:
        filename = url.split("/")[-1]
        if match_indexed := indexed_file_pattern.match(filename):
            table_name = match_indexed.group(1)
        else:
            match_simple = simple_file_pattern.match(filename)
            table_name = match_simple.group(1) if match_simple else filename
        table_files[table_name].append(url)
    return table_files


def get_tables() -> dict[str, list[str]]:
    return group_parquet_files_by_table(list_parquet_files())


def setup_views(con):
    tables = get_tables()
    for name, urls in tables.items():
        print(f"Creating view for {name}")
        con.execute(f"DROP VIEW IF EXISTS {name}")
        con.execute(f"CREATE VIEW {name} AS FROM read_parquet({urls})")


if __name__ == "__main__":
    with duckdb.connect() as con:
        setup_views(con)
        print("DuckDB is set up")
        # Put your queries here
        # e.g. con.sql("SELECT count(*) FROM heroes").show()`;

const STATIC_TABS = [
  { id: "ducklake", label: "DuckLake (recommended)", language: "python", code: DUCKLAKE_EXAMPLE },
  { id: "aws-cli", label: "AWS CLI", language: "bash", code: AWS_CLI_EXAMPLE },
  { id: "mc", label: "MinIO Client (mc)", language: "bash", code: MC_CLI_EXAMPLE },
  { id: "python", label: "Python", language: "python", code: PYTHON_EXAMPLE },
  { id: "js", label: "JavaScript", language: "javascript", code: JS_EXAMPLE },
  { id: "duckdb", label: "DuckDB (raw parquet)", language: "python", code: DUCKDB_EXAMPLE },
] as const;

function UsageInstructions() {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <Tabs defaultValue={STATIC_TABS[0].id}>
        <TabsList variant="line" className="flex-wrap">
          {STATIC_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {STATIC_TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-2">
            <CodeBlock code={t.code} language={t.language} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
