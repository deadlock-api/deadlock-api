import { Link } from "@tanstack/react-router";
import {
  BarChart3Icon,
  CheckIcon,
  GlobeIcon,
  LayersIcon,
  MailIcon,
  SwordsIcon,
  TriangleAlertIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { CopyButton } from "~/components/ui/copy-button";
import { Delta } from "~/components/ui/delta";
import { Field } from "~/components/ui/field";
import { Heading } from "~/components/ui/heading";
import { IconTile } from "~/components/ui/icon-tile";
import { Input } from "~/components/ui/input";
import { OptionRow } from "~/components/ui/option-row";
import { ProgressBar, ProgressBarSegment, ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { DivergingBar } from "~/components/ui/rate-bar";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Slider } from "~/components/ui/slider";
import { SortButton } from "~/components/ui/sort-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";

const TILE_TONES = ["muted", "primary", "positive", "negative", "warning", "info"] as const;
const TILE_SIZES = ["xs", "sm", "default", "lg"] as const;
const SCOREBOARD = [
  { hero: "Infernus", damage: 41_200, souls: 38_400 },
  { hero: "Paradox", damage: 28_900, souls: 44_100 },
  { hero: "Dynamo", damage: 12_300, souls: 29_800 },
];
const NOTE_LIMIT = 80;

function SteamGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146V8.91a4.528 4.528 0 0 1 4.524-4.524 4.528 4.528 0 0 1 4.524 4.524 4.528 4.528 0 0 1-4.524 4.524h-.105l-4.08 2.911c0 .052.004.105.004.158a3.39 3.39 0 0 1-3.39 3.393 3.396 3.396 0 0 1-3.349-2.878L.533 15.34A11.98 11.98 0 0 0 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
    </svg>
  );
}

function FieldExamples() {
  const [steamId, setSteamId] = useState("not-a-number");
  const [note, setNote] = useState("Carried the mid lane.");
  const invalid = !/^\d*$/.test(steamId);
  return (
    <>
      <Variants label="icon, description" className="items-start gap-6">
        <Field
          label="Email"
          icon={<MailIcon />}
          htmlFor="r3-field-email"
          description="Only used to send the export."
          className="w-64"
        >
          <Input id="r3-field-email" type="email" placeholder="you@example.com" />
        </Field>
        <Field
          label="Background opacity"
          description="A group control is described by this line itself."
          className="w-64"
        >
          <Slider aria-label="Background opacity" defaultValue={[60]} min={0} max={100} />
        </Field>
      </Variants>
      <Variants label="error (replaces the description, role=alert), counter" className="items-start gap-6">
        <Field
          label="Steam ID"
          icon={<UserIcon />}
          htmlFor="r3-field-steam"
          description="The number from your profile URL."
          error={invalid && "A Steam ID contains digits only."}
          className="w-64"
        >
          <Input id="r3-field-steam" value={steamId} onChange={(event) => setSteamId(event.target.value)} />
        </Field>
        <Field
          label="Note"
          htmlFor="r3-field-note"
          description="Shown on the match."
          error={note.length > NOTE_LIMIT && "The note is too long."}
          counter={`${note.length} / ${NOTE_LIMIT}`}
          className="w-64"
        >
          <Textarea id="r3-field-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </Variants>
      <Variants label="horizontal: the message wraps under the row">
        <Field
          orientation="horizontal"
          label="Min. matches"
          htmlFor="r3-field-min"
          description="Rows below it are hidden."
        >
          <Input id="r3-field-min" size="sm" type="number" defaultValue={50} className="w-24" />
        </Field>
      </Variants>
    </>
  );
}

