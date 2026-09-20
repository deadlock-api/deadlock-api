import { Volume2 } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { HeroImage } from "~/components/domain/assets/HeroImage";
import { ItemImage } from "~/components/domain/assets/ItemImage";
import { DraggablePortrait, DraftSlotTarget } from "~/components/domain/draft/DraftSlot";
import { AnswerOption } from "~/components/domain/minigames/AnswerOption";
import { PlayButton } from "~/components/domain/minigames/PlayButton";
import { SilhouetteFrame } from "~/components/domain/minigames/SilhouetteFrame";
import { StateFlash } from "~/components/domain/minigames/StateFlash";
import { ChartRegion, ChartStage } from "~/components/patterns/charts/ChartOverlay";
import { PanelSection } from "~/components/patterns/panel/Panel";
import { StaleOverlay } from "~/components/patterns/states/StaleOverlay";
import { Button } from "~/components/ui/button";
import { DetailPopover } from "~/components/ui/detail-popover";
import { DragScroll } from "~/components/ui/drag-scroll";
import { HeatCell } from "~/components/ui/heat-cell";
import { MaskedIcon } from "~/components/ui/masked-icon";
import { TooltipTarget } from "~/components/ui/panel-tooltip";
import { StatusDot } from "~/components/ui/status-dot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TextLink } from "~/components/ui/text-link";
import { Tooltip } from "~/components/ui/tooltip";

const HERO_IDS = [1, 2, 4, 6];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const SCRIM_VARIANTS = ["default", "subtle", "soft", "positive-soft", "negative-soft", "outline"] as const;

function TableGroupStates() {
  return (
    <Table density="compact" className="w-full">
      <TableHeader tone="muted">
        <TableRow>
          <TableHead>Match</TableHead>
          <TableHead className="text-end">Result</TableHead>
        </TableRow>
      </TableHeader>
      {(["current", "selected", "viewed"] as const).map((state) => (
        <TableBody key={state} data-interactive data-state={state}>
          <TableRow data-static>
            <TableCell>{`data-state="${state}"`}</TableCell>
            <TableCell className="text-end">Win</TableCell>
          </TableRow>
          <TableRow data-static>
            <TableCell className="text-muted-foreground">second row of the same record</TableCell>
            <TableCell className="text-end text-muted-foreground">32:14</TableCell>
          </TableRow>
        </TableBody>
      ))}
      <TableBody data-interactive>
        <TableRow data-static>
          <TableCell>plain group, hover it</TableCell>
          <TableCell className="text-end">Loss</TableCell>
        </TableRow>
        <TableRow data-static>
          <TableCell className="text-muted-foreground">both rows light together</TableCell>
          <TableCell className="text-end text-muted-foreground">28:02</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function HeatGrid() {
  const [selected, setSelected] = useState<number | null>(14);
  return (
    <div className="grid w-full grid-cols-12 gap-0.5">
      {HOURS.map((hour) => (
        <HeatCell
          key={hour}
          intensity={Math.abs(Math.sin(hour / 3))}
          selected={selected === hour}
          label={`${String(hour).padStart(2, "0")}:00, ${Math.round(Math.abs(Math.sin(hour / 3)) * 80)} matches`}
          onClick={() => setSelected(hour === selected ? null : hour)}
        />
      ))}
    </div>
  );
}

function DraftRow() {
  const [dragging, setDragging] = useState(false);
  return (
    <>
      <Variants label="empty targets">
        <DraftSlotTarget side="ally" aria-label="Add hero to Amber slot 1" />
        <DraftSlotTarget side="enemy" aria-label="Add hero to Sapphire slot 1" />
        <DraftSlotTarget side="ally" state="over" aria-label="Drop hero here" />
      </Variants>
      <Variants label="filled and dragging">
        <DraggablePortrait title="Infernus" onClick={() => setDragging(!dragging)}>
          <HeroImage heroId={HERO_IDS[0]} shape="circle" className="size-11" />
        </DraggablePortrait>
        <DraggablePortrait dragging title="Haze, being dragged">
          <HeroImage heroId={HERO_IDS[1]} shape="circle" className="size-11" />
        </DraggablePortrait>
      </Variants>
    </>
  );
}

function MiniGameStates() {
  const [playing, setPlaying] = useState(false);
  const [reveal, setReveal] = useState(0);
  return (
    <>
      <Variants label="PlayButton">
        <PlayButton
          state={playing ? "playing" : "idle"}
          label="the mystery sound"
          onClick={() => setPlaying(!playing)}
        />
        <PlayButton size="default" label="the clip" />
        <PlayButton size="default" label="the clip" disabled />
      </Variants>
      <Variants label="SilhouetteFrame" className="items-end">
        <SilhouetteFrame label="Hidden hero">
          <HeroImage heroId={HERO_IDS[2]} className="size-20" />
        </SilhouetteFrame>
        <SilhouetteFrame reveal={reveal} label="Partly revealed hero">
          <HeroImage heroId={HERO_IDS[2]} className="size-20" />
        </SilhouetteFrame>
        <SilhouetteFrame state="revealed" label="Seven">
          <HeroImage heroId={HERO_IDS[2]} className="size-20" />
        </SilhouetteFrame>
        <Button size="sm" variant="outline" onClick={() => setReveal(reveal >= 1 ? 0 : reveal + 0.25)}>
          Reveal more
        </Button>
      </Variants>
      <Variants label="AnswerOption tone (selected state)" className="flex-col items-stretch">
        <AnswerOption state="selected" tone="item-weapon">
          Weapon
        </AnswerOption>
        <AnswerOption state="selected" tone="item-vitality">
          Vitality
        </AnswerOption>
        <AnswerOption state="selected" tone="item-spirit">
          Spirit
        </AnswerOption>
      </Variants>
      <Variants label="StateFlash (fills the viewport when it fires)">
        <span className="text-xs text-muted-foreground">
          <code className="font-mono">{'state="correct" | "wrong"'}</code> washes the whole screen for one beat.
        </span>
        <StateFlash state="none" />
      </Variants>
    </>
  );
}

function StaleTable() {
  const [stale, setStale] = useState(true);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setStale(!stale)}>
        {stale ? "Finish refetch" : "Start refetch"}
      </Button>
      <StaleOverlay active={stale} label="hero stats" className="w-full">
        <Table density="compact" className="w-full">
          <TableHeader tone="muted">
            <TableRow>
              <TableHead>Hero</TableHead>
              <TableHead className="text-end">Win rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Infernus</TableCell>
              <TableCell className="text-end tabular-nums">53.1%</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Haze</TableCell>
              <TableCell className="text-end tabular-nums">48.9%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </StaleOverlay>
    </>
  );
}

