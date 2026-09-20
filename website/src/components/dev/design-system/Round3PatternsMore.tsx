import { Layers, Users } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { CopyableCode, CopyableUrl } from "~/components/patterns/code/CopyableCode";
import { HighlightedCode } from "~/components/patterns/code/HighlightedCode";
import {
  ComparisonBody,
  ComparisonCell,
  ComparisonColumn,
  ComparisonHeader,
  ComparisonRow,
  ComparisonTable,
} from "~/components/patterns/data-table/ComparisonTable";
import { ExpandableRow, ExpandableRowToggle } from "~/components/patterns/data-table/ExpandableRow";
import { PaginatedTable } from "~/components/patterns/data-table/PaginatedTable";
import { PaginationControls } from "~/components/patterns/data-table/PaginationControls";
import { ResultGrid } from "~/components/patterns/data-table/ResultGrid";
import { FilterBar } from "~/components/patterns/filter-bar/FilterBar";
import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { FilteredSelectOption, FilteredSelectPopover } from "~/components/patterns/filter-bar/FilteredSelectPopover";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelSection,
  PanelShowMore,
  PanelSkeleton,
} from "~/components/patterns/panel/Panel";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { SkeletonMediaRow, SkeletonRows, SkeletonStatTiles } from "~/components/patterns/states/Skeletons";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

const INSTALL =
  "curl -fsSL https://raw.githubusercontent.com/deadlock-api/deadlock-api-ingest/master/install-linux.sh | bash";
const SQL = `SELECT hero_id, count(*) AS games, avg(kills) AS kills
FROM lake.match_player
WHERE match_id BETWEEN 105000000 AND 105100000
GROUP BY ALL ORDER BY games DESC;`;

// BigInt() rather than a literal: the React Compiler's oxc port lowers `1n` inside a component to `undefined`.
const RESULT_ROWS = [
  [BigInt("105000042"), "Abrams", 41250, [1, 2, 3]],
  [BigInt("105000043"), null, 9800, null],
  [BigInt("105000044"), "A very long value that is truncated in its cell and shown in full on hover", 0, []],
];

function CodeSpecimens() {
  return (
    <>
      <Specimen
        name="HighlightedCode actions and overflow"
        source="patterns/code/HighlightedCode"
        note='A block of code. actions="copy" adds the copy button; overflow="wrap" breaks long lines instead of scrolling; size sm | default | lg.'
      >
        <Variants
          label='actions="copy" (default size, overflow="scroll": focus it and scroll with the arrow keys)'
          className="block"
        >
          <HighlightedCode language="sql" code={SQL} actions="copy" />
        </Variants>
        <Variants label='overflow="wrap" size="lg"' className="block max-w-md">
          <HighlightedCode language="bash" code={INSTALL} overflow="wrap" size="lg" actions="copy" />
        </Variants>
        <Variants label='size="sm", actions="none" (default)' className="block">
          <HighlightedCode language="json" code={'{ "version": 123, "tables": [] }'} size="sm" />
        </Variants>
      </Specimen>

      <Specimen
        name="CopyableCode"
        source="patterns/code/CopyableCode"
        note="One command or path to copy, framed with its copy button. With a language it is highlighted; without one it is plain monospace for a path."
      >
        <Variants label="with a language; a long command scrolls" className="block">
          <CopyableCode language="bash" code={INSTALL} copyLabel="Copy command" />
        </Variants>
        <Variants label='a path, size="sm"' className="block">
          <CopyableCode size="sm" code="~/.local/share/Steam/appcache/httpcache" copyLabel="Copy path" />
        </Variants>
      </Specimen>

      <Specimen
        name="CopyableUrl"
        source="patterns/code/CopyableCode"
        note="An address the reader takes elsewhere: eyebrow label, the value, a copy button, then further actions as children."
      >
        <Variants label='overflow="truncate" (default) with an action' className="block">
          <CopyableUrl
            label="Manifest"
            value="https://lake.deadlock-api.com/manifest/latest/with/a/very/long/path/that/truncates.json"
          >
            <Button variant="outline" size="sm">
              Open playground
            </Button>
          </CopyableUrl>
        </Variants>
        <Variants label='overflow="wrap"' className="block max-w-md">
          <CopyableUrl
            label="Command URL"
            overflow="wrap"
            value="https://api.deadlock-api.com/v1/commands/resolve?region=Europe&account_id=123&template=rank"
          />
        </Variants>
        <Variants label="empty: the placeholder shows and the copy button is disabled" className="block">
          <CopyableUrl label="Generated URL" placeholder="Fill in the fields to generate a URL." />
        </Variants>
      </Specimen>
    </>
  );
}

