import { Inbox, Swords } from "lucide-react";
import { useState } from "react";

import {
  ChunkErrorBoundarySpecimen,
  FilteredSelectPopoverSpecimen,
  PageShellSpecimen,
  QueryRendererSpecimen,
  SideNavSpecimen,
} from "~/components/dev/design-system/PatternsMore";
import { Round3Patterns } from "~/components/dev/design-system/Round3Patterns";
import { Round3PatternsMore } from "~/components/dev/design-system/Round3PatternsMore";
import { Chapter, Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { HighlightedCode } from "~/components/patterns/code/HighlightedCode";
import { PaginationControls } from "~/components/patterns/data-table/PaginationControls";
import { SortableHeader } from "~/components/patterns/data-table/SortableHeader";
import { TableEmptyRow } from "~/components/patterns/data-table/TableEmptyRow";
import { DateRangePicker } from "~/components/patterns/filter-bar/DateRangePicker";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { FilterCell, FilterToggleCell } from "~/components/patterns/filter-bar/FilterCell";
import { NumberSelector } from "~/components/patterns/filter-bar/NumberSelector";
import { StringOption, StringSelector } from "~/components/patterns/filter-bar/StringSelector";
import { type TriState, TriStateItem, TriStateSelector } from "~/components/patterns/filter-bar/TriStateSelector";
import { ResponsiveTab, ResponsiveTabsList } from "~/components/patterns/navigation/ResponsiveTabsList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { Section } from "~/components/patterns/page/Section";
import { Panel, PanelBody, PanelFooter, PanelHeader, PanelShowMore } from "~/components/patterns/panel/Panel";
import { EmptyState } from "~/components/patterns/states/EmptyState";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { SkeletonRows } from "~/components/patterns/states/Skeletons";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Delta } from "~/components/ui/delta";
import { Field } from "~/components/ui/field";
import { SearchInput } from "~/components/ui/search-input";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { type SortDir } from "~/components/ui/sort-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsContent } from "~/components/ui/tabs";
import type { Dayjs } from "~/dayjs";
import { TONE_TEXT, toneOf } from "~/lib/tone";

const ROWS = [
  { hero: "Infernus", winRate: 0.531, pickRate: 0.092, matches: 84120, delta: 0.012 },
  { hero: "Haze", winRate: 0.489, pickRate: 0.118, matches: 107903, delta: -0.008 },
  { hero: "Seven", winRate: 0.512, pickRate: 0.101, matches: 92377, delta: 0.003 },
  { hero: "Paradox", winRate: 0.474, pickRate: 0.041, matches: 37490, delta: -0.015 },
];
type Key = "hero" | "winRate" | "pickRate" | "matches";

type Side = "all" | "amber" | "sapphire";

const REGIONS = ["europe", "north-america", "asia", "oceania", "south-america", "row"];

