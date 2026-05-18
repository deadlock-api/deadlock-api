import { sql } from "@codemirror/lang-sql";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Download, Loader2, Play } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import {
  type DuckDbHandle,
  type QueryColumn,
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
        <Loader2 className="size-3 animate-spin" />
        Loading DuckDB-Wasm…
      </span>
    );
  }
  if (state === "error") return <span className="text-destructive">DuckDB failed to load: {error}</span>;
  if (state === "ready") {
    return (
      <span className="text-emerald-400">
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
    if (!handle) return;
    setRunning(true);
    setQueryError(null);
    setStatus(null);
    const start = performance.now();
    try {
      const knownRefs = parseTableRefs(query).filter((r) => tableMap.has(r));
      const created = await ensureViews(handle, tableMap, knownRefs);
      if (created.length > 0) {
        setStatus(`Registered ${created.length} table${created.length === 1 ? "" : "s"}…`);
      }
      setStatus("Running query…");
      const { columns, rows: allRows } = await runDuckDbQuery(handle, query);
      const truncated = allRows.length > RESULT_ROW_LIMIT;
      const rows = truncated ? allRows.slice(0, RESULT_ROW_LIMIT) : allRows;
      setResult({ columns, rows, truncated });
      setDuration(performance.now() - start);
      setStatus(null);
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : "Query failed");
      setResult(null);
      setDuration(null);
      setStatus(null);
    } finally {
      setRunning(false);
    }
  }, [handle, query, tableMap]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[88vh] w-[95vw] max-w-[1400px] grid-rows-[auto_1fr] gap-3 p-4 sm:max-w-[1400px]"
        showCloseButton
      >
        <DialogHeader className="space-y-1 pr-8">
          <DialogTitle className="flex flex-wrap items-center gap-3">
            SQL Playground
            <span className="text-xs font-normal text-muted-foreground">
              {getInitMessage(initState, initError, tables.length)}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Run SQL against the parquet files directly in your browser via{" "}
            <a
              href="https://duckdb.org/docs/api/wasm/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              DuckDB-Wasm
            </a>
            . Press <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">⌘/Ctrl + Enter</kbd> to run.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-3 lg:grid-cols-2">
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            {tables.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Tables ({tables.length}) · click to insert
                </div>
                <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {tables.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => insertAtCursor(t.name)}
                      className="rounded-md border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                      title={`${t.urls.length} parquet file${t.urls.length === 1 ? "" : "s"}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              onKeyDownCapture={onEditorKeyDown}
              className="min-h-0 flex-1 overflow-hidden rounded-md border border-white/[0.08] bg-black/40 focus-within:border-primary/40"
            >
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
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button onClick={runQuery} disabled={initState !== "ready" || running} size="sm" className="gap-1.5">
                {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                {running ? "Running…" : "Run query"}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {status && (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" />
                    {status}
                  </span>
                )}
                {!status && duration != null && !queryError && (
                  <>
                    {result?.rows.length ?? 0} row{result?.rows.length === 1 ? "" : "s"}
                    {result?.truncated && ` (truncated to ${RESULT_ROW_LIMIT})`} · {Math.round(duration)} ms
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Results</div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-white/[0.06] bg-white/[0.02]">
              {queryError ? (
                <div className="p-3 font-mono text-xs whitespace-pre-wrap text-destructive">{queryError}</div>
              ) : result ? (
                <ResultTable result={result} />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
                  {RESULT_PLACEHOLDER[initState]}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function csvFilenameForQuery(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `playground-${ts}.csv`;
}

function ResultTable({ result }: { result: QueryResult }) {
  const handleCsv = () => {
    downloadCsv(csvFilenameForQuery(), toCsv(result.columns, result.rows));
  };
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-end border-b border-white/[0.06] bg-background/80 px-2 py-1.5 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCsv}
          disabled={result.rows.length === 0}
          className="h-7 gap-1.5 text-xs"
          title="Download result as CSV"
        >
          <Download className="size-3.5" />
          Download CSV
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {result.columns.map((c) => (
              <TableHead key={c.name} title={`${c.name}: ${c.type}`} className="cursor-help font-mono text-xs">
                {c.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={Math.max(1, result.columns.length)}
                className="py-6 text-center text-muted-foreground"
              >
                No rows
              </TableCell>
            </TableRow>
          ) : (
            result.rows.map((row, i) => (
              // eslint-disable-next-line react/no-array-index-key -- row order is stable for a single result set
              <TableRow key={i}>
                {row.map((cell, j) => (
                  // eslint-disable-next-line react/no-array-index-key -- column order is stable
                  <TableCell key={j} className="font-mono text-xs">
                    {formatCell(cell)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
