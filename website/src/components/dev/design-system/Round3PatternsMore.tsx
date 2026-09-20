import { Layers, Users } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { CopyableCode, CopyableUrl } from "~/components/patterns/code/CopyableCode";
import { HighlightedCode } from "~/components/patterns/code/HighlightedCode";
import {
  ComparisonCell,
  ComparisonColumn,
  ComparisonHeader,
  ComparisonRow,
  ComparisonTable,
} from "~/components/patterns/data-table/ComparisonTable";
import { ExpandableRow, ExpandableRowToggle } from "~/components/patterns/data-table/ExpandableRow";
import {
  HeatGrid,
  HeatGridBody,
  HeatGridCell,
  HeatGridColumn,
  HeatGridHead,
  HeatGridRow,
} from "~/components/patterns/data-table/HeatGrid";
import { ResultGrid } from "~/components/patterns/data-table/ResultGrid";
import { FilterCell } from "~/components/patterns/filter-bar/FilterCell";
import { FilteredSelectOption, FilteredSelectPopover } from "~/components/patterns/filter-bar/FilteredSelectPopover";
import { Panel, PanelBody, PanelHeader, PanelSection, PanelShowMore } from "~/components/patterns/panel/Panel";
import { PanelWithDetails } from "~/components/patterns/panel/PanelWithDetails";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { SkeletonMediaRow, SkeletonRows, SkeletonStatTiles } from "~/components/patterns/states/Skeletons";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
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
        <Variants label='actions="none" (default)' className="block">
          <HighlightedCode language="json" code={'{ "version": 123, "tables": [] }'} />
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
        note='A compact panel whose "Show more" opens the full content in a dialog. children are the compact view, details is the dialog body (mounted only while open). description (text) and actions (controls) show in the panel header and in the dialog. open / onOpenChange.'
      >
        <Variants
          label='with icon, description, actions, footer and dialogSize="default"; bare, dialogSize="full" (default)'
          className="grid items-start sm:grid-cols-2"
        >
          <PanelWithDetails
            title="Companions"
            icon={Users}
            description="120 matches"
            actions={
              <Button variant="outline" size="xs">
                Any mode
              </Button>
            }
            footer="Players you queued with at least 3 times"
            dialogSize="default"
            details={<SkeletonMediaRow rows={6} label="companions" />}
          >
            <SkeletonMediaRow rows={2} />
          </PanelWithDetails>
          <PanelWithDetails
            title="Item builds"
            details={<p className="text-sm text-muted-foreground">Every build, in a wider dialog.</p>}
          >
            <p className="text-sm text-muted-foreground">The three most played builds.</p>
          </PanelWithDetails>
        </Variants>
      </Specimen>

      <Specimen
        name="PanelSection"
        source="patterns/panel/Panel"
        note="A titled strip that divides the rows of a panel or list into groups. Children sit on the trailing edge. Also here: PanelShowMore as a row button."
      >
        <Panel>
          <PanelHeader title="Match history" icon={Layers} />
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
        note="Stand-ins shaped like what is loading. label announces it once; leave it out when a parent already does. Inside a Panel, SkeletonRows sits in a PanelBody."
      >
        <Variants
          label='SkeletonRows: size xs | sm | default, variant "fade" | "solid"'
          className="grid items-start sm:grid-cols-3"
        >
          <SkeletonRows size="xs" rows={4} label="rows" />
          <SkeletonRows size="sm" rows={3} variant="solid" />
          <SkeletonRows rows={3} />
        </Variants>
        <Variants label="SkeletonMediaRow" className="block">
          <SkeletonMediaRow rows={2} />
        </Variants>
        <Variants label="SkeletonStatTiles (steps down with its container)" className="block">
          <SkeletonStatTiles count={6} />
        </Variants>
        <Variants label="SkeletonRows in a PanelBody" className="block">
          <Panel>
            <PanelHeader title="Loading panel" />
            <PanelBody>
              <SkeletonRows rows={3} />
            </PanelBody>
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

const HEAT_DAYS = ["Mon", "Tue", "Wed"];
const HEAT_HOURS = [0, 4, 8, 12, 16, 20];

function HeatGridDemo() {
  const [inspected, setInspected] = useState<number | null>(null);
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <HeatGrid
        label="Matches by weekday and four-hour window"
        columns={HEAT_HOURS.length}
        value={inspected}
        onValueChange={setInspected}
      >
        <HeatGridHead corner="Weekday">
          {HEAT_HOURS.map((hour) => (
            <HeatGridColumn key={hour}>{hour}</HeatGridColumn>
          ))}
        </HeatGridHead>
        <HeatGridBody>
          {HEAT_DAYS.map((day, row) => (
            <HeatGridRow key={day} label={day}>
              {HEAT_HOURS.map((hour, column) => {
                const matches = (row * 5 + column * 3) % 8;
                return (
                  <HeatGridCell
                    key={hour}
                    index={row * HEAT_HOURS.length + column}
                    label={`${day} ${hour}:00, ${matches} matches`}
                    color={
                      matches ? `color-mix(in srgb, var(--positive) ${20 + matches * 10}%, var(--muted))` : undefined
                    }
                    tooltip={column % 2 === 0 ? `${matches} matches` : undefined}
                  />
                );
              })}
            </HeatGridRow>
          ))}
        </HeatGridBody>
      </HeatGrid>
      <span className="text-xs text-muted-foreground">
        {inspected == null ? "Nothing inspected" : `Inspected cell ${inspected}`}
      </span>
    </div>
  );
}

function DataTableSpecimens() {
  const [selected, setSelected] = useState<number[]>([0, 1, 2]);
  return (
    <>
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
        name="HeatGrid"
        source="patterns/data-table/HeatGrid"
        note="Readings over two axes. A real table with row and column headers and role=grid: one tab stop, arrows between cells, Home and End within a row, Control Home or End to the corners, Escape clears the inspected cell. A cell with no reading is hatched. value / onValueChange is the inspected cell."
      >
        <HeatGridDemo />
      </Specimen>

      <Specimen
        name="ComparisonTable"
        source="patterns/data-table/ComparisonTable"
        note="Features down the side, plans across the top, composed from rows and cells. highlightedColumn tints one plan. A cell is a check or a dash."
      >
        <ComparisonTable highlightedColumn={1} className="max-w-2xl">
          <ComparisonHeader>
            <ComparisonColumn>Free</ComparisonColumn>
            <ComparisonColumn>Patron</ComparisonColumn>
          </ComparisonHeader>
          <TableBody>
            <ComparisonRow label="Full API access">
              <ComparisonCell included />
              <ComparisonCell included />
            </ComparisonRow>
            <ComparisonRow label="Dedicated queue with reserved resources, which is a long label that wraps">
              <ComparisonCell />
              <ComparisonCell included />
            </ComparisonRow>
          </TableBody>
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
        name="FilterCell contentClassName"
        source="patterns/filter-bar/FilterCell · FilteredSelectPopover"
        note="FilterCell sizes its popover with contentClassName. FilteredSelectPopover rows are OptionRows (keyboard reachable), its chips are Badges and its trigger a regular Button."
      >
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
        <Variants label="FilteredSelectPopover: empty, some, more than two">
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
