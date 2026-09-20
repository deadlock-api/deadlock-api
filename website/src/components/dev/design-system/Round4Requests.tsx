import { MessageSquare } from "lucide-react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { SelectionBox } from "~/components/ui/selection-box";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";

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

/** Round 4: the props the feature migration asked for. */
export function Round4Requests() {
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
