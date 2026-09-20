import { Card } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

import type { ColumnInfo } from "./types";

export function SchemaPreview({ columns }: { columns: ColumnInfo[] }) {
  const hasComments = columns.some((c) => c.comment);
  return (
    // The height limit sits on Table's own scroll container: the header sticks to its nearest scrolling ancestor.
    <Card tone="inset" size="flush" radius="lg" className="*:data-[slot=table-container]:max-h-72">
      <Table density="dense">
        <TableHeader position="sticky">
          <TableRow>
            <TableHead className="text-muted-foreground">Column</TableHead>
            <TableHead className="text-muted-foreground">ClickHouse type</TableHead>
            {hasComments && <TableHead className="text-muted-foreground">Comment</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {columns.map((c) => (
            <TableRow key={c.name}>
              <TableCell className="font-mono text-foreground">{c.name}</TableCell>
              <TableCell className="font-mono break-all whitespace-normal text-muted-foreground">{c.type}</TableCell>
              {hasComments && (
                <TableCell className="whitespace-normal text-muted-foreground">{c.comment ?? ""}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