const TAB_OPTIONS = [
  { value: "overview", label: "Overview" },
  { value: "over-time", label: "Over Time" },
  { value: "by-rank", label: "By Rank" },
  { value: "economy", label: "Economy" },
];

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function Patterns() {
  const [sortKey, setSortKey] = useState<Key>("winRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [density, setDensity] = useState<"default" | "compact" | "dense">("compact");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState("");
  const [side, setSide] = useState<Side>("all");
  const [region, setRegion] = useState<string | null>("europe");
  const [minMatches, setMinMatches] = useState(50);
  const [items, setItems] = useState<Map<number, TriState>>(new Map());
  const [dates, setDates] = useState<{ startDate?: Dayjs; endDate?: Dayjs }>({});
  const [tab, setTab] = useState("overview");
  const [expanded, setExpanded] = useState(false);

  const onSort = (key: Key) => {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };
  const sorted = ROWS.toSorted((a, b) => {
    const order = a[sortKey] < b[sortKey] ? -1 : a[sortKey] > b[sortKey] ? 1 : 0;
    return sortDir === "desc" ? -order : order;
  });
  const visible = sorted.filter((row) => row.hero.toLowerCase().includes(search.toLowerCase()));

  return (
    <Chapter
      id="patterns"
      title="Patterns"
      intro="Compositions of primitives that any data site could use, in components/patterns. A route is a PageShell holding a PageHeader, a FilterBar and Sections."
    >
      <PageShellSpecimen />

      <Specimen
        name="PageHeader"
        source="patterns/page/PageHeader"
        note="The one h1 of a page. Wrapped in PageShell, which owns page width and the gap between blocks."
      >
        <Variants label="default, centered, with the About disclosure" className="block">
          <PageHeader as="div" title="Hero Stats" description="Win, pick and ban rates for every hero.">
            Rates are computed from ranked matches in the selected window.
          </PageHeader>
        </Variants>
        <Variants label="media and actions" className="block">
          <PageHeader
            as="div"
            title="Infernus"
            description="Brawler · 84,120 matches in the last 30 days"
            media={
              <Avatar className="size-12">
                <AvatarFallback>IN</AvatarFallback>
              </Avatar>
            }
            actions={
              <>
                <Button variant="outline" size="sm">
                  Compare
                </Button>
                <Button size="sm">Track</Button>
              </>
            }
          />
        </Variants>
        <Variants label='size="lg"' className="block">
          <PageHeader
            as="div"
            size="lg"
            title="Data Dumps"
            description="Every match we have ever ingested, as Parquet files you can query in place."
          />
        </Variants>
      </Specimen>

      <Specimen
        name="Section"
        source="patterns/page/Section"
        note="A named block. as picks the heading level by outline; size picks the look."
      >
        <Section title="Win rate by rank" description="How the hero performs from Initiate to Eternus.">
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Section content
          </div>
        </Section>
      </Specimen>

      <Specimen
        name="FilterBar cells"
        source="patterns/filter-bar/FilterBar · FilterCell · StringSelector · NumberSelector · TriStateSelector · DateRangePicker"
        note="The filters of a page: two across on a phone, three on a tablet, one row on a desktop. A changed filter is underlined and gets a reset."
      >
        <Variants className="block">
          <FilterBar>
            <FilterToggleCell label="Side" value={side} defaultValue="all" onValueChange={setSide} width="wide">
              <SegmentedItem value="all">All</SegmentedItem>
              <SegmentedItem value="amber">Amber</SegmentedItem>
              <SegmentedItem value="sapphire">Sapphire</SegmentedItem>
            </FilterToggleCell>
            <StringSelector label="Region" value={region} onValueChange={setRegion} defaultValue="europe">
              {REGIONS.map((value) => (
                <StringOption key={value} value={value}>
                  {value}
                </StringOption>
              ))}
            </StringSelector>
            <NumberSelector
              label="Min matches"
              value={minMatches}
              onValueChange={setMinMatches}
              step={10}
              min={0}
              defaultValue={50}
            />
            <TriStateSelector label="Items" value={items} onValueChange={setItems}>
              <TriStateItem value={1} label="Basic Magazine" />
              <TriStateItem value={2} label="Extra Health" />
              <TriStateItem value={3} label="Mystic Burst" />
            </TriStateSelector>
            <FilterCell
              label="Dates"
              value={dates.startDate ? "Custom" : "All time"}
              active={Boolean(dates.startDate)}
              onReset={() => setDates({})}
            >
              <DateRangePicker value={dates} onValueChange={setDates} />
            </FilterCell>
          </FilterBar>
        </Variants>
      </Specimen>

      <Specimen
        name="FilterBar toolbar"
        source="patterns/filter-bar/FilterBar"
        note='variant="toolbar": the controls of one chart or table, as compact Fields that wrap.'
      >
        <Variants className="block">
          <FilterBar variant="toolbar" title="Trend" icon={Swords}>
            <Field label="Metric" orientation="horizontal">
              <Select defaultValue="winrate">
                <SelectTrigger size="sm" aria-label="Metric">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="winrate">Win rate</SelectItem>
                  <SelectItem value="pickrate">Pick rate</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Side" orientation="horizontal">
              <Segmented width="hug" aria-label="Side" value={side} onValueChange={setSide}>
                <SegmentedItem value="all">All</SegmentedItem>
                <SegmentedItem value="amber">Amber</SegmentedItem>
                <SegmentedItem value="sapphire">Sapphire</SegmentedItem>
              </Segmented>
            </Field>
          </FilterBar>
        </Variants>
      </Specimen>

      <FilteredSelectPopoverSpecimen />

      <Specimen
        name="Data table"
        source="ui/table · patterns/data-table/*"
        note='SortableHeader carries aria-sort; size="sm" drops the idle arrows for dense tables, sortLabel names the button when the visible label is not enough, and label takes a node. data-pinned pins the identity column while the rest scrolls. Tones come from toneOf().'
      >
        <Segmented size="sm" width="hug" aria-label="Density" value={density} onValueChange={setDensity}>
          <SegmentedItem value="default">default</SegmentedItem>
          <SegmentedItem value="compact">compact</SegmentedItem>
          <SegmentedItem value="dense">dense</SegmentedItem>
        </Segmented>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table density={density}>
            <TableHeader className="bg-muted">
              <TableRow>
                <SortableHeader
                  data-pinned
                  label="Hero"
                  align="start"
                  sortKey="hero"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortableHeader
                  label="Win rate"
                  align="end"
                  sortKey="winRate"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <TableHead className="text-end">Change</TableHead>
                <SortableHeader
                  label="Pick rate"
                  align="end"
                  size="sm"
                  sortLabel={`Sort by pick rate, ${sortKey === "pickRate" && sortDir === "desc" ? "ascending" : "descending"}`}
                  sortKey="pickRate"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <SortableHeader
                  label={
                    <>
                      Matches <span className="font-normal text-muted-foreground">(n)</span>
                    </>
                  }
                  align="end"
                  sortKey="matches"
                  activeSortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && <TableEmptyRow colSpan={5} />}
              {visible.map((row) => (
                <TableRow key={row.hero}>
                  <TableCell data-pinned className="font-medium">
                    {row.hero}
                  </TableCell>
                  <TableCell className={`text-end tabular-nums ${TONE_TEXT[toneOf(row.winRate, 0.5)]}`}>
                    {pct(row.winRate)}
                  </TableCell>
                  <TableCell className="text-end">
                    <Delta value={row.delta} />
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{pct(row.pickRate)}</TableCell>
                  <TableCell className="text-end tabular-nums">{row.matches.toLocaleString("en-US")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Specimen>

      <Specimen
        name="PaginationControls"
        source="patterns/data-table/PaginationControls"
        note='Rows per page and paging in one wrapping row; a SearchInput child takes the row it wraps onto. size="sm" shrinks every control for panels and dialogs.'
      >
        <Variants label="default" className="block">
          <PaginationControls
            page={page}
            onPageChange={setPage}
            pageSize={perPage}
            onPageSizeChange={setPerPage}
            totalPages={3}
          >
            <SearchInput
              size="sm"
              placeholder="Search heroes"
              aria-label="Search heroes"
              value={search}
              onValueChange={setSearch}
            />
          </PaginationControls>
        </Variants>
        <Variants label='size="sm"' className="block">
          <PaginationControls
            size="sm"
            page={page}
            onPageChange={setPage}
            pageSize={perPage}
            onPageSizeChange={setPerPage}
            totalPages={3}
          />
        </Variants>
      </Specimen>

      <Specimen
        name="Panel"
        source="patterns/panel/Panel"
        note="A titled block of a dashboard. The parts bring their own padding, so a table or chart can run edge to edge."
      >
        <Variants className="grid items-start md:grid-cols-3">
          <Panel>
            <PanelHeader title="Win rate by lane" description="1,204 matches" size="sm" />
            <PanelBody size="sm" className="text-sm">
              description: a quiet line beside the title.
            </PanelBody>
          </Panel>
          <Panel className="max-w-72">
            <PanelHeader
              title="A long title that has to truncate"
              description="A long description wraps under the title: 12 Aug to 20 Sep, 1,204 matches, all ranks"
              size="sm"
            >
              <Badge variant="muted" size="sm">
                12
              </Badge>
            </PanelHeader>
            <PanelBody size="sm" className="text-sm">
              Overflowing description with a trailing control, in a narrow panel.
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Best next pick">
              <Badge variant="muted" size="sm">
                12
              </Badge>
            </PanelHeader>
            <PanelBody className="text-sm">Body with default padding.</PanelBody>
            <PanelShowMore open={expanded} total={12} onOpenChange={setExpanded} />
          </Panel>
          <Panel>
            <PanelHeader title="Recent form" icon={Swords} size="sm" />
            <PanelBody>
              <SkeletonRows rows={3} />
            </PanelBody>
            <PanelFooter>Last 20 matches</PanelFooter>
          </Panel>
          <Panel>
            <PanelHeader title="Counters" size="sm" />
            <EmptyState variant="inline" className="px-4 py-6" title="Pick a hero to see who counters it." />
          </Panel>
        </Variants>
      </Specimen>

      <Specimen
        name="LoadingState"
        source="patterns/states/LoadingState"
        note="The brand loader, with an optional line of text under it. sm fits a panel, popover or row. skeleton holds the final height of a block so the layout does not jump. A busy control uses Spinner instead."
      >
        <Variants className="grid items-center md:grid-cols-4">
          <LoadingState label="hero stats" />
          <LoadingState label="hero stats" text="Loading hero stats…" />
          <LoadingState size="sm" text="Loading matches…" />
          <LoadingState variant="skeleton" label="chart" className="h-24" />
        </Variants>
      </Specimen>

      <Specimen
        name="EmptyState"
        source="patterns/states/EmptyState"
        note="A query that succeeded with nothing to show. panel stands in for the content; inline is one quiet line."
      >
        <Variants className="grid items-center md:grid-cols-2">
          <EmptyState
            icon={Inbox}
            title="No matches for these filters"
            description="Try a wider date range."
            action={
              <Button variant="outline" size="sm">
                Reset filters
              </Button>
            }
          />
          <EmptyState variant="inline" title="No data available." />
        </Variants>
      </Specimen>

      <Specimen
        name="ErrorState"
        source="patterns/states/ErrorState"
        note="A failed request. It keeps the filters and offers a retry, so it never reads as an empty result."
      >
        <ErrorState title="Unable to load hero stats" onRetry={() => {}} />
      </Specimen>

      <QueryRendererSpecimen />

      <ChunkErrorBoundarySpecimen />

      <Specimen
        name="ResponsiveTabsList"
        source="patterns/navigation/ResponsiveTabsList"
        note="Page-level tabs that turn into a select when they no longer fit. Narrow the window to see it."
      >
        <Tabs value={tab} onValueChange={setTab}>
          <ResponsiveTabsList aria-label="Sections" value={tab} onValueChange={setTab}>
            {TAB_OPTIONS.map((option) => (
              <ResponsiveTab key={option.value} value={option.value}>
                {option.label}
              </ResponsiveTab>
            ))}
          </ResponsiveTabsList>
          {TAB_OPTIONS.map((option) => (
            <TabsContent key={option.value} value={option.value} className="text-sm text-muted-foreground">
              {option.label} content
            </TabsContent>
          ))}
        </Tabs>
      </Specimen>

      <SideNavSpecimen />

      <Specimen name="HighlightedCode" source="patterns/code/HighlightedCode">
        <HighlightedCode
          language="sql"
          code={"SELECT hero_id, avg(won::int) AS win_rate\nFROM match_player\nGROUP BY hero_id;"}
        />
      </Specimen>
      <Round3Patterns />
      <Round3PatternsMore />
    </Chapter>
  );
}
