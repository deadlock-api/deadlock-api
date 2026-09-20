import { Box } from "~/components/ui/box";
import { Stat, StatGroup } from "~/components/ui/stat";

export interface StatTile {
  label: string;
  value: string;
  note?: string;
  noteClassName?: string;
}

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <Box paddingX={5}>
      <StatGroup variant="joined" size="sm" className="grid-cols-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Stat
            key={tile.label}
            label={tile.label}
            value={tile.value}
            sub={tile.note && <span className={tile.noteClassName}>{tile.note}</span>}
          />
        ))}
      </StatGroup>
    </Box>
  );
}
