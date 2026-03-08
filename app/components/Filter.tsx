import { LeaderboardRegionEnum } from "deadlock_api_client";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import NumberSelector from "~/components/NumberSelector";
import { PatchOrDatePicker } from "~/components/PatchOrDatePicker";
import { type GameMode, GameModeSelector } from "~/components/selectors/GameModeSelector";
import HeroSelector from "~/components/selectors/HeroSelector";
import MatchTimeRangeSelector from "~/components/selectors/MatchTimeRangeSelector";
import RankRange from "~/components/selectors/RankRangeSelector";
import { StringSelector } from "~/components/selectors/StringSelector";
import type { Dayjs } from "~/dayjs";
import { MAX_GAME_DURATION_S, PATCHES } from "~/lib/constants";
import { cn } from "~/lib/utils";

function Root({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex flex-wrap items-center gap-2 justify-center mx-auto w-fit",
        "rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-3.5",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_2px_8px_rgba(0,0,0,0.25)]",
        className,
      )}
    >
      {children}
    </div>
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
  onDateChange: (startDate?: Dayjs, endDate?: Dayjs, prevStartDate?: Dayjs, prevEndDate?: Dayjs) => void;
  defaultTab?: "patch" | "custom";
}) {
  return (
    <PatchOrDatePicker
      patchDates={PATCHES}
      value={{ startDate, endDate }}
      onValueChange={({ startDate, endDate, prevStartDate, prevEndDate }) =>
        onDateChange(startDate, endDate, prevStartDate, prevEndDate)
      }
      defaultTab={defaultTab}
    />
  );
}

const regionOptions = Object.entries(LeaderboardRegionEnum).map(([key, val]) => ({
  label: key,
  value: val,
}));

function Region({ value, onChange }: { value: string; onChange: (region: string) => void }) {
  return <StringSelector label="Region" options={regionOptions} selected={value} onSelect={onChange} />;
}

function TimeRange({
  minTime,
  maxTime,
  onTimeChange,
  label = "Time",
  title = "Match Time Window",
  description = "Filter by when events occurred in the match.",
  max,
  presets,
}: {
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
  label?: string;
  title?: string;
  description?: string;
  max?: number;
  presets?: { label: string; start: number; end: number }[] | null;
}) {
  return (
    <MatchTimeRangeSelector
      minTime={minTime}
      maxTime={maxTime}
      onTimeChange={onTimeChange}
      label={label}
      title={title}
      description={description}
      max={max}
      presets={presets}
    />
  );
}

function MatchDuration({
  minTime,
  maxTime,
  onTimeChange,
}: {
  minTime?: number;
  maxTime?: number;
  onTimeChange: (min: number | undefined, max: number | undefined) => void;
}) {
  return (
    <MatchTimeRangeSelector
      minTime={minTime}
      maxTime={maxTime}
      onTimeChange={onTimeChange}
      label="Duration"
      title="Match Duration"
      description="Filter matches by their total duration."
      max={MAX_GAME_DURATION_S}
      presets={[
        { label: "Short (<20m)", start: 0, end: 20 * 60 },
        { label: "Mid (20-40m)", start: 20 * 60, end: 40 * 60 },
        { label: "Long (40m+)", start: 40 * 60, end: MAX_GAME_DURATION_S },
      ]}
    />
  );
}

const TEAMS = [
  { value: 0, label: "The Hidden King" },
  { value: 1, label: "The Archmother" },
] as const;

function Team({ value, onChange }: { value: number; onChange: (team: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-full border border-white/[0.08] bg-secondary p-0.5">
      {TEAMS.map((team) => (
        <button
          key={team.value}
          type="button"
          onClick={() => onChange(team.value)}
          className={`px-3 py-1 text-sm rounded-full transition-all cursor-pointer ${
            value === team.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {team.label}
        </button>
      ))}
    </div>
  );
}

function SortDirection({ value, onChange }: { value: "desc" | "asc"; onChange: (dir: "desc" | "asc") => void }) {
  const isDesc = value === "desc";
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-full border cursor-pointer transition-all bg-secondary border-white/[0.08] text-muted-foreground hover:bg-accent hover:text-foreground hover:border-white/[0.14]"
      onClick={() => onChange(isDesc ? "asc" : "desc")}
    >
      {isDesc ? <ArrowDownNarrowWide className="size-3.5" /> : <ArrowUpNarrowWide className="size-3.5" />}
      <span>{isDesc ? "DESC" : "ASC"}</span>
    </button>
  );
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
  TimeRange,
  MatchDuration,
  SortDirection,
  Team,
};
