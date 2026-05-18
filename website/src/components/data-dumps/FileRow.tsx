import { ChevronRight, Download, File, FileCode } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

import { ColumnMatchBadge } from "./ColumnMatchBadge";
import { ParquetPreview } from "./ParquetPreview";
import { SchemaPreview } from "./SchemaPreview";
import type { S3File } from "./types";
import { BUCKET_URL, formatBytes, formatS3Timestamp } from "./utils";

export function FileRow({
  file,
  parent,
  sqlContent,
  matchedColumns,
}: {
  file: S3File;
  parent: string;
  sqlContent: string | null;
  matchedColumns: string[];
}) {
  const name = file.key.slice(parent.length);
  const url = `${BUCKET_URL}/${file.key}`;
  const isSql = file.key.endsWith(".sql");
  const isParquet = file.key.endsWith(".parquet");
  const expandable = Boolean((isSql && sqlContent) || isParquet);
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow className="hover:bg-white/[0.03]">
        <TableCell>
          <span className="inline-flex items-center gap-2">
            {expandable ? (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={open ? "Collapse" : "Expand schema"}
              >
                <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
              </button>
            ) : (
              <span className="size-3.5" />
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-mono text-xs text-foreground hover:text-primary"
              title={url}
            >
              {isSql ? (
                <FileCode className="size-4 text-muted-foreground" />
              ) : (
                <File className="size-4 text-muted-foreground" />
              )}
              {name}
            </a>
            {matchedColumns.length > 0 && <ColumnMatchBadge cols={matchedColumns} />}
          </span>
        </TableCell>
        <TableCell className="text-right text-muted-foreground tabular-nums">{formatBytes(file.size)}</TableCell>
        <TableCell className="text-muted-foreground tabular-nums">{formatS3Timestamp(file.lastModified)}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <CopyButton iconOnly text={url} title="Copy URL" />
            <Button asChild variant="ghost" size="icon" className="size-7">
              <a href={url} target="_blank" rel="noopener noreferrer" title="Download" download>
                <Download className="size-3.5" />
              </a>
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {open && expandable && (
        <TableRow className="bg-black/20">
          <TableCell colSpan={4} className="px-6 py-3">
            {isSql ? <SchemaPreview sqlContent={sqlContent ?? ""} /> : <ParquetPreview urls={url} />}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
