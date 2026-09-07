import { HeroImage } from "~/components/HeroImage";
import { HeroName } from "~/components/HeroName";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { day } from "~/dayjs";
import { type PersonalRecords, RECORD_KINDS, type RecordMatch } from "~/lib/tracker/compute";

function RecordTile({
  label,
  record,
  format,
}: {
  label: string;
  record: RecordMatch;
  format: (value: number) => string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <HeroImage heroId={record.entry.hero_id} className="size-8 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tracking-tight tabular-nums">{format(record.value)}</span>
          <span className="truncate text-xs text-muted-foreground">
            <HeroName heroId={record.entry.hero_id} /> · {day.unix(record.entry.start_time).format("MMM D")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PersonalBestsCard({ records }: { records: PersonalRecords }) {
  const tiles = RECORD_KINDS.flatMap((config) => {
    const record = records[config.key];
    return record ? [{ ...config, record }] : [];
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Personal bests</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {tiles.length === 0 && <div className="text-sm text-muted-foreground">No matches yet.</div>}
        {tiles.map((tile) => (
          <RecordTile key={tile.key} label={tile.label} record={tile.record} format={tile.format} />
        ))}
      </CardContent>
    </Card>
  );
}
