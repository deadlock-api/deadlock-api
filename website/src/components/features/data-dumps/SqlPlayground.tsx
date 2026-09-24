import { sql } from "@codemirror/lang-sql";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Download, Play, Square } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ResultGrid } from "~/components/patterns/data-table/ResultGrid";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Kbd } from "~/components/ui/kbd";
import { Spinner } from "~/components/ui/spinner";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import {
  type DuckDbHandle,
  type QueryColumn,
  QueryCancelledError,
  ensureViews,
  initDuckDb,
  parseTableRefs,
  runDuckDbQuery,
} from "~/lib/duckdb-client";

import type { ColumnInfo, PlaygroundTable } from "./types";
import { downloadCsv, formatCell, toCsv } from "./utils";

const RESULT_ROW_LIMIT = 1000;

interface QueryResult {
  columns: QueryColumn[];
  rows: unknown[][];
  truncated: boolean;
}

type InitState = "idle" | "loading" | "ready" | "error";

const RESULT_PLACEHOLDER: Record<InitState, string> = {
  idle: "Loading…",
  loading: "Initializing DuckDB…",
  ready: "Run a query to see results.",
  error: "DuckDB failed to load.",
};

function getInitMessage(state: InitState, error: string | null, tableCount: number): ReactNode {
  if (state === "loading") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Spinner size="xs" />
        Loading DuckDB-Wasm…
      </span>
    );
  }
  if (state === "error") return <span className="text-destructive">DuckDB failed to load: {error}</span>;
  if (state === "ready") {
    return (
      <span className="text-positive">
        Ready · {tableCount} table{tableCount === 1 ? "" : "s"} available
      </span>
    );
  }
  if (tableCount === 0) return <span>Discovering tables…</span>;
  return null;
}

interface SqlPlaygroundProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: PlaygroundTable[];
  schemaByTable: Map<string, { columns: ColumnInfo[] }>;
  query: string;
  onQueryChange: (q: string) => void;
}

