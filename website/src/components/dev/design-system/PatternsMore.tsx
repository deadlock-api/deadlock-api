import { useQuery } from "@tanstack/react-query";
import { BarChart3, Crown, Home, Swords, Users } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import {
  FilteredSelectList,
  FilteredSelectOption,
  FilteredSelectPopover,
} from "~/components/patterns/filter-bar/FilteredSelectPopover";
import { SideNav, SideNavFooter, SideNavGroup, SideNavItem } from "~/components/patterns/navigation/SideNav";
import { PageShell } from "~/components/patterns/page/PageShell";
import { ChunkErrorBoundary } from "~/components/patterns/states/ChunkErrorBoundary";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { QueryRenderer } from "~/components/patterns/states/QueryRenderer";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Stat, StatGroup } from "~/components/ui/stat";

const DENSITIES = ["data", "content", "marketing"] as const;
/** Each PageShell width as a share of a 1600px app panel. */
const WIDTHS = [
  { width: "full", limit: "w-full", share: 100 },
  { width: "wide", limit: "max-w-5xl (1024px)", share: 64 },
  { width: "prose", limit: "max-w-4xl (896px)", share: 56 },
  { width: "narrow", limit: "max-w-xl (576px)", share: 36 },
] as const;

function Block({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-subtle px-2 py-1.5 text-center text-2xs text-muted-foreground">
      {children}
    </div>
  );
}

export function PageShellSpecimen() {
  return (
    <Specimen
      name="PageShell"
      source="patterns/page/PageShell"
      note="The outermost element of every route. It owns page width and the gap between blocks, so blocks carry no outer margins."
    >
      <Variants label="density: the gap between top-level blocks" className="grid items-start sm:grid-cols-3">
        {DENSITIES.map((density) => (
          <Card key={density} tone="inset" size="xs">
            <CardContent>
              <PageShell density={density}>
                <Block>density="{density}"</Block>
                <Block>FilterBar</Block>
                <Block>Section</Block>
              </PageShell>
            </CardContent>
          </Card>
        ))}
      </Variants>
      <Variants label="width: drawn to scale against a 1600px app panel" className="block">
        <Card tone="inset" size="xs">
          <CardContent className="flex flex-col gap-1.5">
            {WIDTHS.map(({ width, limit, share }) => (
              <div key={width} className="mx-auto w-full min-w-40" style={{ maxWidth: `${share}%` }}>
                <Block>
                  width="{width}" · {limit}
                </Block>
              </div>
            ))}
          </CardContent>
        </Card>
      </Variants>
      <Variants label='height="viewport"' className="block text-xs text-muted-foreground">
        Fills the viewport (100dvh minus the app padding) for a page whose main block is a canvas or a map. Not rendered
        here: see /community/heatmap.
      </Variants>
    </Specimen>
  );
}

export function SideNavSpecimen() {
  const [current, setCurrent] = useState("heroes");
  const link = (id: string, active: string, select: (id: string) => void) => ({
    href: "#sidenav",
    active: active === id,
    onClick: (event: React.MouseEvent) => {
      event.preventDefault();
      select(id);
    },
  });
  const item = (id: string) => link(id, current, setCurrent);

  return (
    <>
      <Specimen
        name="SideNav"
        source="patterns/navigation/SideNav"
        note="A vertical list of links: the app sidebar, or the index of a long page such as this one. Router links go through asChild; active sets aria-current. When it scrolls, the active item is kept in view and an edge with more links past it fades out (scroll-fade-y)."
      >
        <Variants className="items-start gap-6">
          <div className="flex w-60 flex-col gap-1.5">
            <span className="eyebrow">default, groups, highlight, footer</span>
            <div className="overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
              <SideNav aria-label="SideNav example" className="p-2">
                <SideNavGroup>
                  <SideNavItem {...item("home")}>
                    <Home /> Home
                  </SideNavItem>
                </SideNavGroup>
                <SideNavGroup label="Analytics">
                  <SideNavItem {...item("heroes")}>
                    <Swords /> Heroes
                  </SideNavItem>
                  <SideNavItem {...item("players")}>
                    <Users /> Players
                  </SideNavItem>
                  <SideNavItem {...item("games")}>
                    <BarChart3 /> Games
                  </SideNavItem>
                </SideNavGroup>
                <SideNavGroup>
                  <SideNavItem variant="highlight" {...item("patron")}>
                    <Crown /> variant="highlight"
                  </SideNavItem>
                </SideNavGroup>
              </SideNav>
              <SideNavFooter className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                SideNavFooter
                <Button variant="soft" size="xs">
                  Support us
                </Button>
              </SideNavFooter>
            </div>
          </div>
          <div className="flex w-60 flex-col gap-1.5">
            <span className="eyebrow">overflowing: the edges fade while more is past them</span>
            <div className="flex h-48 flex-col overflow-hidden rounded-lg border border-sidebar-border bg-sidebar">
              <SideNav aria-label="Scrolling SideNav example" className="flex-1 overflow-y-auto p-2">
                {["Analytics", "Community", "Tools"].map((group) => (
                  <SideNavGroup key={group} label={group}>
                    <SideNavItem {...item(`${group}-heroes`)}>
                      <Swords /> Heroes
                    </SideNavItem>
                    <SideNavItem {...item(`${group}-players`)}>
                      <Users /> Players
                    </SideNavItem>
                    <SideNavItem {...item(`${group}-games`)}>
                      <BarChart3 /> Games
                    </SideNavItem>
                  </SideNavGroup>
                ))}
              </SideNav>
            </div>
          </div>
        </Variants>
      </Specimen>
    </>
  );
}

