import { Download, Eye, File, Layers } from "lucide-react";
import { useState } from "react";

import { ExpandableRow, ExpandableRowToggle } from "~/components/patterns/data-table/ExpandableRow";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Code } from "~/components/ui/code";
import { CopyButton } from "~/components/ui/copy-button";
import { NoValue } from "~/components/ui/no-value";
import { Inline, Stack } from "~/components/ui/stack";
import { Table, TableBody, TableCell, TableRow } from "~/components/ui/table";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";

import { ColumnMatchBadge } from "./ColumnMatchBadge";
import { ParquetPreview } from "./ParquetPreview";
import { SchemaPreview } from "./SchemaPreview";
import type { FileKind, LakeTable } from "./types";
import { formatBytes, formatRows, formatTimestamp, formatUnix } from "./utils";

const KIND_LABEL: Record<FileKind, string> = {
  base: "base",
  delta: "hourly delta",
  residual: "daily residual",
  snapshot: "snapshot",
};

export function LakeTableRow({ table, matchedColumns }: { table: LakeTable; matchedColumns: string[] }) {
  const [preview, setPreview] = useState(false);
  const single = table.files.length === 1 ? table.files[0] : null;
  const building = table.status === "building";

  return (
    <ExpandableRow
      colSpan={6}
      details={
        <Stack gap={3}>
          {building && (
            <Text as="p" variant="caption" tone="warning">
              The initial load of this table is still running; files appear here once every partition is published.
            </Text>
          )}
          {table.policy === "incremental" && (
            <Text as="p" variant="caption" tone="muted">
              Union all files. A row can appear in a base file and again in a delta with a newer{" "}
              <Code size="sm">{table.watermark ?? "created_at"}</Code>; keep the newest per{" "}
              <Code size="sm">(match_id, account_id)</Code> when it matters, or query{" "}
              <Code size="sm">{table.name}_latest</Code> through the DuckLake catalog.
            </Text>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <Stack gap={1}>
              <Text variant="eyebrow">Columns ({table.columns.length})</Text>
              <SchemaPreview columns={table.columns} />
            </Stack>
            <Stack gap={1}>
              <Inline justify="between">
                <Text variant="eyebrow">Files ({table.files.length})</Text>
                {table.files.length > 0 && (
                  <Button type="button" variant="ghost" size="xs" onClick={() => setPreview(!preview)}>
                    <Eye />
                    {preview ? "Hide sample rows" : "Sample rows"}
                  </Button>
                )}
              </Inline>
              <Card tone="inset" size="flush" radius="lg" className="max-h-72 overflow-auto">
                {table.files.length === 0 ? (
                  <Text as="div" className="px-3 py-2 text-2xs" tone="muted">
                    No files published yet.
                  </Text>
                ) : (
                  <Table density="dense" className="text-2xs">
                    <TableBody>
                      {table.files.map((f) => (
                        <TableRow key={f.key}>
                          <TableCell className="px-3 whitespace-normal">
                            <TextLink
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              tone="inherit"
                              className="font-mono break-all text-foreground"
                              title={f.url}
                            >
                              {f.key.split("/").slice(-2).join("/")}
                            </TextLink>
                            <div className="text-3xs text-muted-foreground">
                              {KIND_LABEL[f.kind]}
                              {f.partition !== undefined && ` · partition ${f.partition}`}
                              {f.lo !== undefined &&
                                f.hi !== undefined &&
                                ` · ${formatUnix(f.lo)} → ${formatUnix(f.hi)}`}
                              {f.kind === "base" && f.hi !== undefined && ` · up to ${formatUnix(f.hi)}`}
                              {" · "}
                              {formatRows(f.rows)} rows · {formatBytes(f.bytes)} · built {formatTimestamp(f.built_at)}
                            </div>
                          </TableCell>
                          <TableCell className="text-end">
                            <FileActions url={f.url} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </Stack>
          </div>
          {preview && table.files.length > 0 && <ParquetPreview urls={table.files.map((f) => f.url)} />}
        </Stack>
      }
    >
      <TableCell>
        <span className="inline-flex flex-wrap items-center gap-2 font-medium text-foreground">
          <ExpandableRowToggle label={table.name} />
          {table.policy === "incremental" ? (
            <Layers className="size-4 text-primary/80" />
          ) : (
            <File className="size-4 text-primary/80" />
          )}
          {table.name}
          <Badge variant="muted" size="sm" className="font-mono">
            {table.policy === "incremental" ? "hourly incremental" : "hourly snapshot"}
          </Badge>
          {building && (
            <Badge variant="warning" size="sm" className="font-mono">
              building
            </Badge>
          )}
          {matchedColumns.length > 0 && <ColumnMatchBadge cols={matchedColumns} />}
        </span>
      </TableCell>
      <TableCell className="hidden text-end text-muted-foreground tabular-nums sm:table-cell">
        {building ? <NoValue /> : `${table.files.length}`}
      </TableCell>
      <TableCell className="hidden text-end text-muted-foreground tabular-nums md:table-cell">
        {building ? <NoValue /> : formatRows(table.totalRows)}
      </TableCell>
      <TableCell className="hidden text-end text-muted-foreground tabular-nums sm:table-cell">
        {building ? <NoValue /> : formatBytes(table.totalBytes)}
      </TableCell>
      <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
        {formatUnix(table.watermark_hi)}
      </TableCell>
      <TableCell className="text-end">{single && <FileActions url={single.url} />}</TableCell>
    </ExpandableRow>
  );
}

function FileActions({ url }: { url: string }) {
  return (
    <Inline gap={1} justify="end" wrap="nowrap">
      <CopyButton size="icon-sm" text={url} title="Copy URL" />
      <Button asChild variant="ghost" size="icon-sm">
        <a href={url} target="_blank" rel="noopener noreferrer" title="Download" aria-label="Download" download>
          <Download className="size-3.5" />
        </a>
      </Button>
    </Inline>
  );
}
