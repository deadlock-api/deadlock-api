import { LeaderboardRegionEnum } from "deadlock_api_client";
import NumberSelector from "~/components/NumberSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import { type GameMode, GameModeSelector } from "~/components/selectors/GameModeSelector";
import HeroSelector from "~/components/selectors/HeroSelector";
import RankRange from "~/components/selectors/RankRangeSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import TimeWindowSelector from "~/components/selectors/TimeWindowSelector";
import { Card, CardContent } from "~/components/ui/card";
import type { Dayjs } from "~/dayjs";
import { PATCHES } from "~/lib/constants";
import { cn } from "~/lib/utils";

function Root({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("w-fit mx-auto", className)}>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4 justify-center">{children}</div>
      </CardContent>
    </Card>
  );
}

function Hero({
  value,
  onChange,
  allowNull,
  label,
}: {
  value: number | null;
  onChange: (heroId: number | null) => void;
  allowNull?: boolean;
  label?: string;
}) {
  return (
    <HeroSelector
      onHeroSelected={(x) => onChange(x ?? null)}
      selectedHero={value ?? undefined}
      allowSelectNull={allowNull}
      label={label}
    />
  );
}

function MinMatches({
  value,
  onChange,
  label = "Min Matches",
  step = 10,
  min,
  max,
}: {
  value: number;
  onChange: (val: number) => void;
  label?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return <NumberSelector value={value} onChange={onChange} label={label} step={step} min={min} max={max} />;
}

function GameModeWithRank({
  gameMode,
  onGameModeChange,
  minRank,
  maxRank,
  onRankChange,
}: {
  gameMode: GameMode;
  onGameModeChange: (mode: GameMode) => void;
  minRank: number;
  maxRank: number;
  onRankChange: (min: number, max: number) => void;
}) {
  return (
    <>
      <GameModeSelector value={gameMode} onChange={onGameModeChange} />
      {gameMode !== "street_brawl" && <RankRange minRank={minRank} maxRank={maxRank} onRankChange={onRankChange} />}
    </>
  );
}

function PatchOrDate({
  startDate,
  endDate,
  onDateChange,
  defaultTab,
}: {
  startDate?: Dayjs;
  endDate?: Dayjs;
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs) => void;
  defaultTab?: "patch" | "custom";
}) {
  return (
    <PatchOrDatePicker
      patchDates={PATCHES}
      value={{ startDate, endDate }}
      onValueChange={({ startDate, endDate }) => onDateChange(startDate, endDate)}
      defaultTab={defaultTab}
    />
  );
}

const regionOptions = Object.entries(LeaderboardRegionEnum).map(([key, val]) => ({
  label: key,
  value: val,
}));

function Region({ value, onChange }: { value: string; onChange: (region: string) => void }) {
  return (
    <StringSelector
      label="Region"
      placeholder="Select Region..."
      options={regionOptions}
      selected={value}
      onSelect={onChange}
    />
  );
}

function TimeWindow({
  minTime,
  maxTime,
  onTimeChange,
}: {
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
}) {
  return <TimeWindowSelector minTime={minTime} maxTime={maxTime} onTimeChange={onTimeChange} />;
}

export const Filter = {
  Root,
  Hero,
  Region,
  GameMode: GameModeSelector,
  RankRange: RankRange,
  GameModeWithRank,
  MinMatches,
  PatchOrDate,
  TimeWindow,
};