const REGIONS = [
  { id: 1, name: "Europe" },
  { id: 2, name: "North America" },
  { id: 3, name: "South America" },
  { id: 4, name: "Asia" },
  { id: 5, name: "Oceania" },
  { id: 6, name: "Rest of world" },
];

export function FilteredSelectPopoverSpecimen() {
  const [selected, setSelected] = useState([1, 2]);
  const [listed, setListed] = useState<number[]>([]);

  return (
    <Specimen
      name="FilteredSelectPopover"
      source="patterns/filter-bar/FilteredSelectPopover"
      note="Multi-select of entities by id: chips in the trigger (five, then +n), a checkbox list with select-all in the popover. FilteredSelectList is the same list without the popover."
    >
      <Variants className="items-start gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">FilteredSelectPopover</span>
          <FilteredSelectPopover value={selected} onValueChange={setSelected} emptyLabel="Select regions…">
            {REGIONS.map((region) => (
              <FilteredSelectOption key={region.id} value={region.id}>
                {region.name}
              </FilteredSelectOption>
            ))}
          </FilteredSelectPopover>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">FilteredSelectList</span>
          <Card size="xs" className="w-56">
            <CardContent>
              <FilteredSelectList value={listed} onValueChange={setListed}>
                {REGIONS.slice(0, 3).map((region) => (
                  <FilteredSelectOption key={region.id} value={region.id}>
                    {region.name}
                  </FilteredSelectOption>
                ))}
              </FilteredSelectList>
            </CardContent>
          </Card>
        </div>
      </Variants>
    </Specimen>
  );
}

type Summary = { matches: number; winRate: number };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function SummaryStats({ data }: { data: Summary }) {
  return (
    <StatGroup variant="plain" size="sm" className="grid-cols-2">
      <Stat label="Matches" value={data.matches.toLocaleString("en-US")} />
      <Stat label="Win rate" value={`${(data.winRate * 100).toFixed(1)}%`} />
    </StatGroup>
  );
}

export function QueryRendererSpecimen() {
  const pending = useQuery<Summary>({
    queryKey: ["dev-design-system", "pending"],
    queryFn: () => new Promise(() => {}),
  });
  const failed = useQuery<Summary>({
    queryKey: ["dev-design-system", "failed"],
    queryFn: async () => {
      await wait(800);
      throw new Error("503 Service Unavailable (simulated)");
    },
    retry: false,
  });
  const loaded = useQuery<Summary>({
    queryKey: ["dev-design-system", "loaded"],
    queryFn: async () => ({ matches: 84120, winRate: 0.524 }),
  });

  return (
    <Specimen
      name="QueryRenderer"
      source="patterns/states/QueryRenderer"
      note="Turns a useQuery result into UI: LoadingState while pending, ErrorState with a retry on failure, children with the data. loadingFallback and errorFallback replace the defaults; keepDataOnError keeps stale data through a failed refresh."
    >
      <Variants className="grid items-stretch md:grid-cols-3">
        <Card size="sm">
          <CardContent className="flex flex-col gap-2">
            <span className="eyebrow">pending</span>
            <QueryRenderer query={pending}>{(data) => <SummaryStats data={data} />}</QueryRenderer>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col gap-2">
            <span className="eyebrow">error (retry fails again)</span>
            <QueryRenderer query={failed}>{(data) => <SummaryStats data={data} />}</QueryRenderer>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex flex-col gap-2">
            <span className="eyebrow">success</span>
            <QueryRenderer query={loaded}>{(data) => <SummaryStats data={data} />}</QueryRenderer>
          </CardContent>
        </Card>
      </Variants>
      <Variants label="loadingFallback" className="block max-w-xs">
        <QueryRenderer
          query={pending}
          loadingFallback={<LoadingState variant="skeleton" label="summary" className="h-12" />}
        >
          {(data) => <SummaryStats data={data} />}
        </QueryRenderer>
      </Variants>
    </Specimen>
  );
}

function ThrowOnDemand() {
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error("Simulated chunk load failure");
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 text-sm">
      Lazy content renders normally.
      <Button variant="destructive-soft" size="sm" onClick={() => setFailed(true)}>
        Throw while rendering
      </Button>
    </div>
  );
}

export function ChunkErrorBoundarySpecimen() {
  return (
    <Specimen
      name="ChunkErrorBoundary"
      source="patterns/states/ChunkErrorBoundary"
      note="Wraps a lazy() chunk together with its Suspense. When the chunk fails to load after a deploy, only this block is replaced and offers a reload. The fallback has no reset: reload to see the child again."
    >
      <Card size="flush" className="max-w-md">
        <ChunkErrorBoundary>
          <ThrowOnDemand />
        </ChunkErrorBoundary>
      </Card>
    </Specimen>
  );
}
