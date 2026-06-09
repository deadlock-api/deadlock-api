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

export interface Evidence {
  /** Player-facing origin of the number, e.g. "your match data". */
  source: string;
  t_start?: number | null;
  t_end?: number | null;
  /** Seconds into the match to seek the report's replay to on click. */
  seek_t?: number | null;
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
  evidence?: Evidence | null;
}

export interface KeyValueRow {
  label: string;
  value: string;
  tone?: Tone;
  emphasis?: boolean;
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

export interface MapView {
  /** Center of the initial view, in normalized map coords. */
  at: Point;
  /** Magnification on open: 1 = whole map, ~2.5 = zoomed onto a teamfight. */
  zoom?: number;
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
  evidence?: Evidence | null;
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

export interface ComparisonItem {
  item_id: number;
  /** Meta win rate 0..1 (omitted for the player's own build). */
  win_rate?: number | null;
  /** Actual or average purchase time, seconds into the match. */
  buy_time_s?: number | null;
  status?: "good" | "late" | "off_meta" | "missing" | null;
}

export interface BuildColumn {
  /** e.g. "Your build", "Peer meta", "High-skill", "Enemy laner". */
  label: string;
  hero_id?: number | null;
  tone?: Tone;
  items: ComparisonItem[];
}

export interface ItemComparisonBlock {
  type: "item_comparison";
  title?: string | null;
  subtitle?: string | null;
  columns: BuildColumn[];
}

export interface AbilityOrderRow {
  /** e.g. "Yours", "Peer meta", "High-skill". */
  label: string;
  /** Ability names in upgrade order. */
  order: string[];
  win_rate?: number | null;
  tone?: Tone;
  /** 1-based upgrade index where this order first leaves the winning line. */
  diverges_at?: number | null;
}

export interface AbilityOrderComparisonBlock {
  type: "ability_order_comparison";
  title?: string | null;
  /** Optional legend of the hero's ability names. */
  abilities?: string[];
  rows: AbilityOrderRow[];
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
  /** Optional initial camera — frames the moment (e.g. a teamfight) on open. */
  view?: MapView | null;
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
  /** Clip mode: scrubber spans [t_start, t_end] instead of the whole match. */
  t_start?: number | null;
  t_end?: number | null;
  /** The moment being shown; the clip opens paused here. */
  anchor_t?: number | null;
}

export interface DividerBlock {
  type: "divider";
  label?: string | null;
}

export interface SuggestedQuestion {
  /** A drill question phrased in the player's own voice. */
  text: string;
  /** lucide-react icon name. */
  icon?: string | null;
}

export interface SuggestedQuestionsBlock {
  type: "suggested_questions";
  title?: string | null;
  questions: SuggestedQuestion[];
}

export type Block =
  | HeaderBlock
  | SectionBlock
  | GridBlock
  | MarkdownBlock
  | CalloutBlock
  | StatCardsBlock
  | KeyValueBlock
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
  | ItemComparisonBlock
  | AbilityOrderComparisonBlock
  | MinimapBlock
  | MatchReplayBlock
  | SuggestedQuestionsBlock
  | DividerBlock;

export interface Report {
  summary: string;
  /** Internal recap for follow-up turns; never rendered. */
  analyst_notes?: string;
  blocks: Block[];
}
