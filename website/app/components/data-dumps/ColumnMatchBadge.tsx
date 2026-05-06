import { Search } from "lucide-react";

export function ColumnMatchBadge({ cols }: { cols: string[] }) {
  const shown = cols.slice(0, 3);
  const more = cols.length - shown.length;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
      title={cols.join(", ")}
    >
      <Search className="size-2.5" />
      {shown.join(", ")}
      {more > 0 && ` +${more}`}
    </span>
  );
}