function NestedTabsExample() {
  return (
    <Tabs defaultValue="install" className="max-w-xl">
      <TabsList variant="nav" aria-label="Outer, horizontal nav">
        <TabsTrigger value="install">Install</TabsTrigger>
        <TabsTrigger value="usage">Usage</TabsTrigger>
      </TabsList>
      <TabsContent value="install" className="pt-2">
        <Tabs defaultValue="claude" orientation="vertical" className="gap-6">
          <TabsList variant="line" aria-label="Inner, vertical line">
            <TabsTrigger value="claude">Claude</TabsTrigger>
            <TabsTrigger value="cursor">Cursor</TabsTrigger>
            <TabsTrigger value="vscode">VS Code</TabsTrigger>
          </TabsList>
          <TabsContent value="claude" className="text-sm text-muted-foreground">
            <Tabs defaultValue="mac">
              <TabsList aria-label="Innermost, horizontal default">
                <TabsTrigger value="mac">macOS</TabsTrigger>
                <TabsTrigger value="win">Windows</TabsTrigger>
              </TabsList>
              <TabsContent value="mac">Each level keeps its own orientation and variant.</TabsContent>
              <TabsContent value="win">The inner indicator sits on the right edge of the vertical list.</TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="cursor" className="text-sm text-muted-foreground">
            Cursor steps.
          </TabsContent>
          <TabsContent value="vscode" className="text-sm text-muted-foreground">
            VS Code steps.
          </TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="usage" className="pt-2 text-sm text-muted-foreground">
        <Tabs defaultValue="rest">
          <TabsList variant="line" aria-label="Inner, horizontal line">
            <TabsTrigger value="rest">REST</TabsTrigger>
            <TabsTrigger value="graphql">GraphQL</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="rest">REST usage.</TabsContent>
          <TabsContent value="graphql">GraphQL usage.</TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}

export function Round3PrimitivesMore() {
  const [region, setRegion] = useState("eu");
  const maxDamage = Math.max(...SCOREBOARD.map((row) => row.damage));
  const maxSouls = Math.max(...SCOREBOARD.map((row) => row.souls));
  return (
    <>
      <Specimen
        name="Button additions"
        source="ui/button"
        note='size="inline" is for variant="link" inside a sentence: no box, the type size around it. warning-soft and info-soft complete the soft tones. steam is the Steam sign-in button only.'
      >
        <Variants label='variant="link" size="inline"'>
          <p className="text-sm text-muted-foreground">
            Nothing here yet.{" "}
            <Button variant="link" size="inline">
              Reset the filters
            </Button>{" "}
            or{" "}
            <Button asChild variant="link" size="inline">
              <Link to="/dev/design-system">browse everything</Link>
            </Button>
            .
          </p>
          <p className="text-xs text-muted-foreground">
            In small print:{" "}
            <Button variant="link" size="inline">
              show more
            </Button>
          </p>
        </Variants>
        <Variants label="warning-soft, info-soft">
          <Button variant="warning-soft">
            <TriangleAlertIcon /> Archive
          </Button>
          <Button variant="info-soft">About this data</Button>
          <Button variant="warning-soft" size="sm">
            sm
          </Button>
          <Button variant="info-soft" size="xs">
            xs
          </Button>
          <Button variant="warning-soft" disabled>
            Disabled
          </Button>
        </Variants>
        <Variants label="steam">
          <Button variant="steam" size="lg">
            <SteamGlyph /> Sign in through Steam
          </Button>
          <Button variant="steam">
            <SteamGlyph /> Sign in through Steam
          </Button>
          <Button variant="steam" disabled>
            <SteamGlyph /> Disabled
          </Button>
        </Variants>
      </Specimen>

      <Specimen
        name="Badge circle"
        source="ui/badge"
        note='shape="circle": a fixed disc for a step number or a rank, one or two characters.'
      >
        <Variants label="size default">
          {(["soft", "default", "muted", "outline", "positive", "negative"] as const).map((variant, index) => (
            <Badge key={variant} variant={variant} shape="circle">
              {index + 1}
            </Badge>
          ))}
        </Variants>
        <Variants label="size sm">
          <Badge variant="soft" shape="circle" size="sm">
            1
          </Badge>
          <Badge variant="positive" shape="circle" size="sm">
            <CheckIcon />
          </Badge>
        </Variants>
        <ol className="flex flex-col gap-2 text-sm">
          {["Open the settings", "Paste the URL"].map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <Badge variant="soft" shape="circle">
                {index + 1}
              </Badge>
              {step}
            </li>
          ))}
        </ol>
      </Specimen>

      <Specimen
        name="Field messages"
        source="ui/field"
        note="icon leads the label; description sits under the control; error replaces it in the destructive tone and is announced; counter sits on the trailing edge. Input and Textarea take aria-describedby and aria-invalid from the Field around them."
      >
        <FieldExamples />
      </Specimen>

      <Specimen
        name="IconTile variants"
        source="ui/icon-tile"
        note='tone, size and shape; hover="card" tints the tile while the pressable Card around it is hovered or focused.'
      >
        <Variants label="tone">
          {TILE_TONES.map((tone) => (
            <IconTile key={tone} tone={tone} title={tone}>
              <BarChart3Icon />
            </IconTile>
          ))}
        </Variants>
        <Variants label="size × shape">
          {TILE_SIZES.map((size) => (
            <IconTile key={size} size={size} tone="primary">
              <SwordsIcon />
            </IconTile>
          ))}
          {TILE_SIZES.map((size) => (
            <IconTile key={size} size={size} shape="circle" tone="primary">
              <SwordsIcon />
            </IconTile>
          ))}
        </Variants>
        <Variants label='hover="card", inside a Card with interaction="pressable" (hover or focus the card)'>
          <Card asChild interaction="pressable" size="sm" className="w-64">
            <a href="#icontile-variants" aria-label="Item analytics">
              <CardContent className="flex items-center gap-3">
                <IconTile hover="card">
                  <LayersIcon />
                </IconTile>
                <span className="text-sm font-medium">Item analytics</span>
              </CardContent>
            </a>
          </Card>
        </Variants>
      </Specimen>

      <Specimen
        name="Card floating and radius"
        source="ui/card"
        note='tone="floating" is a widget that floats over content it does not belong to (a map legend, a graph toolbar). radius steps the corners of a nested surface down: lg inside a card, md inside that.'
      >
        <Variants label='tone="floating" over content'>
          <div className="relative h-36 w-full max-w-md overflow-hidden rounded-lg border bg-muted">
            <p className="p-3 text-sm text-muted-foreground">
              Content under the widget: a map, a graph, a long table. It stays faintly visible through the blur.
            </p>
            <Card tone="floating" size="xs" radius="lg" className="absolute end-2 bottom-2 w-40">
              <CardContent className="flex flex-col gap-1 text-xs">
                <span className="eyebrow">Legend</span>
                <span>Floating widget</span>
              </CardContent>
            </Card>
          </div>
        </Variants>
        <Variants label="radius: default, lg, md (nested flush surfaces)" className="items-start">
          <Card size="sm" className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Outer card</CardTitle>
              <CardDescription>radius default (xl)</CardDescription>
            </CardHeader>
            <CardContent>
              <Card size="flush" tone="inset" radius="lg">
                <CardHeader>
                  <CardTitle>Nested, flush</CardTitle>
                  <CardDescription>radius lg</CardDescription>
                </CardHeader>
                <CardContent className="p-3">
                  <Card size="flush" tone="outline" radius="md">
                    <CardContent className="p-2 text-xs text-muted-foreground">Innermost, radius md</CardContent>
                  </Card>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </Variants>
      </Specimen>

      <Specimen
        name="Card accent and outline"
        source="ui/card"
        note='accent draws a stripe in a data color along the top edge, to tie a card to its group. tone="outline" is a border and nothing else, for a tile inside a Card or Panel.'
      >
        <Variants className="items-stretch">
          {(["var(--item-weapon)", "var(--item-vitality)", "var(--item-spirit)"] as const).map((accent) => (
            <Card key={accent} size="xs" accent={accent} className="w-36">
              <CardContent className="text-xs text-muted-foreground">accent={accent}</CardContent>
            </Card>
          ))}
          <Card size="xs" className="w-48">
            <CardContent className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">A card holding outline tiles</span>
              <Card tone="outline" size="xs">
                <CardContent className="text-xs">tone="outline"</CardContent>
              </Card>
            </CardContent>
          </Card>
        </Variants>
      </Specimen>

      <Specimen
        name="Alert negative"
        source="ui/alert"
        note='variant="negative": a bad outcome that is not a failure of the site, such as a loss or a wrong answer. A failed request is destructive.'
      >
        <Alert variant="negative" className="max-w-md">
          <TriangleAlertIcon />
          <AlertTitle>Wrong answer</AlertTitle>
          <AlertDescription>That item is a Spirit item. Two attempts left.</AlertDescription>
        </Alert>
      </Specimen>

      <Specimen
        name="OptionRow link and description"
        source="ui/option-row"
        note="description adds a quiet second line; asChild makes the row a link whose children are the label. The row now shows the shared focus ring."
      >
        <div className="flex w-full max-w-xs flex-col gap-0.5 rounded-md border bg-popover p-2">
          {[
            { value: "eu", label: "Europe", description: "Frankfurt, Stockholm", hint: "EU" },
            { value: "na", label: "North America", description: "Virginia, Oregon", hint: "NA" },
          ].map((option) => (
            <OptionRow
              key={option.value}
              selected={region === option.value}
              onClick={() => setRegion(option.value)}
              leading={<GlobeIcon className="size-4 text-muted-foreground" />}
              description={option.description}
              hint={option.hint}
            >
              {option.label}
            </OptionRow>
          ))}
          <OptionRow asChild selected={false} description="asChild: a router Link">
            <Link to="/dev/design-system">All regions</Link>
          </OptionRow>
        </div>
      </Specimen>

      <Specimen
        name="CopyButton label"
        source="ui/copy-button"
        note='display="label" keeps the children and a leading icon, and reads copiedLabel for two seconds after the copy: share buttons are this. display="icon" is the icon alone and needs an aria-label.'
      >
        <Variants>
          <CopyButton text="deadlock-api.com" variant="outline" size="sm" />
          <CopyButton text="Deadlockdle 214, solved in 3 of 6" variant="soft" copiedLabel="Result copied">
            Share result
          </CopyButton>
          <CopyButton text={() => window.location.href} variant="ghost" size="sm" copiedLabel="Link copied">
            Copy link
          </CopyButton>
          <CopyButton text="deadlock-api.com" display="icon" size="icon-xs" aria-label="Copy domain" />
          <CopyButton text="deadlock-api.com" variant="outline" size="sm" disabled />
        </Variants>
      </Specimen>

      <Specimen
        name="Heading font"
        source="ui/heading"
        note="font is independent of size: sans for the site, mono for the terminal voice of the mini-games, game for the game's display face."
      >
        <div className="flex flex-col gap-2">
          {(["sans", "mono", "game"] as const).map((font) => (
            <div key={font} className="flex flex-wrap items-baseline gap-x-3">
              <code className="w-16 shrink-0 font-mono text-2xs text-muted-foreground">{font}</code>
              <Heading as="h4" size="xl" font={font}>
                Deadlockdle
              </Heading>
              <Heading as="h4" size="sm" font={font}>
                Guess the item
              </Heading>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen
        name="ProgressBar variants"
        source="ui/progress-bar"
        note="track is the thin rounded geometry of RateBar, for progress through something. cell is drawn behind the value of a relative table cell, for scoreboards. aria-label makes any of them a named progressbar; without it the bar is decorative. className sizes the root."
      >
        <Variants label="bar (default), track, with className and label" className="items-center gap-6">
          <ProgressBar value={0.62} className="w-40" />
          <ProgressBar variant="track" value={0.62} className="w-40" />
          <ProgressBar
            variant="track"
            value={7}
            max={10}
            color="var(--positive)"
            aria-label="Question 7 of 10"
            className="w-40"
          />
          <ProgressBar variant="track" max={10} className="w-40">
            <ProgressBarSegment value={4} color="var(--item-weapon)" />
            <ProgressBarSegment value={2} color="var(--item-vitality)" />
            <ProgressBarSegment value={1} color="var(--item-spirit)" />
          </ProgressBar>
        </Variants>
        <Variants label='variant="cell"'>
          <Table density="compact" className="max-w-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Hero</TableHead>
                <TableHead className="text-end">Damage</TableHead>
                <TableHead className="text-end">Souls</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SCOREBOARD.map((row) => (
                <TableRow key={row.hero}>
                  <TableCell>{row.hero}</TableCell>
                  <TableCell className="relative text-end tabular-nums">
                    <ProgressBar variant="cell" value={row.damage} max={maxDamage} color="var(--negative)" />
                    <span className="relative">{row.damage.toLocaleString("en-US")}</span>
                  </TableCell>
                  <TableCell className="relative text-end tabular-nums">
                    <ProgressBar variant="cell" value={row.souls} max={maxSouls} color="var(--warning)" />
                    <span className="relative">{row.souls.toLocaleString("en-US")}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Variants>
      </Specimen>

      <Specimen
        name="Nested Tabs"
        source="ui/tabs"
        note="Every part styles itself from its own orientation and variant, so a Tabs inside a Tabs keeps its own geometry: horizontal nav, then vertical line, then horizontal default."
      >
        <NestedTabsExample />
      </Specimen>

      <Specimen
        name="Segmented items"
        source="ui/segmented"
        note='The options are SegmentedItem children. width="fill" shares the container between them, "hug" is as wide as the labels. value / defaultValue / onValueChange; an icon-only item needs an aria-label.'
      >
        <Variants label='width="hug", uncontrolled (defaultValue), a disabled item'>
          <Segmented defaultValue="week" width="hug" aria-label="Interval">
            <SegmentedItem value="day">Day</SegmentedItem>
            <SegmentedItem value="week">Week</SegmentedItem>
            <SegmentedItem value="month" disabled>
              Month
            </SegmentedItem>
          </Segmented>
          <Segmented defaultValue="chart" width="hug" size="sm" aria-label="View">
            <SegmentedItem value="chart" aria-label="Chart">
              <BarChart3Icon />
            </SegmentedItem>
            <SegmentedItem value="layers" aria-label="Layers">
              <LayersIcon />
            </SegmentedItem>
          </Segmented>
        </Variants>
        <Variants label='width="fill" (default), controlled'>
          <div className="w-full max-w-sm">
            <Segmented value={region} onValueChange={setRegion} aria-label="Region">
              <SegmentedItem value="eu">Europe</SegmentedItem>
              <SegmentedItem value="na">North America</SegmentedItem>
            </Segmented>
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="SortButton size"
        source="ui/sort-button"
        note='size="sm" is for dense tables: smaller arrows, and no arrow on a column that is not sorted.'
      >
        <Variants className="gap-6 text-xs text-muted-foreground">
          <SortButton active sortDir="desc" align="start">
            default, active
          </SortButton>
          <SortButton active={false} sortDir="desc" align="start">
            default, idle
          </SortButton>
          <SortButton size="sm" active sortDir="asc" align="start">
            sm, active
          </SortButton>
          <SortButton size="sm" active={false} sortDir="asc" align="start">
            sm, idle
          </SortButton>
        </Variants>
      </Specimen>

      <Specimen
        name="ProgressBarWithLabel orientation"
        source="ui/progress-bar"
        note="vertical puts the label under the bar; horizontal puts a short bar before it, for table cells."
      >
        <Variants className="items-start gap-6">
          <div className="w-40">
            <ProgressBarWithLabel value={0.62} delta={0.021} />
          </div>
          <div className="w-40">
            <ProgressBarWithLabel orientation="horizontal" value={0.62} delta={-0.013} />
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="Delta unit, icon, badge"
        source="ui/delta"
        note='unit replaces the percent sign or follows a number; sign="arrow" swaps the sign glyph for an arrow; display="badge" draws it as a square Badge for table cells.'
      >
        <Variants label="unit" className="gap-4 text-sm">
          <Delta value={0.031} unit=" pp" />
          <Delta value={-2} format="number" digits={0} unit=" ranks" />
        </Variants>
        <Variants label='sign="arrow"' className="gap-4 text-sm">
          <Delta value={0.031} sign="arrow" />
          <Delta value={-0.012} sign="arrow" />
          <Delta value={0.4} format="number" sign="arrow" invert />
        </Variants>
        <Variants label='display="badge"' className="gap-4">
          <Delta value={0.031} display="badge" />
          <Delta value={-0.012} display="badge" />
          <Delta value={0.02} display="badge" sign="arrow" unit=" pp" />
        </Variants>
      </Specimen>

      <Specimen
        name="DivergingBar interval"
        source="ui/rate-bar"
        note="With interval the value becomes a marker on the band of its uncertainty, [low, high] on the same scale."
      >
        <Variants className="gap-6">
          {(
            [
              { value: 0.03, interval: [0.01, 0.05] },
              { value: -0.02, interval: [-0.05, 0.01] },
              { value: 0.002, interval: [-0.03, 0.035] },
            ] as const
          ).map(({ value, interval }) => (
            <div key={value} className="flex items-center gap-2">
              <DivergingBar value={value} scale={0.06} interval={interval} className="w-28" />
              <Delta value={value} className="text-xs" />
            </div>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="TableRow states"
        source="ui/table"
        note='data-interactive: the row is clickable. data-state="current": the row the page is about (you, the selected hero). data-plain: no rule and no hover, for a detail row under its parent.'
      >
        <Table density="compact" className="max-w-md">
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead className="text-end">Win rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow data-interactive tabIndex={0}>
              <TableCell>data-interactive</TableCell>
              <TableCell className="text-end tabular-nums">52.4%</TableCell>
            </TableRow>
            <TableRow data-state="current">
              <TableCell>data-state="current"</TableCell>
              <TableCell className="text-end tabular-nums">50.9%</TableCell>
            </TableRow>
            <TableRow data-plain>
              <TableCell>data-plain</TableCell>
              <TableCell className="text-end tabular-nums">49.1%</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>default</TableCell>
              <TableCell className="text-end tabular-nums">48.0%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Specimen>
    </>
  );
}
