import { cn } from "~/lib/utils";

export interface StatTile {
  label: string;
  value: string;
  note?: string;
  noteClassName?: string;
}

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="border-r border-b border-border px-5 py-3.5 last:border-r-0 sm:border-b-0">
          <div className="text-[11px] tracking-[0.05em] text-muted-foreground uppercase">{tile.label}</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{tile.value}</div>
          {tile.note && <div className={cn("text-[11px]", tile.noteClassName)}>{tile.note}</div>}
        </div>
      ))}
    </div>
  );
}
