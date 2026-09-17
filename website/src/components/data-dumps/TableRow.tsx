import { ChevronRight, Download, Eye, File, Layers } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

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

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "primary" | "warn" }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap",
        tone === "primary" && "bg-primary/15 text-primary",
        tone === "warn" && "bg-amber-500/15 text-amber-300",
        tone === "muted" && "bg-white/[0.04] text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function LakeTableRow({ table, matchedColumns }: { table: LakeTable; matchedColumns: string[] }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const single = table.files.length === 1 ? table.files[0] : null;
  const building = table.status === "building";

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-white/[0.03]"
        onClick={(e) => {
          // Links and buttons inside the row act on their own; only the row itself toggles.
          if ((e.target as HTMLElement).closest("a, button")) return;
          setOpen(!open);
        }}
      >
        <TableCell>
          <span className="inline-flex flex-wrap items-center gap-2 font-medium text-foreground">
            <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
            {table.policy === "incremental" ? (
              <Layers className="size-4 text-primary/80" />
            ) : (
              <File className="size-4 text-primary/80" />
            )}
            {table.name}
            <Badge>{table.policy === "incremental" ? "hourly incremental" : "hourly snapshot"}</Badge>
            {building && <Badge tone="warn">building</Badge>}
            {matchedColumns.length > 0 && <ColumnMatchBadge cols={matchedColumns} />}
          </span>
        </TableCell>
        <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
          {building ? "—" : `${table.files.length}`}
        </TableCell>
        <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
          {building ? "—" : formatRows(table.totalRows)}
        </TableCell>
        <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
          {building ? "—" : formatBytes(table.totalBytes)}
        </TableCell>
        <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
          {formatUnix(table.watermark_hi)}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {single && (
              <>
                <CopyButton iconOnly text={single.url} title="Copy URL" />
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <a href={single.url} target="_blank" rel="noopener noreferrer" title="Download" download>
                    <Download className="size-3.5" />
                  </a>
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-black/20">
          <TableCell colSpan={6} className="space-y-3 px-6 py-3">
            {building && (
              <p className="text-xs text-amber-300">
                The initial load of this table is still running; files appear here once every partition is published.
              </p>
            )}
            {table.policy === "incremental" && (
              <p className="text-xs text-muted-foreground">
                Union all files. A row can appear in a base file and again in a delta with a newer{" "}
                <code className="font-mono">{table.watermark ?? "created_at"}</code>; keep the newest per{" "}
                <code className="font-mono">(match_id, account_id)</code> when it matters, or query{" "}
                <code className="font-mono">{table.name}_latest</code> through the DuckLake catalog.
              </p>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-1">
                <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Columns ({table.columns.length})
                </div>
                <SchemaPreview columns={table.columns} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Files ({table.files.length})
                  </div>
                  {table.files.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11px]"
                      onClick={() => setPreview(!preview)}
                    >
                      <Eye className="size-3" />
                      {preview ? "Hide sample rows" : "Sample rows"}
                    </Button>
                  )}
                </div>
                <div className="max-h-72 overflow-auto rounded-md border border-white/[0.06] bg-black/40">
                  {table.files.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-muted-foreground">No files published yet.</div>
                  ) : (
                    <table className="w-full text-[11px]">
                      <tbody>
                        {table.files.map((f) => (
                          <tr key={f.key} className="border-t border-white/[0.04] first:border-t-0">
                            <td className="px-3 py-1">
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono break-all text-foreground hover:text-primary"
                                title={f.url}
                              >
                                {f.key.split("/").slice(-2).join("/")}
                              </a>
                              <div className="text-[10px] text-muted-foreground">
                                {KIND_LABEL[f.kind]}
                                {f.partition !== undefined && ` · partition ${f.partition}`}
                                {f.lo !== undefined &&
                                  f.hi !== undefined &&
                                  ` · ${formatUnix(f.lo)} → ${formatUnix(f.hi)}`}
                                {f.kind === "base" && f.hi !== undefined && ` · up to ${formatUnix(f.hi)}`}
                                {" · "}
                                {formatRows(f.rows)} rows · {formatBytes(f.bytes)} · built {formatTimestamp(f.built_at)}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-right whitespace-nowrap">
                              <span className="inline-flex gap-1">
                                <CopyButton iconOnly text={f.url} title="Copy URL" />
                                <Button asChild variant="ghost" size="icon" className="size-7">
                                  <a href={f.url} target="_blank" rel="noopener noreferrer" title="Download" download>
                                    <Download className="size-3.5" />
                                  </a>
                                </Button>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
            {preview && table.files.length > 0 && <ParquetPreview urls={table.files.map((f) => f.url)} />}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
