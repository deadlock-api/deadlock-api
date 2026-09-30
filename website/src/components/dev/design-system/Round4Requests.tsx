import { MessageSquare } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { moveItem, useReorder } from "~/components/ui/hooks/use-reorder";
import { Input } from "~/components/ui/input";
import { PixelImage, PixelStage } from "~/components/ui/pixel-stage";
import { ReorderHandle, ReorderItem } from "~/components/ui/reorder-handle";
import { SelectionBox } from "~/components/ui/selection-box";
import { SharePreview } from "~/components/ui/share-preview";
import { SliderField } from "~/components/ui/slider-field";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table";

// A real crosshair render from the API (red pips at 1080p), copied from its test fixtures.
import crosshairSample from "./crosshair-sample.png";

const PIXEL_BACKDROPS = ["game", "neutral", "light", "dark"] as const;

const TEXT_SIZES = ["xs", "sm", "default", "lg"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

const ROWS = [
  { hero: "Infernus", matches: 84120 },
  { hero: "Haze", matches: 107903 },
  { hero: "Seven", matches: 92377 },
  { hero: "Paradox", matches: 37490 },
  { hero: "Lash", matches: 51204 },
  { hero: "Vindicta", matches: 66815 },
];

function HeroRows() {
  return ROWS.map((row) => (
    <TableRow key={row.hero}>
      <TableCell>{row.hero}</TableCell>
      <TableCell className="text-end tabular-nums">{row.matches.toLocaleString("en-US")}</TableCell>
    </TableRow>
  ));
}

/** A row of names that reorder by drag or arrow keys, for the ReorderHandle specimen. */
function ReorderDemo() {
  const [names, setNames] = useState(["Infernus", "Haze", "Seven", "Paradox"]);
  const reorder = useReorder({
    count: names.length,
    itemLabel: (index) => names[index],
    onMove: (from, to) => setNames((current) => moveItem(current, from, to)),
  });
  return (
    <div className="flex flex-wrap gap-3">
      {names.map((name, index) => (
        <ReorderHandle key={name} aria-label={`Move ${name}`} {...reorder.itemProps(index)}>
          <span>{name}</span>
        </ReorderHandle>
      ))}
      <span className="sr-only" aria-live="polite">
        {reorder.announcement}
      </span>
    </div>
  );
}

/** Cards that reorder as boxes: `boxProps` on each ReorderItem previews the drop while dragging. */
function ReorderBoxDemo() {
  const [names, setNames] = useState(["Infernus", "Haze", "Seven", "Paradox"]);
  const reorder = useReorder({
    count: names.length,
    itemLabel: (index) => names[index],
    onMove: (from, to) => setNames((current) => moveItem(current, from, to)),
  });
  return (
    <div className="grid grid-cols-2 gap-3 @md:grid-cols-4">
      {names.map((name, index) => (
        <ReorderItem key={name} asChild {...reorder.boxProps(index)}>
          <Card size="sm">
            <CardContent>
              <ReorderHandle aria-label={`Move ${name}`} {...reorder.itemProps(index)}>
                <span>{name}</span>
              </ReorderHandle>
            </CardContent>
          </Card>
        </ReorderItem>
      ))}
    </div>
  );
}

/** Round 4: the props the feature migration asked for. */
export function Round4Requests() {
  const [previewCopied, setPreviewCopied] = useState(false);
  return (
    <>
      <Specimen
        name="TableHeader tone and position"
        source="ui/table"
        note={`\`tone\` fills the head row; \`position="sticky"\` pins it to the top of the table's own scroll container and defaults the tone to \`card\`, because a translucent head lets the rows scroll through it. The fill lands on the cells, not on the section, so a pinned identity column keeps it.`}
      >
        <Variants label='tone="muted"' className="items-stretch">
          <Table density="compact" className="w-full">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead>Hero</TableHead>
                <TableHead className="text-end">Matches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <HeroRows />
            </TableBody>
          </Table>
        </Variants>
        <Variants label='position="sticky" (scroll the block)' className="items-stretch">
          <div className="max-h-40 w-full overflow-y-auto rounded-lg border">
            <Table density="compact" className="w-full">
              <TableHeader position="sticky">
                <TableRow>
                  <TableHead>Hero</TableHead>
                  <TableHead className="text-end">Matches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <HeroRows />
                <HeroRows />
              </TableBody>
            </Table>
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="Table width"
        source="ui/table"
        note={`\`width="fill"\` (default) spreads the columns over the container. \`width="hug"\` sizes them to their content, so a table of two or three columns keeps its values next to their labels in a wide panel; it still scrolls sideways when the container is narrower. \`height="fill"\` grows a table to a stretched panel (a flex column), its rows sharing the extra height, so a panel beside taller ones ends level without empty space under the table.`}
      >
        <Variants label='width="fill"' className="items-stretch">
          <Table density="dense">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead>Hero</TableHead>
                <TableHead className="text-end">Matches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <HeroRows />
            </TableBody>
          </Table>
        </Variants>
        <Variants label='width="hug"' className="items-stretch">
          <Table density="dense" width="hug">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead>Hero</TableHead>
                <TableHead className="text-end">Matches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <HeroRows />
            </TableBody>
          </Table>
        </Variants>
        <Variants label='height="fill" in a taller panel' className="items-stretch">
          <Card size="flush" className="h-64">
            <Table density="dense" height="fill">
              <TableHeader tone="muted">
                <TableRow>
                  <TableHead>Hero</TableHead>
                  <TableHead className="text-end">Matches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <HeroRows />
              </TableBody>
            </Table>
          </Card>
        </Variants>
      </Specimen>

      <Specimen
        name="TableFooter"
        source="ui/table"
        note="The result rows under the body: a total, a tally. Ruled off from the body, no stripe, no hover fill. tone highlight makes it the table's result: a brand rule and tint, the pinned cell included."
      >
        <Variants label='tone="default", tone="highlight"' className="items-start">
          <Table density="dense" width="hug">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead>Hero</TableHead>
                <TableHead className="text-end">Matches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <HeroRows />
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-end tabular-nums">
                  {ROWS.reduce((sum, row) => sum + row.matches, 0).toLocaleString("en-US")}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <Table density="dense" width="hug">
            <TableHeader tone="muted">
              <TableRow>
                <TableHead data-pinned>Hero</TableHead>
                <TableHead className="text-end">Matches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <HeroRows />
            </TableBody>
            <TableFooter tone="highlight">
              <TableRow>
                <TableCell data-pinned>Total</TableCell>
                <TableCell className="text-end tabular-nums">
                  {ROWS.reduce((sum, row) => sum + row.matches, 0).toLocaleString("en-US")}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Variants>
      </Specimen>

      <Specimen
        name="SharePreview"
        source="ui/share-preview"
        note="A share image that is its own copy button: full width at its aspect ratio, it presses in on click, and while state is confirmed it rings in the brand color with the confirmation over it. The parent copies and owns the state, so a separate button can confirm through the same image. A skeleton holds the space until the image has loaded, and again when src changes. Click it."
      >
        <Variants label='state="idle", then "confirmed" for two seconds' className="items-stretch">
          <div className="w-96 max-w-full">
            <SharePreview
              src="/og/v2/default.png"
              width={1200}
              height={630}
              aria-label="Copy the link"
              state={previewCopied ? "confirmed" : "idle"}
              onClick={() => {
                setPreviewCopied(true);
                setTimeout(() => setPreviewCopied(false), 2000);
              }}
            />
          </div>
        </Variants>
        <Variants label='fit="contain" in a wide, short size container' className="items-stretch">
          <div className="@container-size flex h-32 w-96 max-w-full items-center justify-center">
            <SharePreview src="/og/v2/default.png" width={1200} height={630} aria-label="Copy the link" fit="contain" />
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="PixelStage"
        source="ui/pixel-stage"
        note="A backdrop that stands in for the game world behind small HUD art, with a PixelImage centred on it. backdrop: neutral (mid grey, the default, where light and dark art both show), light and dark (each art's worst case). PixelImage draws the art at a whole multiple of its size with every pixel a crisp square; scale 1 is its true size. It shrinks to fit a narrow stage instead of scrolling."
      >
        {PIXEL_BACKDROPS.map((backdrop) => (
          <Variants key={backdrop} label={`backdrop="${backdrop}", scale 1, 4 and 8`}>
            {[1, 4, 8].map((scale) => (
              <PixelStage key={scale} backdrop={backdrop}>
                <PixelImage src={crosshairSample} scale={scale} alt={`A crosshair at ${scale}× its true size`} />
              </PixelStage>
            ))}
          </Variants>
        ))}
        <Variants label="scale 8 in a stage narrower than the art: it shrinks to fit">
          <PixelStage className="w-24">
            <PixelImage src={crosshairSample} scale={8} alt="The crosshair enlarged, fit to a narrow stage" />
          </PixelStage>
        </Variants>
        <Variants label='size="sm": a thumbnail beside a list row'>
          {PIXEL_BACKDROPS.map((backdrop) => (
            <PixelStage key={backdrop} size="sm" backdrop={backdrop}>
              <PixelImage src={crosshairSample} alt={`A crosshair thumbnail on the ${backdrop} backdrop`} />
            </PixelStage>
          ))}
        </Variants>
        <Variants label="zero props: an empty neutral stage">
          <PixelStage />
        </Variants>
      </Specimen>

      <Specimen
        name="SliderField"
        source="ui/slider-field"
        note="One number on a Slider, labelled above with its value at the trailing end. format sets how the value reads and is what the thumb announces."
      >
        <SliderFieldDemo />
      </Specimen>

      <Specimen
        name="ReorderHandle"
        source="ui/reorder-handle + ui/hooks/use-reorder"
        note="The part of an item you grab to move it. useReorder (count, onMove(from, to), axis, itemLabel) gives each handle its props: drag it by mouse, touch or pen over another item and release to move it there, or focus it and press the arrow keys to move it one place. Handles alone: the dragged one dims and the drop target rings in primary. With boxProps on a ReorderItem around each item, the dragged box lifts and follows the pointer and the others slide to where they would land. The announcement goes in a polite live region. Try it."
      >
        <Variants label="Drag a name, or focus one and press ← →">
          <ReorderDemo />
        </Variants>
        <Variants label="ReorderItem boxes: the dragged card follows the pointer, the others make room">
          <ReorderBoxDemo />
        </Variants>
      </Specimen>

      <Specimen
        name="Input spinners"
        source="ui/input"
        note={`Only for \`type="number"\`: \`hidden\` drops the browser's own stepper for a field that has stepper buttons of its own. The keyboard arrows keep working in both.`}
      >
        <Variants className="items-start">
          <Input type="number" aria-label="Native stepper" defaultValue={30} className="w-32" />
          <Input type="number" spinners="hidden" aria-label="No stepper" defaultValue={30} className="w-32" />
        </Variants>
      </Specimen>

      <Specimen
        name="Button elevation"
        source="ui/button"
        note="`raised` lifts a button that floats over the page instead of sitting in a row of controls: a feedback launcher, a back-to-top. Buttons inside a surface stay flat. `shape` owns the radius, so a pill is round at every size."
      >
        <Variants>
          <Button>Flat</Button>
          <Button elevation="raised">Raised</Button>
          <Button elevation="raised" shape="pill" size="icon-lg" aria-label="Send feedback">
            <MessageSquare />
          </Button>
        </Variants>
        <Variants label='shape="pill" at every size'>
          {TEXT_SIZES.map((size) => (
            <Button key={size} shape="pill" size={size}>
              {size}
            </Button>
          ))}
        </Variants>
        <Variants label='shape="pill", icon sizes'>
          {ICON_SIZES.map((size) => (
            <Button key={size} shape="pill" size={size} aria-label={`Send feedback, ${size}`}>
              <MessageSquare />
            </Button>
          ))}
        </Variants>
        <Variants label='shape="default" at the same sizes'>
          {TEXT_SIZES.map((size) => (
            <Button key={size} size={size} variant="outline">
              {size}
            </Button>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="SelectionBox"
        source="ui/selection-box"
        note="The highlight drawn over an arbitrary element while the reader picks one. Position and size are measured geometry and arrive through `style`; the state carries the look. The marquee's dashed border keeps the three apart without color."
      >
        <Variants className="items-stretch">
          <div className="relative h-40 w-full rounded-lg border border-dashed">
            <SelectionBox
              state="selected"
              label="main > section.stats"
              style={{ insetInlineStart: "1.5rem", top: "2.5rem", width: "11rem", height: "4rem" }}
            />
            <SelectionBox
              state="hovered"
              label="aside.filters"
              labelPosition="below"
              style={{ insetInlineStart: "14rem", top: "0.5rem", width: "8rem", height: "3rem" }}
            />
            <SelectionBox
              state="marquee"
              style={{ insetInlineStart: "14rem", top: "5.5rem", width: "10rem", height: "3.5rem" }}
            />
          </div>
        </Variants>
      </Specimen>
    </>
  );
}

function SliderFieldDemo() {
  const [size, setSize] = useState(4);
  const [opacity, setOpacity] = useState(0.7);
  return (
    <Variants label="an integer, a percentage, and disabled">
      <SliderField label="Dot size" min={0} max={20} value={size} onValueChange={setSize} className="w-64" />
      <SliderField
        label="Opacity"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onValueChange={setOpacity}
        format={(value) => `${Math.round(value * 100)}%`}
        className="w-64"
      />
      <SliderField label="Gap" min={0} max={10} value={3} onValueChange={() => {}} disabled className="w-64" />
    </Variants>
  );
}
