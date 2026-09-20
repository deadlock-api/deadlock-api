import { Search } from "lucide-react";

import { Badge } from "~/components/ui/badge";

export function ColumnMatchBadge({ cols }: { cols: string[] }) {
  const shown = cols.slice(0, 3);
  const more = cols.length - shown.length;
  return (
    <Badge variant="soft" size="sm" title={cols.join(", ")}>
      <Search />
      {shown.join(", ")}
      {more > 0 && ` +${more}`}
    </Badge>
  );
}