/** Round 4, second batch: the props and primitives the feature migration asked for. */
export function Round4Requests2() {
  return (
    <>
      <Specimen
        name="TableBody group states"
        source="ui/table"
        note="Several rows that are one record share their states through the group: `data-interactive` on the TableBody lights every row on hover, and `data-state` marks the record as current, selected or already viewed. `TableRow data-static` drops the per-row hover fill but keeps its rule, which `data-plain` removes."
      >
        <Variants className="items-stretch">
          <TableGroupStates />
        </Variants>
      </Specimen>

      <Specimen
        name="Button text and scrim"
        source="ui/button"
        note='`text` is a name inside a clickable row: it keeps the surrounding type and only recolors, but it is still a button with a focus ring. `scrim="dark"` gives a translucent button something to sit on when it floats over artwork; it is a backdrop drawn behind the label, so every variant keeps its own fill. `aria-disabled` is the unavailable action that stays focusable, so the reader can find out why.'
      >
        <Variants label="text">
          <span className="text-sm">
            Picked by{" "}
            <Button variant="text" size="inline">
              Shroud
            </Button>{" "}
            in this match
          </span>
        </Variants>
        <Variants label="scrim over artwork (each variant keeps its fill)">
          {SCRIM_VARIANTS.map((variant) => (
            <span key={variant} className="relative inline-flex">
              <ItemImage itemId={1} className="size-20 rounded-md" />
              <Button
                variant={variant}
                scrim="dark"
                size="xs"
                className="absolute end-1 bottom-1"
                aria-label={`Add Basic Magazine to the build, ${variant}`}
              >
                Add
              </Button>
            </span>
          ))}
        </Variants>
        <Variants label="the same variants without the scrim">
          {SCRIM_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} size="xs">
              Add
            </Button>
          ))}
        </Variants>
        <Variants label="disabled vs aria-disabled">
          <Button disabled>Disabled</Button>
          <Button aria-disabled="true">Unavailable, still focusable</Button>
        </Variants>
      </Specimen>

      <Specimen
        name="HeroImage ringColor"
        source="domain/assets/HeroImage"
        note="A frame whose color comes from data — the lane, the hero's own color — cannot be a class. `ringColor` draws it as an inset shadow, so the art keeps its full box."
      >
        <Variants>
          <HeroImage heroId={HERO_IDS[0]} shape="circle" className="size-12" ring="positive" />
          <HeroImage heroId={HERO_IDS[1]} shape="circle" className="size-12" ringColor="var(--lane-yellow)" />
          <HeroImage heroId={HERO_IDS[2]} shape="circle" className="size-12" ringColor="var(--lane-blue)" />
          <HeroImage heroId={HERO_IDS[3]} shape="circle" className="size-12" ringColor="var(--lane-purple)" />
        </Variants>
      </Specimen>

      <Specimen
        name="StatusDot ring"
        source="ui/status-dot"
        note="`surface` puts a halo of the page behind the dot, so it stays legible when it sits on artwork or overlaps another image."
      >
        <Variants>
          <StatusDot tone="positive" size="lg" label="Live" />
          <StatusDot tone="positive" size="lg" ring="surface" label="Live on artwork" />
          <span className="relative inline-flex">
            <HeroImage heroId={HERO_IDS[0]} shape="circle" className="size-10" />
            <StatusDot tone="positive" size="lg" ring="surface" className="absolute end-0 bottom-0" label="Online" />
          </span>
        </Variants>
      </Specimen>

      <Specimen
        name="Details affordance"
        source="ui/text-link · ui/detail-popover"
        note='`underline="dotted"` is the one mark for "there is more behind this word": it says the text opens details rather than a page. `TooltipTarget` makes a plain value focusable so its hover card is reachable by keyboard.'
      >
        <Variants>
          <TextLink href="#dotted" tone="inherit" underline="dotted">
            Sample size
          </TextLink>
          <DetailPopover
            label="Sample size"
            size="inline"
            underline="dotted"
            details={<p className="text-xs">412 matches in this bucket.</p>}
          >
            412 matches
          </DetailPopover>
          <Tooltip>
            <TooltipTarget>Hover or tab to this value</TooltipTarget>
          </Tooltip>
        </Variants>
      </Specimen>

      <Specimen
        name="HeatCell"
        source="ui/heat-cell"
        note="One cell of a heat grid. It is a real button, so the grid is reachable by keyboard and every cell is named; the picked cell is ringed as well as filled, because the fill already carries the reading. A cell nothing fills is hatched, so &ldquo;no sample&rdquo; survives a colour-blind eye, and only a cell that is given `selected` claims `aria-pressed` — an ordinary cell is not a toggle."
      >
        <Variants className="items-stretch">
          <HeatGrid />
        </Variants>
        <Variants label="tones and empty">
          <HeatCell intensity={0.8} tone="positive" label="Strong, positive" />
          <HeatCell intensity={0.8} tone="negative" label="Strong, negative" />
          <HeatCell color="var(--chart-3)" label="Straight from a ramp" />
          <HeatCell intensity={null} label="No reading, hatched" />
          <HeatCell intensity={0.6} selected label="Selected" />
        </Variants>
        <Variants label="pattern">
          <HeatCell intensity={null} label="No reading: hatch by default" />
          <HeatCell intensity={null} pattern="none" label="Empty, hatch turned off" />
          <HeatCell intensity={0.35} pattern="hatch" label="A reading the grid marks as provisional" />
        </Variants>
        <Variants label="title is opt-in; the name always comes from label">
          <HeatCell intensity={0.8} title="Tuesday 18:00, 64 matches" label="Tuesday 18:00, 64 matches" />
          <HeatCell intensity={0.8} label="Tuesday 19:00, 61 matches: named, but no native tooltip" />
        </Variants>
      </Specimen>

      <Specimen
        name="PanelSection tone and position"
        source="patterns/panel/Panel"
        note="The strip that groups the rows of a panel. It is translucent by default, so a pinned one takes the panel's own surface instead: rows would otherwise scroll through it."
      >
        <Variants className="items-stretch">
          <div className="max-h-40 w-full overflow-y-auto rounded-lg border">
            <PanelSection title="Today" position="sticky">
              4 matches
            </PanelSection>
            {["Win, 32:14", "Loss, 28:02", "Win, 41:37", "Win, 25:50"].map((row) => (
              <p key={row} className="px-4 py-2 text-sm">
                {row}
              </p>
            ))}
            <PanelSection title="Yesterday" position="sticky">
              3 matches
            </PanelSection>
            {["Loss, 30:11", "Win, 22:45", "Loss, 36:19"].map((row) => (
              <p key={row} className="px-4 py-2 text-sm">
                {row}
              </p>
            ))}
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="StaleOverlay"
        source="patterns/states/StaleOverlay"
        note="Keeps the previous answer on screen while the next one loads, washed out and announced busy. It is the alternative to throwing away what the reader was already reading."
      >
        <Variants className="items-stretch">
          <StaleTable />
        </Variants>
      </Specimen>

      <Specimen
        name="AssetImage emphasis"
        source="domain/assets/AssetImage"
        note="`dim` quiets art that is context rather than the subject: the items a build did not take, the heroes outside the current lane."
      >
        <Variants>
          {[1, 2, 3].map((itemId) => (
            <ItemImage key={itemId} itemId={itemId} className="size-12" />
          ))}
          {[1, 2, 3].map((itemId) => (
            <ItemImage key={`dim-${itemId}`} itemId={itemId} emphasis="dim" className="size-12" />
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="DraftSlot"
        source="domain/draft/DraftSlot"
        note="The two halves of a draft board slot: the round drop target of an empty slot, and the portrait of a filled one that can be picked up. `over` turns the dashed outline solid, so the drop target does not read by color alone."
      >
        <DraftRow />
      </Specimen>

      <Specimen
        name="ChartRegion"
        source="patterns/charts/ChartOverlay"
        note="A tinted area of a plot: the quadrant where both measures are good, the band that is below par. Its edges are percentages of the ChartStage and are logical, and it always carries a label, so the tint is never the only signal."
      >
        <Variants className="items-stretch">
          <ChartStage className="h-40 w-full border">
            <ChartRegion tone="positive" start={50} top={0} bottom={50} label="Picked and winning" />
            <ChartRegion tone="negative" end={50} top={50} bottom={0} label="Rare and losing" />
          </ChartStage>
        </Variants>
      </Specimen>

      <Specimen
        name="MaskedIcon"
        source="ui/masked-icon"
        note="An image used as a glyph: the art becomes a mask and the color comes from the text around it, so one emblem serves every tone."
      >
        <Variants>
          <MaskedIcon src="/favicon.ico" label="Deadlock" className="size-6" />
          <MaskedIcon src="/favicon.ico" label="Deadlock, brand" className="size-6 text-primary" />
          <MaskedIcon src="/favicon.ico" label="Deadlock, quiet" className="size-6 text-muted-foreground" />
        </Variants>
      </Specimen>

      <Specimen
        name="DragScroll"
        source="ui/drag-scroll"
        note="A wide diagram the reader can drag with the pointer. The wheel, the scrollbar and the keyboard keep working, and a drag that moved the content swallows the click that ends it."
      >
        <Variants className="items-stretch">
          <DragScroll className="w-full rounded-lg border p-3">
            <div className="flex w-max items-center gap-2">
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i} className="flex size-12 shrink-0 items-center justify-center rounded-md border text-xs">
                  {i + 1}
                </span>
              ))}
            </div>
          </DragScroll>
        </Variants>
      </Specimen>

      <Specimen
        name="Mini-game states"
        source="domain/minigames"
        note="The round media button of a sound round, the silhouette a picture round reveals, the category tones of an answer, and the flash that answers a guess. Every one of them says the same thing in a glyph or a word as well as in color."
      >
        <MiniGameStates />
      </Specimen>

      <Specimen
        name="Play a sound"
        source="domain/minigames/PlayButton"
        note="The one control of a sound round: large, round, and lit while it plays. The glyph changes with the state, so the glow never has to carry it alone."
      >
        <Variants>
          <PlayButton label="the mystery sound" />
          <PlayButton state="playing" label="the mystery sound" />
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Volume2 aria-hidden="true" className="size-4" />
            Round 3 of 8
          </span>
        </Variants>
      </Specimen>
    </>
  );
}