export function SqlPlayground({ open, onOpenChange, tables, schemaByTable, query, onQueryChange }: SqlPlaygroundProps) {
  const [initState, setInitState] = useState<InitState>("idle");
  const [initError, setInitError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [handle, setHandle] = useState<DuckDbHandle | null>(null);
  /** Why nothing ran or nothing is shown: "Query cancelled.", or an empty editor. */
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Closing the playground stops whatever it is still running.
  useEffect(() => () => abortRef.current?.abort(), []);

  const tableMap = useMemo(() => new Map(tables.map((t) => [t.name, t.urls])), [tables]);

  const cmSchema = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const t of tables) {
      const info = schemaByTable.get(t.name);
      out[t.name] = info ? info.columns.map((c) => c.name) : [];
    }
    return out;
  }, [tables, schemaByTable]);

  const initStartedRef = useRef(false);

  useEffect(() => {
    if (!open || initStartedRef.current) return;
    initStartedRef.current = true;
    setInitState("loading");
    (async () => {
      try {
        const h = await initDuckDb();
        setHandle(h);
        setInitState("ready");
      } catch (e) {
        setInitError(e instanceof Error ? e.message : "Failed to load DuckDB");
        setInitState("error");
      }
    })();
  }, [open]);

  const runQuery = useCallback(async () => {
    if (!handle || abortRef.current) return;
    if (query.trim().length === 0) {
      setResult(null);
      setQueryError(null);
      setDuration(null);
      setNotice("The editor is empty. Write a query to run.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setQueryError(null);
    setNotice(null);
    setStatus(null);
    const start = performance.now();
    try {
      const knownRefs = parseTableRefs(query).filter((r) => tableMap.has(r));
      const created = await ensureViews(handle, tableMap, knownRefs);
      if (created.length > 0) {
        setStatus(`Registered ${created.length} table${created.length === 1 ? "" : "s"}…`);
      }
      setStatus("Running query…");
      const { columns, rows, truncated } = await runDuckDbQuery(handle, query, {
        maxRows: RESULT_ROW_LIMIT,
        signal: controller.signal,
      });
      setResult({ columns, rows, truncated });
      setDuration(performance.now() - start);
      setStatus(null);
    } catch (e) {
      if (e instanceof QueryCancelledError) setNotice("Query cancelled.");
      else setQueryError(e instanceof Error ? e.message : "Query failed");
      setResult(null);
      setDuration(null);
      setStatus(null);
    }
    abortRef.current = null;
    setRunning(false);
  }, [handle, query, tableMap]);

  const cancelQuery = () => {
    abortRef.current?.abort();
  };

  const cmExtensions = useMemo(
    () => [sql({ schema: cmSchema, upperCaseKeywords: true }), EditorView.lineWrapping],
    [cmSchema],
  );

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void runQuery();
    }
  };

  const insertAtCursor = (snippet: string) => {
    const next = query.length === 0 || query.endsWith(" ") ? `${query}${snippet}` : `${query} ${snippet}`;
    onQueryChange(next);
  };

  const handleCsv = () => {
    if (result) downloadCsv(csvFilenameForQuery(), toCsv(result.columns, result.rows));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="h-7/8 grid-rows-[auto_1fr] gap-3 p-4" showCloseButton>
        <DialogHeader className="gap-1 pe-8">
          <DialogTitle className="flex flex-wrap items-center gap-3">
            SQL Playground
            <Text variant="caption" tone="muted">
              {getInitMessage(initState, initError, tables.length)}
            </Text>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Run SQL against the parquet files directly in your browser via{" "}
            <TextLink href="https://duckdb.org/docs/api/wasm/overview" target="_blank" rel="noopener noreferrer">
              DuckDB-Wasm
            </TextLink>
            . Press <Kbd>⌘/Ctrl + Enter</Kbd> to run.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-3 lg:grid-cols-2">
          <Stack gap={2} className="min-h-0">
            {tables.length > 0 && (
              <Stack gap={1}>
                <Text variant="eyebrow">Tables ({tables.length}) · click to insert</Text>
                <Inline gap={1} className="max-h-24 overflow-y-auto">
                  {tables.map((t) => (
                    <Button
                      key={t.name}
                      variant="subtle"
                      size="xs"
                      onClick={() => insertAtCursor(t.name)}
                      className="font-mono text-2xs"
                      title={`${t.urls.length} parquet file${t.urls.length === 1 ? "" : "s"}`}
                    >
                      {t.name}
                    </Button>
                  ))}
                </Inline>
              </Stack>
            )}

            <Card tone="inset" size="flush" radius="md" onKeyDownCapture={onEditorKeyDown} className="min-h-0 flex-1">
              <CodeMirror
                value={query}
                onChange={onQueryChange}
                extensions={cmExtensions}
                theme="dark"
                height="100%"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: false,
                  highlightActiveLine: true,
                  autocompletion: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  indentOnInput: true,
                  tabSize: 2,
                }}
                className="h-full text-xs"
              />
            </Card>

            <Inline justify="between" wrap="nowrap">
              {/* One button that turns into Cancel, so the focus stays on it while the query runs. */}
              {running ? (
                <Button variant="outline" onClick={cancelQuery} size="sm" className="gap-1.5">
                  <Square className="size-3.5" />
                  Cancel
                </Button>
              ) : (
                <Button onClick={runQuery} disabled={initState !== "ready"} size="sm" className="gap-1.5">
                  <Play className="size-3.5" />
                  Run query
                </Button>
              )}
              <output>
                <Text variant="caption" tone="muted" numeric="tabular">
                  {status && (
                    <span className="inline-flex items-center gap-1.5">
                      <Spinner size="xs" />
                      {status}
                    </span>
                  )}
                  {!status && duration != null && !queryError && (
                    <>
                      {result?.truncated
                        ? `First ${RESULT_ROW_LIMIT} rows`
                        : `${result?.rows.length ?? 0} row${result?.rows.length === 1 ? "" : "s"}`}{" "}
                      · {Math.round(duration)} ms
                    </>
                  )}
                  {!status && notice}
                </Text>
              </output>
            </Inline>
          </Stack>

          <Stack gap={2} className="min-h-0">
            <Inline justify="between" wrap="nowrap">
              <Inline gap={2}>
                <Text variant="eyebrow">Results</Text>
                {result?.truncated && !queryError && (
                  <Text variant="caption" tone="muted">
                    Showing the first {RESULT_ROW_LIMIT} rows · add a LIMIT or aggregate to see the rest
                  </Text>
                )}
              </Inline>
              {result && !queryError && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={handleCsv}
                  disabled={result.rows.length === 0}
                  title="Download result as CSV"
                >
                  <Download />
                  Download CSV
                </Button>
              )}
            </Inline>
            {result && !queryError ? (
              <ResultGrid
                columns={result.columns}
                rows={result.rows}
                density="compact"
                formatCell={(v, j) => formatCell(v, result.columns[j]?.cell)}
                nullLabel="—"
                label="Query result"
                className="min-h-0 flex-1 overflow-auto"
              />
            ) : (
              <Card tone="glass" size="flush" radius="md" className="min-h-0 flex-1 overflow-auto">
                {queryError ? (
                  <Text as="div" tone="destructive" className="p-3 font-mono text-xs whitespace-pre-wrap">
                    {queryError}
                  </Text>
                ) : (
                  <Text
                    as="div"
                    variant="caption"
                    tone="muted"
                    align="center"
                    className="flex h-full items-center justify-center p-6"
                  >
                    {notice ?? RESULT_PLACEHOLDER[initState]}
                  </Text>
                )}
              </Card>
            )}
          </Stack>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function csvFilenameForQuery(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `playground-${ts}.csv`;
}
