import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { ResultGrid } from "~/components/patterns/data-table/ResultGrid";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { initDuckDb, readParquetExpr, runDuckDbQuery } from "~/lib/duckdb-client";

import { deriveCsvFilename, downloadCsv, formatCell, toCsv } from "./utils";

export function ParquetPreview({ urls }: { urls: string | string[] }) {
  const list = Array.isArray(urls) ? urls : [urls];
  const cacheKey = list.join("|");
  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
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
      <LoadingState
        size="sm"
        text="Loading sample rows…"
        label="sample rows"
        className="justify-start px-2 py-3 text-xs"
      />
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="Failed to load preview"
        description={
          error instanceof Error && <span className="font-mono text-xs whitespace-pre-wrap">{error.message}</span>
        }
        retrying={isFetching}
        onRetry={() => void refetch()}
      />
    );
  }

  const handleCsv = () => {
    downloadCsv(deriveCsvFilename(list), toCsv(data.columns, data.rows));
  };

  return (
    <Stack gap={2}>
      <Inline justify="between" wrap="nowrap">
        <Text variant="eyebrow">
          Sample · first {data.rows.length} row{data.rows.length === 1 ? "" : "s"}
        </Text>
        <Inline wrap="nowrap">
          <Text variant="meta" tone="muted">
            {data.columns.length} columns · scroll →
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleCsv}
            disabled={data.rows.length === 0}
            title="Download visible rows as CSV"
          >
            <Download />
            CSV
          </Button>
        </Inline>
      </Inline>
      <ResultGrid columns={data.columns} rows={data.rows} formatCell={formatCell} nullLabel="—" label="Sample rows" />
    </Stack>
  );
}