function PanelSpecimens() {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <Specimen
        name="PanelWithDetails"
        source="patterns/panel/PanelWithDetails"
        note='A compact panel whose "Show more" opens the full content in a dialog. children are the compact view, details is the dialog body (mounted only while open). open / defaultOpen / onOpenChange.'
      >
        <Variants
          label='size="sm" (default) with icon, meta, footer; size="default"'
          className="grid items-start sm:grid-cols-2"
        >
          <PanelWithDetails
            title="Companions"
            icon={Users}
            meta="120 matches"
            metaPlacement="both"
            footer="Players you queued with at least 3 times"
            dialogSize="default"
            details={<SkeletonMediaRow rows={6} variant="divided" label="companions" />}
          >
            <SkeletonMediaRow rows={2} />
          </PanelWithDetails>
          <PanelWithDetails
            title="Item builds"
            size="default"
            dialogSize="lg"
            details={<p className="text-sm text-muted-foreground">Every build, in a wider dialog.</p>}
          >
            <p className="text-sm text-muted-foreground">The three most played builds.</p>
          </PanelWithDetails>
        </Variants>
      </Specimen>

      <Specimen
        name="PanelSection"
        source="patterns/panel/Panel"
        note="A titled strip that divides the rows of a panel or list into groups. Children sit on the trailing edge. Also here: PanelHeader description and PanelShowMore as a row button."
      >
        <Panel>
          <PanelHeader title="Match history" description="Grouped by day, newest first" icon={Layers} />
          <PanelSection title="Today">
            <Badge variant="muted" size="sm">
              3
            </Badge>
          </PanelSection>
          <PanelBody size="sm">Rows of today</PanelBody>
          <PanelSection title="A very long section title that truncates instead of wrapping onto a second line" />
          <PanelBody size="sm">Rows of yesterday</PanelBody>
          {expanded && <PanelBody size="sm">More rows</PanelBody>}
          <PanelShowMore open={expanded} total={24} onOpenChange={setExpanded} />
        </Panel>
      </Specimen>
    </>
  );
}

function StatesSpecimens() {
  return (
    <>
      <Specimen
        name="LoadingState align"
        source="patterns/states/LoadingState"
        note='align="center" fills the parent and sits in its middle, with room above and below: a tab, a panel or a page that is loading.'
      >
        <Variants label='align="center": size="sm" | "default"' className="grid items-stretch sm:grid-cols-2">
          <Card tone="inset" size="flush" className="h-40">
            <LoadingState align="center" size="sm" label="matches" />
          </Card>
          <Card tone="inset" size="flush">
            <LoadingState align="center" text="Loading matches…" />
          </Card>
        </Variants>
      </Specimen>

      <Specimen
        name="Skeletons"
        source="patterns/states/Skeletons"
        note="Stand-ins shaped like what is loading. label announces it once; leave it out when a parent already does. PanelSkeleton is SkeletonRows with panel padding."
      >
        <Variants
          label='SkeletonRows: size xs | sm | default, variant "fade" | "solid"'
          className="grid items-start sm:grid-cols-3"
        >
          <SkeletonRows size="xs" rows={4} label="rows" />
          <SkeletonRows size="sm" rows={3} variant="solid" />
          <SkeletonRows rows={3} />
        </Variants>
        <Variants
          label='SkeletonMediaRow: variant "plain" | "divided", shape "circle" | "square"'
          className="grid items-start sm:grid-cols-2"
        >
          <SkeletonMediaRow rows={2} />
          <SkeletonMediaRow rows={2} variant="divided" shape="square" />
        </Variants>
        <Variants label="SkeletonStatTiles (steps down with its container)" className="block">
          <SkeletonStatTiles count={6} />
        </Variants>
        <Variants label="PanelSkeleton" className="block">
          <Panel>
            <PanelHeader title="Loading panel" />
            <PanelSkeleton rows={3} />
          </Panel>
        </Variants>
      </Specimen>

      <Specimen
        name="ErrorState as a boundary fallback"
        source="patterns/states/ErrorState"
        note="The app-level API error fallback is an ErrorState with its own title and description and the boundary's reset as onRetry."
      >
        <Variants label="alert | retrying | inline" className="grid items-start sm:grid-cols-3">
          <ErrorState
            title="Failed to load data from the API"
            description="The API may be down. Try again."
            onRetry={() => {}}
          />
          <ErrorState title="Failed to load data from the API" description="Retrying…" onRetry={() => {}} retrying />
          <ErrorState variant="inline" title="Failed to load" onRetry={() => {}} />
        </Variants>
      </Specimen>
    </>
  );
}

