import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import StatTrendChart from "~/components/patterns/charts/StatTrendChart";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { StringOption, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Code } from "~/components/ui/code";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Delta } from "~/components/ui/delta";
import { DragScroll } from "~/components/ui/drag-scroll";
import { Field } from "~/components/ui/field";
import { HeatCell } from "~/components/ui/heat-cell";
import { InlineStat } from "~/components/ui/inline-stat";
import { Input } from "~/components/ui/input";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { OptionRow } from "~/components/ui/option-row";
import { Pips } from "~/components/ui/pips";
import { ProgressBar, ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { DivergingBar } from "~/components/ui/rate-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Slider } from "~/components/ui/slider";
import { SortButton } from "~/components/ui/sort-button";
import { Stat, StatGroup } from "~/components/ui/stat";
import { StatusDot } from "~/components/ui/status-dot";
import { SwitchField } from "~/components/ui/switch-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import type { StatTrendPoint } from "~/lib/stat-format";

const LONG_LABEL =
  "Durchschnittliche Netzwertentwicklung pro Minute im Vergleich zum Lobby-Durchschnitt derselben Rangstufe";

const LONG_URL = "/v1/analytics/hero-stats?min_average_badge=91&max_average_badge=116&min_unix_timestamp=1735689600";

const TREND_DATA: StatTrendPoint[] = Array.from({ length: 14 }, (_, i) => ({
  date: Date.UTC(2025, 0, i + 1),
  value: 0.48 + Math.sin(i / 2.5) * 0.04,
  matches: 4200 - i * 90,
}));
const TREND_EMPTY: StatTrendPoint[] = TREND_DATA.map((point) => ({ ...point, value: null }));
const TREND_STAT = { label: "Win Rate", format: "percent" } as const;

function ButtonStates() {
  const [running, setRunning] = useState(false);
  return (
    <>
      <Variants label="loading">
        <Button loading={running} onClick={() => setRunning(true)}>
          Save build
        </Button>
        <Button variant="secondary" loading>
          Refreshing
        </Button>
        <Button variant="outline" size="sm" loading>
          Loading
        </Button>
        <Button size="icon-sm" loading loadingLabel="Refreshing matches" aria-label="Refresh matches" />
      </Variants>
      <Variants label="disabled vs loading">
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
        <Button variant="destructive" disabled>
          Delete
        </Button>
        <Button variant="destructive" loading>
          Deleting
        </Button>
      </Variants>
      <Variants label="hover and pressed (hold the pointer: the button sinks by a pixel)">
        <Button>Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button aria-disabled>Unavailable</Button>
      </Variants>
      <Variants label="overflowing label" className="items-start">
        <Button className="w-56 min-w-0">
          <span className="truncate">{LONG_LABEL}</span>
        </Button>
      </Variants>
    </>
  );
}

function ControlStates() {
  return (
    <>
      <Variants label="input" className="items-start">
        <Input aria-label="Default" defaultValue="Infernus" className="w-44" />
        <Input aria-label="Placeholder" placeholder="Search heroes…" className="w-44" />
        <Input aria-label="Read-only" readOnly value="76561198000000000" className="w-52" />
        <Input aria-label="Disabled" disabled value="Locked" className="w-32" />
        <Input aria-label="Invalid" aria-invalid defaultValue="not-an-id" className="w-36" />
        <Input aria-label="Overflowing" defaultValue={LONG_LABEL} className="w-44" />
      </Variants>
      <Variants label="textarea" className="items-start">
        <Textarea aria-label="Default" placeholder="What went wrong?" className="w-56" />
        <Textarea aria-label="Read-only" readOnly value={LONG_LABEL} className="w-56" />
        <Textarea aria-label="Disabled" disabled value="Locked" className="w-40" />
      </Variants>
      <Variants label="select">
        <Select defaultValue="kills">
          <SelectTrigger size="sm" aria-label="Sort by" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kills">Kills</SelectItem>
            <SelectItem value="deaths">Deaths</SelectItem>
          </SelectContent>
        </Select>
        <Select disabled defaultValue="kills">
          <SelectTrigger size="sm" aria-label="Sort by, disabled" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kills">Kills</SelectItem>
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger size="sm" aria-invalid aria-label="Sort by, invalid" className="w-40">
            <SelectValue placeholder="Pick a column" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kills">Kills</SelectItem>
          </SelectContent>
        </Select>
      </Variants>
      <Variants label="option row" className="w-64 flex-col items-stretch">
        <OptionRow selected>Selected</OptionRow>
        <OptionRow active>Keyboard cursor</OptionRow>
        <OptionRow disabled>Disabled</OptionRow>
        <OptionRow>{LONG_LABEL}</OptionRow>
      </Variants>
    </>
  );
}

function FieldStates() {
  return (
    <>
      <Variants label="help, error, counter" className="items-start">
        <Field label="Account ID" htmlFor="round4-help" description="Found in your Steam profile URL." className="w-56">
          <Input id="round4-help" defaultValue="76561198" />
        </Field>
        <Field
          label="Account ID"
          htmlFor="round4-error"
          error="That is not a Steam ID."
          description="Replaced by the error."
          className="w-56"
        >
          <Input id="round4-error" defaultValue="abc" />
        </Field>
        <Field label="Note" htmlFor="round4-counter" counter="18 / 280" className="w-56">
          <Input id="round4-counter" defaultValue="Good first ten minutes" />
        </Field>
      </Variants>
      <Variants label="disabled, read-only, long label" className="items-start">
        <Field label="Region" htmlFor="round4-disabled" className="w-48">
          <Input id="round4-disabled" disabled value="Europe" />
        </Field>
        <Field label="Match ID" htmlFor="round4-readonly" className="w-48">
          <Input id="round4-readonly" readOnly value="38291043" />
        </Field>
        <Field label={LONG_LABEL} htmlFor="round4-long" orientation="horizontal" className="w-72">
          <Input id="round4-long" defaultValue="0.42" />
        </Field>
      </Variants>
      <Variants label="hidden label, long error" className="items-start">
        <Field label="Search heroes" htmlFor="round4-hidden" labelDisplay="hidden" className="w-56">
          <Input id="round4-hidden" placeholder="Named for screen readers only" />
        </Field>
        <Field label="Account ID" htmlFor="round4-long-error" error={LONG_LABEL} className="w-56">
          <Input id="round4-long-error" defaultValue="abc" />
        </Field>
      </Variants>
    </>
  );
}

function SearchInputStates() {
  return (
    <>
      <Variants label="empty, typed" className="items-start">
        <SearchInput aria-label="Search heroes" placeholder="Search heroes…" className="w-52" />
        <SearchInput aria-label="Search heroes, typed" defaultValue="Infernus" className="w-52" />
      </Variants>
      <Variants label="ghost, disabled, read-only, invalid" className="items-start">
        <SearchInput aria-label="Filter items" variant="ghost" placeholder="Filter items…" className="w-52" />
        <SearchInput aria-label="Search, disabled" disabled defaultValue="Locked" className="w-52" />
        <SearchInput aria-label="Search, read-only" readOnly defaultValue="Infernus" className="w-52" />
        <SearchInput aria-label="Search, invalid" aria-invalid defaultValue="%%%" className="w-52" />
      </Variants>
      <Variants label="overflowing term" className="items-start">
        <SearchInput aria-label="Search, overflowing" defaultValue={LONG_LABEL} className="w-52" />
      </Variants>
    </>
  );
}

function SliderStates() {
  return (
    <>
      <Variants label="default, focus-visible (tab into it), disabled" className="w-72 flex-col items-stretch gap-5">
        <Slider aria-label="Match length" defaultValue={[40]} />
        <Slider aria-label="Match length, focus the thumb with the keyboard" defaultValue={[60]} />
        <Slider aria-label="Match length, unavailable" defaultValue={[25]} disabled />
      </Variants>
      <Variants label="range, each thumb named" className="w-72 flex-col items-stretch">
        <Slider thumbLabels={["Minimum rank", "Maximum rank"]} defaultValue={[20, 80]} />
      </Variants>
      <Variants
        label="getValueText: announced as the screen shows it (35 minutes, not 35)"
        className="w-72 flex-col items-stretch"
      >
        <Slider
          thumbLabels={["Shortest match", "Longest match"]}
          defaultValue={[15, 35]}
          min={0}
          max={60}
          getValueText={(minutes) => `${minutes} minutes`}
        />
      </Variants>
    </>
  );
}

function SortButtonStates() {
  return (
    <>
      <Variants label="unsorted, ascending, descending">
        <SortButton active={false} sortDir="asc">
          Matches
        </SortButton>
        <SortButton active sortDir="asc">
          Matches
        </SortButton>
        <SortButton active sortDir="desc">
          Matches
        </SortButton>
      </Variants>
      <Variants label="dense table, and a column that cannot be sorted">
        <SortButton active={false} sortDir="asc" size="sm">
          Win rate
        </SortButton>
        <SortButton active sortDir="desc" size="sm">
          Win rate
        </SortButton>
        <SortButton active={false} sortDir="asc" disabled>
          Not sortable
        </SortButton>
      </Variants>
      <Variants label="overflowing header" className="items-start">
        <SortButton active sortDir="desc" align="start" className="w-44 min-w-0">
          <span className="truncate">{LONG_LABEL}</span>
        </SortButton>
      </Variants>
    </>
  );
}

function ChoiceStates() {
  return (
    <>
      <Variants label="checkbox: off, on, disabled, invalid" className="flex-col items-start">
        <CheckboxField label="Only ranked matches" description="Bot and custom lobbies are left out." />
        <CheckboxField label="Only my matches" defaultChecked />
        <CheckboxField label="High skill only" description="Needs a patron account." disabled />
        <CheckboxField label="Accept the terms" aria-invalid description="Required before saving." />
      </Variants>
      <Variants label="switch: off, on, disabled, long label" className="w-72 flex-col items-stretch">
        <SwitchField label="Compare to the lobby average" />
        <SwitchField label="Show item icons" defaultChecked description="Draws the build as pictures." />
        <SwitchField label="Live updates" description="Paused while a filter is open." disabled />
        <SwitchField label={LONG_LABEL} />
      </Variants>
    </>
  );
}

function StatusDotStates() {
  return (
    <Variants label="tone, color and ring, always beside the text that carries the meaning">
      <span className="flex items-center gap-1.5 text-sm">
        <StatusDot tone="primary" />
        Live
      </span>
      <span className="flex items-center gap-1.5 text-sm">
        <StatusDot color="var(--chart-4)" ring="surface" />
        Series 4
      </span>
      <span className="flex items-center gap-1.5 text-sm">
        <StatusDot />
        Idle
      </span>
    </Variants>
  );
}

function BarStates() {
  return (
    <>
      <Variants label="rate and no value" className="w-72 flex-col items-stretch gap-4">
        <ProgressBar variant="thin" value={0.62} />
        <ProgressBar variant="thin" />
      </Variants>
      <Variants label="diverging: gain, loss, and an interval" className="w-72 flex-col items-stretch gap-4">
        <DivergingBar value={0.04} scale={0.1} />
        <DivergingBar value={-0.06} scale={0.1} />
        <DivergingBar value={0.02} scale={0.1} interval={[-0.01, 0.05]} />
      </Variants>
      <Variants label="right to left" className="w-72 flex-col items-stretch">
        <div dir="rtl" className="flex flex-col gap-4">
          <ProgressBar variant="thin" value={0.62} />
          <DivergingBar value={0.04} scale={0.1} />
        </div>
      </Variants>
    </>
  );
}

function CollapsibleTriggerStates() {
  return (
    <>
      <Variants label="bare trigger (tab to it: the trigger carries the focus ring itself)" className="items-stretch">
        <Collapsible className="w-64">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1 text-sm">
            Details
            <ChevronDownIcon className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 text-xs text-muted-foreground">
            The body the trigger opens.
          </CollapsibleContent>
        </Collapsible>
      </Variants>
      <Variants label="disabled" className="items-stretch">
        <Collapsible disabled className="w-64">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1 text-sm">
            Unavailable
            <ChevronDownIcon className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-2 text-xs text-muted-foreground">Never reached.</CollapsibleContent>
        </Collapsible>
      </Variants>
    </>
  );
}

function DragScrollStates() {
  return (
    <DragScroll className="w-full rounded-lg border p-3">
      <div className="flex w-max gap-2">
        {Array.from({ length: 14 }, (_, index) => (
          <div
            key={index}
            className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground"
          >
            {index + 1}
          </div>
        ))}
      </div>
    </DragScroll>
  );
}

function FilterCellStates() {
  const [region, setRegion] = useState("");
  return (
    <>
      <Variants label="inside a bar" className="items-stretch">
        <FilterBar title="Filters" className="w-full">
          <StringSelector label="Region" value={region} onValueChange={setRegion}>
            <StringOption value="">Any</StringOption>
            <StringOption value="europe">Europe</StringOption>
            <StringOption value="namerica">North America</StringOption>
          </StringSelector>
          <FilterCell label="Hero" value="Infernus" active onReset={() => undefined}>
            <p className="text-sm">The editor of this filter.</p>
          </FilterCell>
        </FilterBar>
      </Variants>
      <Variants label="size sm, in a toolbar" className="items-stretch">
        <FilterBar variant="toolbar" title="Matchups" className="w-full">
          <FilterCell size="sm" label="Hero" value="Infernus">
            <p className="text-sm">The editor of this filter.</p>
          </FilterCell>
          <FilterCell size="sm" label="Hero" value="Infernus" active onReset={() => undefined}>
            <p className="text-sm">The editor of this filter.</p>
          </FilterCell>
        </FilterBar>
      </Variants>
      <Variants label="standalone, overflowing value" className="items-start">
        <FilterCell label="Metric" value={LONG_LABEL} active onReset={() => undefined} className="w-56">
          <p className="text-sm">The value truncates; the cell keeps its width.</p>
        </FilterCell>
      </Variants>
    </>
  );
}

function TableStates() {
  return (
    <>
      <Variants label="empty body" className="items-stretch">
        <Table density="compact" className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead>Hero</TableHead>
              <TableHead className="text-end">Matches</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableEmptyRow colSpan={2} />
          </TableBody>
        </Table>
      </Variants>
      <Variants label="overflowing cell" className="items-stretch">
        <Table density="compact" className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-end">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="max-w-56">
                <span className="block truncate">{LONG_LABEL}</span>
              </TableCell>
              <TableCell className="text-end tabular-nums">0.42</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Variants>
    </>
  );
}

function ResultStates() {
  const [retrying, setRetrying] = useState(false);
  return (
    <>
      <Variants label="loading" className="items-stretch">
        <LoadingState label="hero stats" size="sm" />
        <LoadingState variant="skeleton" label="hero stats" className="h-24" />
      </Variants>
      <Variants label="empty" className="items-stretch">
        <EmptyState
          title="No matches in this range"
          description="Widen the date range or clear a filter."
          action={<Button size="sm">Reset filters</Button>}
        />
        <EmptyState variant="inline" title="Nothing to show yet" />
      </Variants>
      <Variants label="error and retrying" className="items-stretch">
        <ErrorState onRetry={() => setRetrying(true)} retrying={retrying} />
        <ErrorState variant="inline" title="Could not load the trend" onRetry={() => undefined} />
      </Variants>
    </>
  );
}

function ChartStates() {
  const [bucket, setBucket] = useState<"start_time_day" | "start_time_week">("start_time_day");
  return (
    <>
      <Variants label="ready" className="items-stretch">
        <StatTrendChart
          data={TREND_DATA}
          stat={TREND_STAT}
          value={bucket}
          onValueChange={(next) => setBucket(next as typeof bucket)}
          className="w-full"
        />
      </Variants>
      <Variants label="loading, error, empty" className="items-stretch">
        <StatTrendChart data={[]} state="loading" stat={TREND_STAT} value="start_time_day" className="w-full" />
        <StatTrendChart data={[]} state="error" stat={TREND_STAT} value="start_time_day" className="w-full" />
        <StatTrendChart data={TREND_EMPTY} stat={TREND_STAT} value="start_time_day" className="w-full" />
      </Variants>
    </>
  );
}

/** Round 4: the states Law 20 asks every component to specify, shown side by side. */
export function Round4States() {
  return (
    <>
      <Specimen
        name="Button states"
        source="ui/button"
        note="`loading` keeps the button focusable and announces it busy (aria-busy) while swallowing clicks; `disabled` removes it from the tab order. Use loading for an action in flight, disabled for one that is not available."
      >
        <ButtonStates />
      </Specimen>

      <Specimen
        name="Control states"
        source="ui/input"
        note="Every state a text control can be in. Read-only keeps the value selectable and focusable and marks itself with a dashed border, so it never reads as disabled."
      >
        <ControlStates />
      </Specimen>

      <Specimen
        name="Field states"
        source="ui/field"
        note="Help and error are connected to the control with aria-describedby; the error replaces the description and is announced. A long label wraps rather than squeezing the control."
      >
        <FieldStates />
      </Specimen>

      <Specimen
        name="SearchInput states"
        source="ui/search-input"
        note="The clear button appears only once there is something to clear and the field can be edited."
      >
        <SearchInputStates />
      </Specimen>

      <Specimen
        name="Slider states"
        source="ui/slider"
        note="The thumb carries the focus ring and grows its ring on hover; a disabled slider is dimmed, takes no pointer and shows the not-allowed cursor."
      >
        <SliderStates />
      </Specimen>

      <Specimen
        name="SortButton states"
        source="ui/sort-button"
        note="The direction is an arrow, never a color, and the header cell carries the matching aria-sort. A column that cannot be sorted is dimmed and unclickable."
      >
        <SortButtonStates />
      </Specimen>

      <Specimen
        name="Choice states"
        source="ui/checkbox-field"
        note="Checked is a mark and switched-on is a position, so neither depends on color; a disabled row dims its label and its help text together."
      >
        <ChoiceStates />
      </Specimen>

      <Specimen
        name="StatusDot states"
        source="ui/status-dot"
        note="The dot is decorative and hidden from assistive technology, so the text beside it must carry the meaning."
      >
        <StatusDotStates />
      </Specimen>

      <Specimen
        name="Bar states"
        source="ui/rate-bar"
        note="A missing rate leaves the track empty rather than drawing a zero, and the bars are placed with logical properties, so they mirror in a right-to-left context."
      >
        <BarStates />
      </Specimen>

      <Specimen
        name="FilterCell states"
        source="patterns/filter-bar/FilterCell"
        note="Active (label in brand, underline and a reset), loading (busy and not openable), disabled, and a value too long for the cell."
      >
        <FilterCellStates />
      </Specimen>

      <Specimen
        name="Table states"
        source="patterns/data-table/TableEmptyRow"
        note="A body with no rows, and a cell whose text outgrows its column."
      >
        <TableStates />
      </Specimen>

      <Specimen
        name="Result states"
        source="patterns/states"
        note="The three endings of a query, side by side: a failure never looks like an empty result, and an empty result offers a way out."
      >
        <ResultStates />
      </Specimen>

      <Specimen
        name="StatTrendChart states"
        source="patterns/charts/StatTrendChart"
        note="`state` picks what the plot area shows: the chart, the loader, or the failure. Data whose values are all missing falls back to the empty message on its own."
      >
        <ChartStates />
      </Specimen>

      <Specimen
        name="Stat states"
        source="ui/stat"
        note="A Stat with no reading renders NoValue (a dash, read out as “No value”) instead of an empty line. The label and the value each truncate, so a long one never widens its tile."
      >
        <Variants label="reading, no reading, overflowing label" className="items-stretch">
          <StatGroup variant="tiles" className="w-full grid-cols-1 sm:grid-cols-3">
            <Stat label="Win rate" value="54.1%" sub="412 matches" />
            <Stat label="Win rate" value={undefined} sub="No matches in this range" />
            <Stat label={LONG_LABEL} value="0.42" />
          </StatGroup>
        </Variants>
      </Specimen>

      <Specimen
        name="InlineStat states"
        source="ui/inline-stat"
        note="The value never breaks; a label too long for its container wraps after it instead of running out of the row. A missing value is a dash, not a gap."
      >
        <Variants label="reading, no reading">
          <InlineStat value="412" label="matches" />
          <InlineStat value={null} label="matches" />
        </Variants>
        <Variants label="overflowing label" className="items-start">
          <div className="w-44">
            <InlineStat value="412" label={LONG_LABEL} />
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="KeyValue states"
        source="ui/key-value"
        note="A row with neither `value` nor children renders NoValue. The label truncates on the leading edge and the value on the trailing one, so the row keeps its width."
      >
        <Variants className="items-stretch">
          <KeyValueList className="w-64">
            <KeyValue label="Matches" value="4,281" />
            <KeyValue label="Win rate" />
            <KeyValue label={LONG_LABEL} value="0.42" />
          </KeyValueList>
        </Variants>
      </Specimen>

      <Specimen
        name="Delta states"
        source="ui/delta"
        note="A change of zero at the displayed precision renders nothing; a missing or non-finite change renders NoValue rather than “NaN%”. The direction is a glyph or an arrow, never the color alone."
      >
        <Variants label="up, down, badge">
          <Delta value={0.031} />
          <Delta value={-0.031} sign="arrow" />
          <Delta value={0.031} display="badge" />
        </Variants>
        <Variants label="zero at this precision (renders nothing), null, NaN">
          <Delta value={0.00001} />
          <Delta value={null} />
          <Delta value={Number.NaN} />
        </Variants>
      </Specimen>

      <Specimen
        name="Pips states"
        source="ui/pips"
        note="Marks out of a maximum. No reading, or a maximum of zero, renders NoValue instead of an empty run of marks."
      >
        <Variants label="filled, empty, no reading">
          <Pips value={3} max={4} label="Level 3 of 4" />
          <Pips value={0} max={4} label="Level 0 of 4" />
          <Pips value={null} max={4} label="Level unknown" />
        </Variants>
      </Specimen>

      <Specimen
        name="ProgressBarWithLabel states"
        source="ui/progress-bar"
        note="Without a label the bar prints its own percentage; with neither a label nor a reading it prints NoValue instead of a misleading “0%”."
      >
        <Variants label="reading, no reading" className="items-start">
          <ProgressBarWithLabel value={0.62} label="62%" delta={0.021} className="w-40" />
          <ProgressBarWithLabel value={undefined} className="w-40" />
        </Variants>
      </Specimen>

      <Specimen
        name="HeatCell states"
        source="ui/heat-cell"
        note="Hover rings the cell in the brand color at the width the selected ring already uses, so nothing shifts under the pointer; the picked cell keeps the foreground ring and `aria-pressed`. A cell with no reading is hatched, so “no sample” reads without color, and a disabled cell drops the hover ring."
      >
        <Variants label="reading, no reading, selected, disabled">
          <HeatCell color="color-mix(in oklab, var(--primary) 80%, transparent)" label="Tuesday 18:00, 64 matches" />
          <HeatCell label="Tuesday 19:00, no matches" />
          <HeatCell
            color="color-mix(in oklab, var(--primary) 60%, transparent)"
            selected
            label="Tuesday 20:00, 41 matches, selected"
          />
          <HeatCell
            color="color-mix(in oklab, var(--primary) 40%, transparent)"
            disabled
            label="Tuesday 21:00, outside the range"
          />
        </Variants>
      </Specimen>

      <Specimen
        name="Card interaction states"
        source="ui/card"
        note='interaction="pressable" answers to hover, to focus and now to the press itself; a card marked aria-disabled takes no pointer and dims. A long title wraps instead of widening the card.'
      >
        <Variants label="pressable: hover, focus, press" className="grid sm:grid-cols-2">
          <Card asChild interaction="pressable" size="sm" className="w-full">
            <a href="#card-interaction-states" aria-label="Hero analytics">
              <CardHeader>
                <CardTitle>Hero analytics</CardTitle>
                <CardDescription>Hover, tab to it, then hold the mouse down.</CardDescription>
              </CardHeader>
            </a>
          </Card>
          <Card interaction="pressable" size="sm" aria-disabled className="w-full">
            <CardHeader>
              <CardTitle>Unavailable</CardTitle>
              <CardDescription>aria-disabled: no pointer, no hover.</CardDescription>
            </CardHeader>
          </Card>
        </Variants>
        <Variants label="overflowing title" className="items-start">
          <Card interaction="pressable" size="sm" className="w-64">
            <CardHeader>
              <CardTitle>{LONG_LABEL}</CardTitle>
            </CardHeader>
          </Card>
        </Variants>
      </Specimen>

      <Specimen
        name="Collapsible states"
        source="ui/collapsible"
        note="The trigger carries the one focus treatment itself, so a bare trigger is visible under the keyboard without the call site adding a ring; `disabled` takes it out of the pointer and dims it."
      >
        <CollapsibleTriggerStates />
      </Specimen>

      <Specimen
        name="DragScroll states"
        source="ui/drag-scroll"
        note="The scroller is in the tab order and shows the one focus treatment, so the arrow keys reach the part of the diagram the pointer would drag to."
      >
        <Variants className="items-stretch">
          <DragScrollStates />
        </Variants>
      </Specimen>

      <Specimen
        name="Alert overflow"
        source="ui/alert"
        note="The title clamps to one line; the description breaks long words, so a URL inside an alert never widens the surface."
      >
        <Variants className="items-start">
          <Alert variant="warning" className="w-72">
            <TriangleAlertIcon />
            <AlertTitle>{LONG_LABEL}</AlertTitle>
            <AlertDescription>{LONG_URL}</AlertDescription>
          </Alert>
        </Variants>
      </Specimen>

      <Specimen
        name="Code overflow"
        source="ui/code"
        note="Inline code breaks inside the word, so a long path or query string wraps with the sentence instead of running past it."
      >
        <Variants className="items-start">
          <p className="w-56 text-sm">
            Ask <Code>{LONG_URL}</Code> for the numbers behind this table.
          </p>
        </Variants>
      </Specimen>
    </>
  );
}
