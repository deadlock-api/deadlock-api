// Mirror of packages/agent/src/deadlock_coach/agent/report.py.
// Keep in sync: the agent's `publish_report` tool input is generated from
// the Python models, and this is what the renderer consumes.

export type Tone = "neutral" | "info" | "success" | "warning" | "critical" | "tip" | "accent" | "team0" | "team1";

export type Direction = "up" | "down" | "flat";

export interface Point {
  x: number;
  y: number;
}

export interface MetaChip {
  label: string;
  value: string;
  icon?: string | null;
  tone?: Tone;
}

export interface StatCard {
  label: string;
  value: string;
  unit?: string | null;
  delta?: string | null;
  delta_direction?: Direction | null;
  delta_is_good?: boolean | null;
  sparkline?: number[] | null;
  icon?: string | null;
  tone?: Tone;
  hint?: string | null;
}

export interface KeyValueRow {
  label: string;
  value: string;
  tone?: Tone;
  emphasis?: boolean;
}

export interface ComparisonRow {
  label: string;
  you: number;
  baseline: number;
  unit?: string | null;
  better?: "higher" | "lower";
  percentile?: number | null;
}

export interface ChartSeries {
  key: string;
  label: string;
  color?: string | null;
  area?: boolean;
}

export interface ChartAnnotation {
  x: number | string;
  label: string;
  tone?: Tone;
}

export interface RadarAxis {
  key: string;
  label: string;
  max?: number;
}

export interface TimelineEvent {
  t: number;
  label: string;
  detail?: string | null;
  icon?: string | null;
  tone?: Tone;
  lane?: string | null;
}

export interface ScoreboardPlayer {
  hero_id?: number | null;
  hero_name?: string | null;
  name?: string | null;
  team?: 0 | 1;
  kills?: number;
  deaths?: number;
  assists?: number;
  net_worth?: number | null;
  last_hits?: number | null;
  is_focus?: boolean;
}

export interface BuildPhase {
  label: string;
  item_ids?: number[];
  item_names?: string[];
  note?: string | null;
}

export interface AbilityStep {
  ability: string;
  order: number[];
}

export interface MapMarker {
  at: Point;
  label?: string | null;
  /** Longer one-line description for the numbered event list beside the map. */
  detail?: string | null;
  kind?: "dot" | "pin" | "skull" | "kill" | "flag" | "star" | "ward" | "hero" | "objective";
  tone?: Tone;
  hero_id?: number | null;
  pulse?: boolean;
  /** Render desaturated/dimmed (e.g. a replay hero who is currently dead). */
  dimmed?: boolean;
  /** The focus player in a scene — gets a bright ring + "You" tag treatment. */
  focus?: boolean;
}

export interface MapPath {
  points: Point[];
  label?: string | null;
  tone?: Tone;
  dashed?: boolean;
  arrow?: boolean;
  width?: number;
}

export interface MapZone {
  shape?: "circle" | "rect" | "polygon";
  at?: Point | null;
  radius?: number | null;
  size?: Point | null;
  points?: Point[] | null;
  label?: string | null;
  tone?: Tone;
}

export interface HeatPoint {
  at: Point;
  weight?: number;
}

export interface ReplaySample {
  t: number;
  at: Point;
  /** Player was dead at this sample; render grayed at the team fountain. */
  dead?: boolean;
}

export interface ReplayTrack {
  label: string;
  hero_id?: number | null;
  team?: 0 | 1;
  is_focus?: boolean;
  samples: ReplaySample[];
}

export interface ReplayAnnotation {
  t: number;
  title: string;
  body: string;
  tone?: Tone;
}

export interface WinProbPoint {
  t: number;
  p: number;
}

export type ChartRow = Record<string, number | string>;

export interface HeaderBlock {
  type: "header";
  title: string;
  subtitle?: string | null;
  verdict?: string | null;
  verdict_tone?: Tone;
  hero_id?: number | null;
  chips?: MetaChip[];
}

export interface SectionBlock {
  type: "section";
  title?: string | null;
  subtitle?: string | null;
  icon?: string | null;
  children?: Block[];
}

export interface GridBlock {
  type: "grid";
  columns?: number;
  children?: Block[];
}

export interface MarkdownBlock {
  type: "markdown";
  text: string;
}

export interface CalloutBlock {
  type: "callout";
  tone?: Tone;
  title?: string | null;
  body: string;
  icon?: string | null;
}

export interface StatCardsBlock {
  type: "stat_cards";
  title?: string | null;
  columns?: number;
  cards: StatCard[];
}

export interface KeyValueBlock {
  type: "key_value";
  title?: string | null;
  rows: KeyValueRow[];
}

