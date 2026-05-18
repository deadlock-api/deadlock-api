import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import { initDuckDb, readParquetExpr, runDuckDbQuery } from "~/lib/duckdb-client";
import { cn } from "~/lib/utils";

import { deriveCsvFilename, downloadCsv, formatCell, toCsv } from "./utils";

export function ParquetPreview({ urls }: { urls: string | string[] }) {
  const list = Array.isArray(urls) ? urls : [urls];
  const cacheKey = list.join("|");
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["parquet-preview", cacheKey],
    queryFn: async () => {
      const handle = await initDuckDb();
      return runDuckDbQuery(handle, `SELECT * FROM ${readParquetExpr(list)} LIMIT 10`);
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading sample rows…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap text-destructive">
        {error instanceof Error ? error.message : "Failed to load preview"}
      </div>
    );
  }

  const handleCsv = () => {
    downloadCsv(deriveCsvFilename(list), toCsv(data.columns, data.rows));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        <span>
          Sample · first {data.rows.length} row{data.rows.length === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-2 font-normal tracking-normal normal-case">
          <span>{data.columns.length} columns · scroll →</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCsv}
            disabled={data.rows.length === 0}
            className="h-6 gap-1 px-2 text-[10px]"
            title="Download visible rows as CSV"
          >
            <Download className="size-3" />
            CSV
          </Button>
        </span>
      </div>
      <div className="max-w-full overflow-x-auto rounded-lg border border-white/[0.08] bg-black/50 shadow-inner">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr>
              {data.columns.map((c) => (
                <th
                  key={c.name}
                  title={`${c.name}: ${c.type}`}
                  className="cursor-help border-b border-white/[0.06] px-3 py-2 text-left font-mono text-[11px] font-medium whitespace-nowrap text-muted-foreground"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              // eslint-disable-next-line react/no-array-index-key -- stable order
              <tr key={i} className="odd:bg-white/[0.015] hover:bg-primary/[0.04]">
                {row.map((cell, j) => {
                  const text = formatCell(cell);
                  const isNull = cell === null || cell === undefined;
                  return (
                    <td
                      // eslint-disable-next-line react/no-array-index-key -- stable order
                      key={j}
                      className={cn(
                        "max-w-[280px] truncate border-b border-white/[0.04] px-3 py-1.5 font-mono",
                        j > 0 && "border-l border-white/[0.04]",
                        isNull && "text-muted-foreground/60 italic",
                        typeof cell === "number" && "text-right tabular-nums",
                      )}
                      title={text}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