const PLAYERS = ["Abrams main", "Seven enjoyer", "Haze", "Wraith", "Kelvin", "Infernus"].map((name, i) => ({
  id: i,
  name,
  matches: 240 - i * 31,
}));

function DataTableSpecimens() {
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([0, 1, 2]);
  const pagination = {
    currentPage: page,
    onPageChange: setPage,
    itemsPerPage: perPage,
    onItemsPerPageChange: setPerPage,
    totalPages: 12,
  };
  const rows = PLAYERS.filter((player) => player.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <Specimen
        name="PaginatedTable"
        source="patterns/data-table/PaginatedTable"
        note='A table with its PaginationControls above, below or both. PaginationControls size="sm" is the tight row for a table inside a panel; its search is a SearchInput.'
      >
        <Variants label='position="both" (default)' className="block">
          <PaginatedTable
            controls={
              <PaginationControls
                {...pagination}
                searchQuery={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search player..."
              />
            }
          >
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-end">Matches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 3).map((player) => (
                  <TableRow key={player.id}>
                    <TableCell>{player.name}</TableCell>
                    <TableCell className="text-end tabular-nums">{player.matches}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PaginatedTable>
        </Variants>
        <Variants label='position="bottom" with PaginationControls size="sm"' className="block max-w-md">
          <PaginatedTable position="bottom" controls={<PaginationControls {...pagination} size="sm" />}>
            <Table density="dense">
              <TableBody>
                <TableRow>
                  <TableCell>One row</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </PaginatedTable>
        </Variants>
      </Specimen>

      <Specimen
        name="ResultGrid"
        source="patterns/data-table/ResultGrid"
        note="Rows of unknown shape, as a query or a file returned them: monospace, numbers end-aligned, NULL set apart, long values truncated with the full text on hover."
      >
        <Variants label='density="dense" (default)' className="block">
          <ResultGrid
            label="Preview of match_player"
            columns={[
              { name: "match_id", type: "BIGINT" },
              { name: "hero", type: "VARCHAR" },
              { name: "net_worth", type: "INTEGER" },
              { name: "items", type: "INTEGER[]" },
            ]}
            rows={RESULT_ROWS}
          />
        </Variants>
        <Variants label='density="compact", empty' className="block">
          <ResultGrid density="compact" columns={[{ name: "hero_id" }, { name: "games" }]} rows={[]} />
        </Variants>
      </Specimen>

      <Specimen
        name="ComparisonTable"
        source="patterns/data-table/ComparisonTable"
        note="Features down the side, plans across the top, composed from rows and cells. highlightedColumn tints one plan. A cell is a check, a dash, or its children."
      >
        <ComparisonTable highlightedColumn={1} className="max-w-2xl">
          <ComparisonHeader>
            <ComparisonColumn>Free</ComparisonColumn>
            <ComparisonColumn>Patron</ComparisonColumn>
          </ComparisonHeader>
          <ComparisonBody>
            <ComparisonRow label="Full API access">
              <ComparisonCell included />
              <ComparisonCell included />
            </ComparisonRow>
            <ComparisonRow label="Dedicated queue with reserved resources, which is a long label that wraps">
              <ComparisonCell />
              <ComparisonCell included />
            </ComparisonRow>
            <ComparisonRow label="Prioritized accounts">
              <ComparisonCell>1</ComparisonCell>
              <ComparisonCell>Up to 50</ComparisonCell>
            </ComparisonRow>
          </ComparisonBody>
        </ComparisonTable>
      </Specimen>

      <Specimen
        name="ExpandableRow"
        source="patterns/data-table/ExpandableRow"
        note="A row that opens a full-width detail row. The whole row toggles on click, except links and buttons inside it; ExpandableRowToggle gives the keyboard the same. open / defaultOpen / onOpenChange."
      >
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>Table</TableHead>
              <TableHead className="text-end">Rows</TableHead>
              <TableHead className="text-end">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {["match_player", "leaderboard"].map((name, i) => (
              <ExpandableRow
                key={name}
                colSpan={3}
                defaultOpen={i === 0}
                details={<p className="text-xs text-muted-foreground">Columns and files of {name}.</p>}
              >
                <TableCell>
                  <span className="flex items-center gap-2 font-medium">
                    <ExpandableRowToggle label={name} />
                    {name}
                  </span>
                </TableCell>
                <TableCell className="text-end tabular-nums">{(1_200_000 * (i + 1)).toLocaleString("en-US")}</TableCell>
                <TableCell className="text-end">
                  <Button variant="ghost" size="xs">
                    Does not toggle
                  </Button>
                </TableCell>
              </ExpandableRow>
            ))}
          </TableBody>
        </Table>
      </Specimen>

      <Specimen
        name="FilterBar position and FilterCell contentClassName"
        source="patterns/filter-bar/FilterBar"
        note='A toolbar with position="sticky" stays at the top of its scroll container. FilterCell sizes its popover with contentClassName. FilteredSelectPopover rows are OptionRows (keyboard reachable), its chips are Badges and its trigger a regular Button.'
      >
        <Variants label='variant="toolbar" position="sticky": scroll the box' className="block">
          <Card tone="inset" size="flush" className="h-40 overflow-y-auto p-2">
            <FilterBar variant="toolbar" position="sticky" title="Sticky controls">
              <Field orientation="horizontal" label="View">
                <Segmented size="sm" aria-label="View" value="table" onValueChange={() => {}}>
                  <SegmentedItem value="table">Table</SegmentedItem>
                  <SegmentedItem value="chart">Chart</SegmentedItem>
                </Segmented>
              </Field>
            </FilterBar>
            <SkeletonRows rows={8} variant="solid" className="pt-2" />
          </Card>
        </Variants>
        <Variants label="FilterCell: eyebrow label, active tone, contentClassName">
          <FilterCell
            label="Players"
            value={`${selected.length} selected`}
            active={selected.length > 0}
            onReset={() => setSelected([])}
            contentClassName="w-64"
          >
            <p className="text-xs text-muted-foreground">A popover 16rem wide.</p>
          </FilterCell>
          <FilterCell label="Idle" value="Any">
            <p className="text-xs text-muted-foreground">Default width.</p>
          </FilterCell>
        </Variants>
        <Variants label="FilteredSelectPopover: empty, some, more than maxChips">
          <FilteredSelectPopover value={[]} onValueChange={() => {}} emptyLabel="Select players...">
            {PLAYERS.map((player) => (
              <FilteredSelectOption key={player.id} value={player.id}>
                {player.name}
              </FilteredSelectOption>
            ))}
          </FilteredSelectPopover>
          <FilteredSelectPopover value={selected} onValueChange={setSelected} emptyLabel="Select players...">
            {PLAYERS.map((player) => (
              <FilteredSelectOption key={player.id} value={player.id}>
                {player.name}
              </FilteredSelectOption>
            ))}
          </FilteredSelectPopover>
        </Variants>
      </Specimen>
    </>
  );
}

/** Code, panel, state, data-table and filter-bar patterns added in round 3. */
export function Round3PatternsMore() {
  return (
    <>
      <CodeSpecimens />
      <PanelSpecimens />
      <StatesSpecimens />
      <DataTableSpecimens />
    </>
  );
}