export interface ComparisonBlock {
  type: "comparison";
  title?: string | null;
  you_label?: string;
  baseline_label?: string;
  rows: ComparisonRow[];
}

export interface HeroCardBlock {
  type: "hero_card";
  hero_id?: number | null;
  hero_name?: string | null;
  role?: string | null;
  subtitle?: string | null;
  tone?: Tone;
  stats?: StatCard[];
}

export interface LineChartBlock {
  type: "line_chart";
  title?: string | null;
  subtitle?: string | null;
  x_key?: string;
  x_label?: string | null;
  x_is_time?: boolean;
  y_label?: string | null;
  series: ChartSeries[];
  data: ChartRow[];
  annotations?: ChartAnnotation[];
}

export interface AreaChartBlock {
  type: "area_chart";
  title?: string | null;
  subtitle?: string | null;
  x_key?: string;
  x_label?: string | null;
  x_is_time?: boolean;
  y_label?: string | null;
  stacked?: boolean;
  series: ChartSeries[];
  data: ChartRow[];
  annotations?: ChartAnnotation[];
}

export interface BarChartBlock {
  type: "bar_chart";
  title?: string | null;
  subtitle?: string | null;
  x_key?: string;
  x_label?: string | null;
  y_label?: string | null;
  stacked?: boolean;
  horizontal?: boolean;
  series: ChartSeries[];
  data: ChartRow[];
}

export interface RadarChartBlock {
  type: "radar_chart";
  title?: string | null;
  subtitle?: string | null;
  axes: RadarAxis[];
  series: ChartSeries[];
  data: ChartRow[];
}

export interface NetWorthPoint {
  t: number;
  you: number;
  enemy?: number | null;
}

export interface NetWorthChartBlock {
  type: "net_worth_chart";
  title?: string | null;
  subtitle?: string | null;
  you_label?: string;
  enemy_label?: string;
  points: NetWorthPoint[];
  annotations?: ChartAnnotation[];
}

export interface WinProbabilityChartBlock {
  type: "win_probability_chart";
  title?: string | null;
  subtitle?: string | null;
  points: WinProbPoint[];
  swings?: ChartAnnotation[];
}

export interface TimelineBlock {
  type: "timeline";
  title?: string | null;
  duration_s: number;
  events: TimelineEvent[];
}

export interface ScoreboardBlock {
  type: "scoreboard";
  title?: string | null;
  players: ScoreboardPlayer[];
}

export interface ItemBuildBlock {
  type: "item_build";
  title?: string | null;
  phases: BuildPhase[];
}

export interface AbilityOrderBlock {
  type: "ability_order";
  title?: string | null;
  abilities: AbilityStep[];
  max_level?: number;
}

export interface MinimapBlock {
  type: "minimap";
  title?: string | null;
  subtitle?: string | null;
  show_objectives?: boolean;
  show_ziplines?: boolean;
  markers?: MapMarker[];
  paths?: MapPath[];
  zones?: MapZone[];
  heat?: HeatPoint[];
  legend?: MetaChip[];
  /** Scene-board fields: a freeze-frame of one decisive moment. */
  critical?: boolean;
  scene_clock?: string | null;
  headline?: string | null;
  /** The "what to do instead" fix, shown as a tip block in the side panel. */
  correction?: string | null;
  /** Win-probability samples cropped to around this scene, for the sparkline. */
  win_prob?: WinProbPoint[];
  /** The scene's time in seconds, used to mark the momentum drop on the sparkline. */
  scene_t?: number | null;
}

export interface MatchReplayBlock {
  type: "match_replay";
  title?: string | null;
  subtitle?: string | null;
  duration_s: number;
  tracks?: ReplayTrack[];
  win_prob?: WinProbPoint[];
  annotations?: ReplayAnnotation[];
  objective_events?: TimelineEvent[];
}

export interface DividerBlock {
  type: "divider";
  label?: string | null;
}

export type Block =
  | HeaderBlock
  | SectionBlock
  | GridBlock
  | MarkdownBlock
  | CalloutBlock
  | StatCardsBlock
  | KeyValueBlock
  | ComparisonBlock
  | HeroCardBlock
  | LineChartBlock
  | AreaChartBlock
  | BarChartBlock
  | RadarChartBlock
  | NetWorthChartBlock
  | WinProbabilityChartBlock
  | TimelineBlock
  | ScoreboardBlock
  | ItemBuildBlock
  | AbilityOrderBlock
  | MinimapBlock
  | MatchReplayBlock
  | DividerBlock;

export interface Report {
  summary: string;
  blocks: Block[];
}
