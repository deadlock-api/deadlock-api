import { Globe, ScrollText } from "lucide-react";

import { HighlightedCode } from "~/components/patterns/code/HighlightedCode";
import { ExpandableRow, ExpandableRowToggle } from "~/components/patterns/data-table/ExpandableRow";
import { Badge } from "~/components/ui/badge";
import { CopyButton } from "~/components/ui/copy-button";
import { Heading, useNextHeadingLevel } from "~/components/ui/heading";
import { Stack } from "~/components/ui/stack";
import { TableCell } from "~/components/ui/table";
import { Text } from "~/components/ui/text";

import { ColumnMatchBadge } from "./ColumnMatchBadge";
import { SchemaPreview } from "./SchemaPreview";
import type { LakeView } from "./types";

/** A view of the catalog: its columns and the SELECT readers create it with. */
export function LakeViewRow({ view, matchedColumns }: { view: LakeView; matchedColumns: string[] }) {
  const headingLevel = useNextHeadingLevel();
  const live = view.source === "api";

  return (
    <ExpandableRow
      colSpan={3}
      details={
        <Stack gap={3}>
          {live && (
            <Text as="p" variant="caption" tone="muted">
              Reads the asset API on every query, so it always matches the current game version. Needs DuckDB's httpfs
              extension, which the SQL Playground and the DuckLake catalog load for you.
            </Text>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <Stack gap={1}>
              <Heading as={headingLevel} size="sm">
                Columns ({view.columns.length})
              </Heading>
              <SchemaPreview name={view.name} columns={view.columns} typeLabel="DuckDB type" />
            </Stack>
            <Stack gap={1}>
              <Heading as={headingLevel} size="sm">
                SQL
              </Heading>
              <HighlightedCode
                code={`CREATE VIEW ${view.name} AS\n${view.sql};`}
                language="sql"
                overflow="wrap"
                actions="copy"
                copyLabel={`Copy the definition of ${view.name}`}
              />
            </Stack>
          </div>
        </Stack>
      }
    >
      <TableCell className="whitespace-normal">
        <span className="inline-flex flex-wrap items-center gap-2 font-medium text-foreground">
          <span className="inline-flex min-w-0 items-center gap-2">
            <ExpandableRowToggle label={view.name} />
            {live ? (
              <Globe className="size-4 shrink-0 text-primary/80" />
            ) : (
              <ScrollText className="size-4 shrink-0 text-primary/80" />
            )}
            <span className="min-w-0 wrap-anywhere">{view.name}</span>
          </span>
          <Badge variant="muted" className="font-mono">
            {live ? "live API" : "view"}
          </Badge>
          {matchedColumns.length > 0 && <ColumnMatchBadge cols={matchedColumns} />}
        </span>
        {view.comment && (
          <Text as="div" variant="caption" tone="muted">
            {view.comment}
          </Text>
        )}
      </TableCell>
      <TableCell className="hidden text-end text-muted-foreground tabular-nums @xl:table-cell">
        {view.columns.length}
      </TableCell>
      <TableCell className="text-end">
        <CopyButton size="icon-sm" text={view.sql} aria-label={`Copy the SELECT of ${view.name}`} title="Copy SELECT" />
      </TableCell>
    </ExpandableRow>
  );
}
