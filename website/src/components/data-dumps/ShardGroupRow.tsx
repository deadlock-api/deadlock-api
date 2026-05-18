import { ChevronRight, Download, File, Layers } from "lucide-react";
import { useMemo, useState } from "react";

import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/lib/utils";

import { ColumnMatchBadge } from "./ColumnMatchBadge";
import { ParquetPreview } from "./ParquetPreview";
import type { S3File, ShardGroup } from "./types";
import { BUCKET_URL, formatBytes, formatS3Timestamp } from "./utils";

export function ShardGroupRow({
  group,
  parent,
  matchedColumns,
}: {
  group: ShardGroup;
  parent: string;
  matchedColumns: string[];
}) {
  const [open, setOpen] = useState(false);
  const [showShards, setShowShards] = useState(false);
  const urls = useMemo(() => group.shards.map((s) => `${BUCKET_URL}/${s.key}`), [group.shards]);
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-white/[0.03]" onClick={() => setOpen(!open)}>
        <TableCell>
          <span className="inline-flex items-center gap-2 font-medium text-foreground">
            <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
            <Layers className="size-4 text-primary/80" />
            {group.base}
            <span className="rounded-full bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {group.shards.length} shards
            </span>
            {matchedColumns.length > 0 && <ColumnMatchBadge cols={matchedColumns} />}
          </span>
        </TableCell>
        <TableCell className="text-right text-muted-foreground tabular-nums">{formatBytes(group.totalSize)}</TableCell>
        <TableCell className="text-muted-foreground tabular-nums">{formatS3Timestamp(group.lastModified)}</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground">{open ? "Hide" : "Preview"}</TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-black/20">
          <TableCell colSpan={4} className="px-6 py-3">
            <div className="space-y-3">
              <ParquetPreview urls={urls} />
              <button
                type="button"
                onClick={() => setShowShards(!showShards)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-3 transition-transform", showShards && "rotate-90")} />
                {showShards ? "Hide" : "Show"} {group.shards.length} shard files
              </button>
            </div>
          </TableCell>
        </TableRow>
      )}
      {open &&
        showShards &&
        group.shards.map((shard) => <ShardFileRow key={shard.key} shard={shard} parent={parent} />)}
    </>
  );
}

function ShardFileRow({ shard, parent }: { shard: S3File; parent: string }) {
  const [open, setOpen] = useState(false);
  const url = `${BUCKET_URL}/${shard.key}`;
  return (
    <>
      <TableRow className="bg-black/20 hover:bg-black/30">
        <TableCell>
          <span className="inline-flex items-center gap-2 pl-7">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={open ? "Collapse preview" : "Preview rows"}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-mono text-xs text-foreground/80 hover:text-primary"
              title={url}
            >
              <File className="size-3.5 text-muted-foreground" />
              {shard.key.slice(parent.length)}
            </a>
          </span>
        </TableCell>
        <TableCell className="text-right text-muted-foreground tabular-nums">{formatBytes(shard.size)}</TableCell>
        <TableCell className="text-muted-foreground tabular-nums">{formatS3Timestamp(shard.lastModified)}</TableCell>
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
      {open && (
        <TableRow className="bg-black/30">
          <TableCell colSpan={4} className="px-12 py-3">
            <ParquetPreview urls={url} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
