import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronDown,
  Download,
  Info,
  LayoutGrid,
  Link2,
  List,
  Plus,
  RefreshCw,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { useState } from "react";

import { HeadingSpecimen, PrimitivesMore } from "~/components/dev/design-system/PrimitivesMore";
import { Round3Primitives } from "~/components/dev/design-system/Round3Primitives";
import { Round3PrimitivesMore } from "~/components/dev/design-system/Round3PrimitivesMore";
import { Round4Requests } from "~/components/dev/design-system/Round4Requests";
import { Round4Requests2 } from "~/components/dev/design-system/Round4Requests2";
import { Round4States } from "~/components/dev/design-system/Round4States";
import { SoundSpecimens } from "~/components/dev/design-system/Sound";
import { Chapter, Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Callout, CalloutAnchor, CalloutContent, CalloutDescription, CalloutTitle } from "~/components/ui/callout";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { CopyButton } from "~/components/ui/copy-button";
import { Delta } from "~/components/ui/delta";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPager,
  DialogStatus,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Field } from "~/components/ui/field";
import { InfoTip } from "~/components/ui/info-tip";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { OptionGroup, OptionRow } from "~/components/ui/option-row";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ProgressBarWithLabel } from "~/components/ui/progress-bar";
import { DivergingBar } from "~/components/ui/rate-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Slider } from "~/components/ui/slider";
import { SortButton } from "~/components/ui/sort-button";
import { Spinner } from "~/components/ui/spinner";
import { Inline, Stack } from "~/components/ui/stack";
import { Stat, StatGroup } from "~/components/ui/stat";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsPanels, TabsTrigger } from "~/components/ui/tabs";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { Tooltip, TooltipHeader, TooltipStat, TooltipStats, TooltipTarget } from "~/components/ui/tooltip";

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "link",
  "soft",
  "subtle",
  "destructive",
  "destructive-soft",
  "positive-soft",
  "negative-soft",
  "toggle",
  "dismiss",
  "drilldown",
] as const;
const BUTTON_SIZES = ["xs", "sm", "sm-tight", "default", "lg", "touch"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;
const BADGE_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "muted",
  "soft",
  "positive",
  "negative",
  "warning",
  "info",
  "destructive",
] as const;
const CARD_TONES = ["card", "glass", "inset", "muted", "primary", "positive", "negative", "warning"] as const;
const INTERVALS = (
  <>
    <SegmentedItem value="day">Day</SegmentedItem>
    <SegmentedItem value="week">Week</SegmentedItem>
    <SegmentedItem value="month">Month</SegmentedItem>
  </>
);

/** A field that answers with a callout under it: Enter opens it, typing or Escape closes it. */
const PAGER_DEMO = ["Kills", "Deaths", "Assists"];

function DialogPagerDemo() {
  const [index, setIndex] = useState(0);
  const at = (i: number) => PAGER_DEMO[(i + PAGER_DEMO.length) % PAGER_DEMO.length];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Dialog with a pager
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <Inline justify="between" wrap="nowrap" gap={2} className="pe-8">
            <DialogTitle>{at(index)}</DialogTitle>
            <DialogPager
              previousLabel={`Previous: ${at(index - 1)}`}
              nextLabel={`Next: ${at(index + 1)}`}
              onPrevious={() => setIndex(index - 1)}
              onNext={() => setIndex(index + 1)}
              status={at(index)}
            />
          </Inline>
        </DialogHeader>
        <Text tone="muted">The content of {at(index)}.</Text>
      </DialogContent>
    </Dialog>
  );
}

function DialogStatusDemo() {
  const [ready, setReady] = useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Dialog with a status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <Inline gap={3} align="baseline">
            <DialogTitle>SQL Playground</DialogTitle>
            <DialogStatus>{ready ? <Text tone="positive">Ready · 6 tables</Text> : "Loading DuckDB…"}</DialogStatus>
          </Inline>
        </DialogHeader>
        <Button variant="outline" size="sm" className="self-start" onClick={() => setReady(!ready)}>
          {ready ? "Reset status" : "Finish loading"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CalloutDemo() {
  const [variant, setVariant] = useState<"info" | "warning" | "destructive">("info");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <Segmented aria-label="Callout variant" value={variant} onValueChange={setVariant}>
        <SegmentedItem value="info">info</SegmentedItem>
        <SegmentedItem value="warning">warning</SegmentedItem>
        <SegmentedItem value="destructive">destructive</SegmentedItem>
      </Segmented>
      <Callout open={open} onOpenChange={setOpen}>
        <CalloutAnchor asChild>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
          >
            <SearchInput
              aria-label="Ask for a stat"
              placeholder="Press Enter"
              aria-describedby={open ? "callout-demo" : undefined}
              onValueChange={() => setOpen(false)}
            />
          </form>
        </CalloutAnchor>
        <CalloutContent id="callout-demo" variant={variant}>
          <Info />
          <CalloutTitle>We don't have player stats</CalloutTitle>
          <CalloutDescription>Try asking about a hero, an item or a stat.</CalloutDescription>
        </CalloutContent>
      </Callout>
    </div>
  );
}

export function Primitives() {
  const [interval, setInterval] = useState<"day" | "week" | "month">("week");
  const [fieldChecked, setFieldChecked] = useState(false);
  const [views, setViews] = useState(["grid"]);
  const [sort, setSort] = useState("winrate");
  const [range, setRange] = useState([20, 80]);

  return (
    <Chapter
      id="primitives"
      intro="One element or one Radix widget each, in components/ui. They know nothing about Deadlock. Variants are typed props; className is for layout only."
    >
      <HeadingSpecimen />

      <Specimen name="Button" source="ui/button" note="Every action. Links that look like buttons use asChild.">
        <Variants label="variant">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </Variants>
        <Variants label="size">
          {BUTTON_SIZES.map((size) => (
            <Button key={size} size={size} variant="outline">
              <Download /> {size}
            </Button>
          ))}
          {ICON_SIZES.map((size) => (
            <Button key={size} size={size} variant="outline" aria-label={`Refresh (${size})`}>
              <RefreshCw />
            </Button>
          ))}
        </Variants>
        <Variants label="shape, state, composition">
          <Button shape="pill" variant="outline">
            Pill
          </Button>
          <Button shape="pill" size="icon" variant="secondary" aria-label="Close">
            <X />
          </Button>
          <Button disabled>Disabled</Button>
          <Button disabled>
            <Spinner size="sm" /> Saving
          </Button>
          <Button variant="positive-soft" size="xs" aria-pressed={false}>
            Include
          </Button>
          <Button variant="positive-soft" size="xs" aria-pressed>
            Included
          </Button>
          <Button variant="negative-soft" size="xs" aria-pressed>
            Excluded
          </Button>
          <Button variant="toggle" size="icon-sm" aria-pressed={false} aria-label="Zoom in, off">
            <ZoomIn />
          </Button>
          <Button variant="toggle" size="icon-sm" aria-pressed aria-label="Zoom in, on">
            <ZoomIn />
          </Button>
          <Button asChild variant="soft">
            <Link to="/">Link as button</Link>
          </Button>
          <Button variant="link" className="h-auto p-0">
            Inline text action
          </Button>
        </Variants>
        <Variants label='variant="dismiss" reveal="group": shown on hover or focus inside the group, always on touch'>
          {["Seven", "Haze"].map((name) => (
            <div key={name} className="group relative size-12 rounded-full bg-muted">
              <Button
                variant="dismiss"
                reveal="group"
                size="icon-xs"
                shape="pill"
                aria-label={`Remove ${name}`}
                className="absolute -inset-e-0.5 -top-0.5"
              >
                <X />
              </Button>
            </div>
          ))}
        </Variants>
        <Variants label='fit="truncate": a name button in a narrow row ends in an ellipsis instead of overlapping the value beside it'>
          <div className="flex w-full max-w-56 items-center gap-2 rounded-md border px-2 py-1 text-sm">
            <Button variant="text" size="inline" fit="truncate" className="min-h-6">
              <span>The_magnificent_deadlock_player</span>
            </Button>
            <span className="ms-auto shrink-0 text-muted-foreground tabular-nums">7 / 10 / 13</span>
          </div>
        </Variants>
        <Variants label='variant="row"' className="block max-w-sm overflow-hidden rounded-lg border">
          {["Infernus", "Haze", "Avg Damage Mitigated per Player per Match (a label that wraps)"].map((hero) => (
            <Button key={hero} variant="row" className="justify-between gap-3 border-b px-3 py-2 last:border-b-0">
              <span>{hero}</span>
              <span className="text-xs text-muted-foreground tabular-nums">52.4%</span>
            </Button>
          ))}
          {/* A row that opens a page is a link (asChild), so it opens in a new tab too. */}
          <Button variant="row" asChild className="justify-between gap-3 px-3 py-2">
            <Link to="/">
              <span>A row that is a link</span>
              <span className="text-xs text-muted-foreground tabular-nums">52.4%</span>
            </Link>
          </Button>
        </Variants>
      </Specimen>

      <Specimen name="Badge" source="ui/badge" note="Status, tags, counts. Square badges hold numbers.">
        <Variants label="variant">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Variants>
        <Variants label="size and shape">
          <Badge variant="muted" size="sm">
            T3
          </Badge>
          <Badge variant="soft" size="sm">
            matched
          </Badge>
          <Badge variant="positive" shape="square">
            +2.4%
          </Badge>
          <Badge variant="negative" shape="square">
            −1.1%
          </Badge>
          <Badge variant="muted" shape="square">
            0.0%
          </Badge>
        </Variants>
        <Variants label="categories (chart-1 to chart-8)">
          {(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7", "chart-8"] as const).map(
            (variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ),
          )}
        </Variants>
      </Specimen>

      <Specimen
        name="Segmented"
        source="ui/segmented"
        note="One choice from a few short options, all visible at once. Replaces hand-rolled tab bars and single-select toggle groups. A radio group: Tab lands on the chosen item, the arrow keys move and choose. Inside a Field it is named by the Field's label; elsewhere it takes an aria-label."
      >
        <Variants label="size">
          {(["sm", "default", "lg"] as const).map((size) => (
            <Segmented
              key={size}
              size={size}
              width="hug"
              aria-label={`Interval (${size})`}
              value={interval}
              onValueChange={setInterval}
            >
              {INTERVALS}
            </Segmented>
          ))}
        </Variants>
        <Variants label='width="fill" (default)' className="max-w-sm">
          <Segmented aria-label="Interval" value={interval} onValueChange={setInterval}>
            {INTERVALS}
          </Segmented>
        </Variants>
        <Variants label="in a Field (named by its label)">
          <Field label="Interval" orientation="horizontal">
            <Segmented width="hug" value={interval} onValueChange={setInterval}>
              {INTERVALS}
            </Segmented>
          </Field>
          <Stack gap={2} className="w-48">
            <Field
              label="Reserved message"
              htmlFor="ds-field-r"
              reserveMessage
              description={fieldChecked ? "Correct: Tier 3" : undefined}
            >
              <Input id="ds-field-r" defaultValue="Tier 2" readOnly />
            </Field>
            <Separator />
            <Button variant="outline" size="sm" aria-pressed={fieldChecked} onClick={() => setFieldChecked((c) => !c)}>
              {fieldChecked ? "Clear" : "Check"}
            </Button>
          </Stack>
        </Variants>
      </Specimen>

      <Specimen
        name="ToggleGroup"
        source="ui/toggle-group"
        note="Independent on/off options. For one choice out of a few, text or icon, use Segmented."
      >
        <Variants label='type="multiple"'>
          <ToggleGroup type="multiple" variant="outline" value={views} onValueChange={setViews}>
            <ToggleGroupItem value="grid" aria-label="Grid">
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List">
              <List />
            </ToggleGroupItem>
            <ToggleGroupItem value="chart" aria-label="Chart">
              <BarChart3 />
            </ToggleGroupItem>
          </ToggleGroup>
        </Variants>
      </Specimen>

      <Specimen
        name="Tabs"
        source="ui/tabs"
        note="nav: top-level sections of a page. line: sections of one block, its tabs as wide as their labels (mixed lengths stay evenly spaced). default: views inside a panel or dialog. TabsPanels around the TabsContents keeps them all mounted in one cell (inactive ones invisible), for panels of different heights or a default tab picked after hydration."
      >
        {(["nav", "line", "default"] as const).map((variant) => (
          <Variants key={variant} label={variant} className="block">
            <Tabs defaultValue="overview">
              <TabsList variant={variant}>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="over-time">Over time</TabsTrigger>
                <TabsTrigger value="by-rank">By rank</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="text-sm text-muted-foreground">
                Overview panel
              </TabsContent>
              <TabsContent value="over-time" className="text-sm text-muted-foreground">
                Over time panel
              </TabsContent>
              <TabsContent value="by-rank" className="text-sm text-muted-foreground">
                By rank panel
              </TabsContent>
            </Tabs>
          </Variants>
        ))}
        <Variants
          label="TabsPanels: every panel in one cell, as tall as the tallest, so switching moves nothing below"
          className="block"
        >
          <Tabs defaultValue="windows">
            <TabsList>
              <TabsTrigger value="windows">Windows</TabsTrigger>
              <TabsTrigger value="linux">Linux</TabsTrigger>
            </TabsList>
            <TabsPanels>
              <TabsContent value="windows" className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>Step one</span>
                <span>Step two</span>
                <span>Step three</span>
              </TabsContent>
              <TabsContent value="linux" className="text-sm text-muted-foreground">
                One step
              </TabsContent>
            </TabsPanels>
          </Tabs>
          <Text tone="muted">This line never moves.</Text>
        </Variants>
      </Specimen>

      <Specimen
        name="Card"
        source="ui/card"
        note="The one surface. tone picks the material, size sets the padding of every part at once."
      >
        <Variants label="tone" className="grid grid-cols-2 items-stretch sm:grid-cols-3 lg:grid-cols-5">
          {CARD_TONES.map((tone) => (
            <Card key={tone} tone={tone} size="xs">
              <CardContent className="text-xs">{tone}</CardContent>
            </Card>
          ))}
        </Variants>
        <Variants label="size" className="grid items-start md:grid-cols-3">
          {(["default", "sm", "xs"] as const).map((size) => (
            <Card key={size} size={size}>
              <CardHeader>
                <CardTitle>size="{size}"</CardTitle>
                <CardDescription>Header, content and footer follow.</CardDescription>
                <CardAction>
                  <Button size="icon-xs" variant="ghost" aria-label="More">
                    <ChevronDown />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="text-sm">Content</CardContent>
            </Card>
          ))}
        </Variants>
        <Variants label='interaction="pressable"' className="grid sm:grid-cols-2">
          <Link to="/" className="block rounded-xl">
            <Card interaction="pressable" size="sm">
              <CardHeader>
                <CardTitle>A card that is a link</CardTitle>
                <CardDescription>Hover and focus states come from the variant.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </Variants>
      </Specimen>

      <Specimen
        name="Stat"
        source="ui/stat"
        note="Headline numbers. StatGroup supplies the layout and the <dl>; columns are set with grid classes."
      >
        <Variants label='variant="tiles"' className="block">
          <StatGroup className="grid-cols-2 sm:grid-cols-4">
            <Stat label="Win rate" value="52.4%" tone="positive" sub={<Delta value={0.012} />} />
            <Stat label="Pick rate" value="8.1%" sub={<Delta value={-0.004} />} />
            <Stat label="Matches" value="1,204,118" sub="last 30 days" />
            <Stat
              label="Avg. deaths"
              value="6.3"
              sub={<Delta value={0.4} format="number" polarity="lower-is-better" />}
            />
          </StatGroup>
        </Variants>
        <Variants label='variant="joined" size="sm"' className="block">
          <StatGroup variant="joined" size="sm" className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {["Matches", "Win rate", "KDA", "Souls/min", "Accuracy", "Playtime"].map((label, i) => (
              <Stat key={label} label={label} value={["412", "54.1%", "3.2", "612", "48%", "231h"][i]} />
            ))}
          </StatGroup>
        </Variants>
        <Variants label='variant="plain" inside a Card' className="block">
          <Card tone="muted" size="xs">
            <CardContent>
              <StatGroup variant="plain" size="sm" className="grid-cols-3">
                <Stat align="center" label="Kills" value="9.1" />
                <Stat align="center" label="Deaths" value="5.2" />
                <Stat align="center" label="Assists" value="11.4" />
              </StatGroup>
            </CardContent>
          </Card>
        </Variants>
        <Variants label='variant="plain" size="xs", align="end" (a dense header)' className="block">
          <StatGroup variant="plain" size="xs" className="auto-cols-max grid-flow-col justify-end gap-6">
            <Stat align="end" label="K / D / A" value="9 / 4 / 12" />
            <Stat align="end" label="Souls" value="31,240" />
            <Stat align="end" label="Rank" value={<Delta value={14} format="number" />} />
          </StatGroup>
        </Variants>
      </Specimen>

      <Specimen
        name="Delta"
        source="ui/delta · lib/tone"
        note="A signed change, colored by direction. polarity lower-is-better when a rise is bad news, neutral when it is neither; a change under threshold (or significant={false}, for an interval test) is muted and set in regular weight, a clear one semibold, and a screen reader hears within noise, so the verdict never rests on color alone. For other good/bad values use toneOf() with TONE_TEXT."
      >
        <Variants>
          <Delta value={0.031} />
          <Delta value={-0.012} />
          <Delta value={1.4} format="number" />
          <Delta value={0.6} format="number" polarity="lower-is-better" />
          <Delta value={0.6} format="number" polarity="neutral" />
          <span className="text-xs text-muted-foreground">threshold: clear, then within noise:</span>
          <Delta value={0.042} threshold={0.03} />
          <Delta value={0.004} threshold={0.03} />
          <span className="text-xs text-muted-foreground">significant (an interval test):</span>
          <Delta value={-0.021} unit=" pp" significant />
          <Delta value={-0.021} unit=" pp" significant={false} />
          <span className="text-xs text-muted-foreground">zero renders nothing:</span>
          <Delta value={0.0001} />
          <span className="text-xs text-muted-foreground">unless zero=&quot;visible&quot;:</span>
          <Delta value={0.0001} unit=" pp" sign="arrow" zero="visible" />
        </Variants>
      </Specimen>

      <Specimen
        name="Field"
        source="ui/field"
        note="A label tied to a control, outside a FilterBar. vertical for forms, horizontal for toolbars. reserveMessage keeps the footer row before there is a message, so a description or error that arrives later (a quiz correction, a check on submit) moves nothing: the rule under the third field stays put."
      >
        <Variants className="items-end gap-6">
          <Field label="Vertical" htmlFor="ds-field-v" className="w-48">
            <Input id="ds-field-v" placeholder="Hero name" />
          </Field>
          <Field label="Horizontal" orientation="horizontal">
            <Segmented width="hug" aria-label="Interval" value={interval} onValueChange={setInterval}>
              {INTERVALS}
            </Segmented>
          </Field>
          <Stack gap={2} className="w-48">
            <Field
              label="Reserved message"
              htmlFor="ds-field-r"
              reserveMessage
              description={fieldChecked ? "Correct: Tier 3" : undefined}
            >
              <Input id="ds-field-r" defaultValue="Tier 2" readOnly />
            </Field>
            <Separator />
            <Button variant="outline" size="sm" aria-pressed={fieldChecked} onClick={() => setFieldChecked((c) => !c)}>
              {fieldChecked ? "Clear" : "Check"}
            </Button>
          </Stack>
        </Variants>
      </Specimen>

      <Specimen name="Input" source="ui/input">
        <Variants>
          <Input placeholder="Default" className="w-48" aria-label="Default input" />
          <Input type="search" placeholder="Search" className="w-48" aria-label="Search input" />
          <Input size="sm" placeholder='size="sm"' className="w-48" aria-label="Small input" />
          <Input disabled placeholder="Disabled" className="w-48" aria-label="Disabled input" />
          <Input aria-invalid defaultValue="Invalid" className="w-48" aria-label="Invalid input" />
          {/* ds-allow color-literal: the value of a native color input is user data and must be a hex string */}
          <Input type="color" defaultValue="#fa4454" aria-label="Font color" />
        </Variants>
        <Variants label='syntax="template": no spell check, autofill or autocorrect for {placeholders}'>
          <Input
            syntax="template"
            defaultValue="{wins_today}W - {losses_today}L"
            className="w-64"
            aria-label="Template input"
          />
        </Variants>
        <Variants label='syntax="identifier": the same, for an ID, a code or a link'>
          <Input
            syntax="identifier"
            placeholder="SteamID64, account ID or profile link"
            className="w-72"
            aria-label="Steam ID"
          />
        </Variants>
      </Specimen>

      <Specimen
        name="Textarea"
        source="ui/textarea"
        note='Grows with its content. syntax="template" (as here) turns off spell check, autofill and autocorrect for {placeholders}.'
      >
        <Textarea
          syntax="template"
          placeholder="Example: {steam_account_name} has {wins_today}W today"
          className="max-w-md"
          aria-label="Template"
        />
      </Specimen>

      <Specimen
        name="Select"
        source="ui/select"
        note='size="default" (h-9) for forms, size="sm" (h-8) for toolbars and tables.'
      >
        <Variants>
          {(["default", "sm"] as const).map((size) => (
            <Select key={size} defaultValue="winrate">
              <SelectTrigger size={size} className="w-40" aria-label={`Metric (${size})`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="winrate">Win rate</SelectItem>
                <SelectItem value="pickrate">Pick rate</SelectItem>
              </SelectContent>
            </Select>
          ))}
        </Variants>
      </Specimen>

      <Specimen name="Checkbox and Switch" source="ui/checkbox-field · ui/switch · ui/label">
        <Variants className="gap-6">
          <CheckboxField label="Include bots" defaultChecked />
          <div className="flex items-center gap-2">
            <Switch id="ds-switch" />
            <Label htmlFor="ds-switch">Compare to previous period</Label>
          </div>
        </Variants>
      </Specimen>

      <Specimen name="Slider" source="ui/slider">
        <Field label={`Rank range ${range[0]}–${range[1]}`} className="w-64">
          <Slider value={range} onValueChange={setRange} min={0} max={100} step={1} aria-label="Rank range" />
        </Field>
      </Specimen>

      <Specimen
        name="OptionRow"
        source="ui/option-row"
        note="One choice in a popover or dialog list. hint and trailing add columns; active marks the keyboard cursor of a listbox whose field keeps the focus (an accent fill plus a primary mark down the start edge, 3:1 on the popover, so the cursor is not a fill alone). The edge is reserved on every row. OptionGroup names a group of rows (role group, a sentence-case caption label, not an eyebrow)."
      >
        <Variants className="items-start gap-6">
          <div className="w-56 rounded-md border bg-popover p-2">
            {[
              ["winrate", "Win rate", "WR"],
              ["pickrate", "Pick rate", "PR"],
              ["matches", "Matches", ""],
            ].map(([value, label, hint]) => (
              <OptionRow key={value} selected={sort === value} onClick={() => setSort(value)} hint={hint || undefined}>
                {label}
              </OptionRow>
            ))}
          </div>
          <div className="w-56 rounded-md border bg-popover p-2">
            <OptionGroup label="Heroes">
              {["Haze", "Bebop", "Seven"].map((hero, index) => (
                <OptionRow key={hero} active={index === 1} tabIndex={-1}>
                  {hero}
                </OptionRow>
              ))}
            </OptionGroup>
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="ProgressBar"
        source="ui/progress-bar"
        note="Comparative bars in tables, with the reading and its change under the bar."
      >
        <Variants className="items-start gap-6">
          <div className="flex w-56 flex-col gap-3">
            <ProgressBarWithLabel
              value={0.524}
              min={0.4}
              max={0.6}
              label="52.4%"
              delta={0.012}
              deltaLabel="change versus the previous period"
            />
            <ProgressBarWithLabel value={0.081} max={0.2} color="var(--chart-4)" label="8.1%" delta={-0.004} />
            <ProgressBarWithLabel
              value={0.000886}
              max={0.0055}
              color="var(--chart-4)"
              label="0.089%"
              delta={0.00012}
              deltaDigits={3}
            />
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="DivergingBar"
        source="ui/rate-bar"
        note="Draws a signed value from the centre of its track. Its color follows polarity through deltaTone (~/lib/tone), as Delta's does, so the bar never contradicts the number beside it."
      >
        <Variants label="DivergingBar: a signed value from the centre" className="gap-6">
          {[0.042, -0.018, 0.009, -0.06].map((value) => (
            <span key={value} className="flex items-center gap-2 text-xs tabular-nums">
              <Delta value={value} className="w-12 text-end" />
              <DivergingBar value={value} scale={0.06} className="w-28" />
            </span>
          ))}
        </Variants>
        <Variants
          label='polarity: "lower-is-better" (a fall is good) and "neutral" (a figure that only describes), matching Delta'
          className="gap-6"
        >
          {(["lower-is-better", "neutral"] as const).map((polarity) => (
            <span key={polarity} className="flex items-center gap-2 text-xs tabular-nums">
              <Delta value={-0.03} polarity={polarity} className="w-12 text-end" />
              <DivergingBar value={-0.03} scale={0.06} polarity={polarity} className="w-28" />
            </span>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="SortButton"
        source="ui/sort-button"
        note='The button inside every sortable header. In a Table use SortableHeader, which also sets aria-sort. The sorted column reads in full ink with its direction; the others show the up/down mark, which also keeps the room of the arrow so sorting moves no column. size="sm" is for dense tables.'
      >
        <Variants className="gap-6 text-sm">
          <SortButton active sortDir="desc">
            Win rate
          </SortButton>
          <SortButton active sortDir="asc">
            Win rate
          </SortButton>
          <SortButton active={false} sortDir="desc">
            Matches
          </SortButton>
          <SortButton active sortDir="desc" size="sm" className="text-xs">
            size="sm"
          </SortButton>
          <SortButton active={false} sortDir="desc" size="sm" className="text-xs">
            size="sm", inactive
          </SortButton>
        </Variants>
      </Specimen>

      <Specimen
        name="Tooltip"
        source="ui/tooltip"
        note='The one hover surface: a hint that names an icon-only button, the details behind a value, a preview. The child is the trigger. variant="preview" is for heavy or interactive content such as a chart: it renders once, opens after a short delay and is not read out as a description. TooltipCard is the same surface for Recharts. TooltipTarget makes a plain value focusable so its tooltip is reachable by keyboard; its display prop decides how it sits in the line, and defaults to inline-block so the focus ring boxes the whole trigger. Under a Tooltip with empty content (still loading) a TooltipTarget is not a tab stop.'
      >
        <Variants label='variant="hint" (default)'>
          <Tooltip content="Add to comparison">
            <Button size="icon-sm" variant="outline" aria-label="Add">
              <Plus />
            </Button>
          </Tooltip>
          <Tooltip
            content={
              <>
                <TooltipHeader title="Infernus" subtitle="Last 30 days" />
                <TooltipStats>
                  <TooltipStat label="Win rate" value="52.4%" />
                  <TooltipStat label="Matches" value="84,120" />
                </TooltipStats>
              </>
            }
          >
            <Button variant="outline" size="sm">
              With data
            </Button>
          </Tooltip>
          {(["right", "bottom", "left"] as const).map((side) => (
            <Tooltip key={side} side={side} content={`side="${side}"`}>
              <Button variant="outline" size="sm">
                {side}
              </Button>
            </Tooltip>
          ))}
        </Variants>
        <Variants label="empty content (still loading): the TooltipTarget leaves the tab order">
          <Tooltip content={null}>
            <TooltipTarget>Mid ranks</TooltipTarget>
          </Tooltip>
        </Variants>
        <Variants label='variant="preview"'>
          <Tooltip variant="preview" content="Room for a chart and its controls.">
            <Button variant="link" className="h-auto p-0">
              Preview
            </Button>
          </Tooltip>
        </Variants>
        <Variants label='trigger="toggle": hover or focus opens it, a tap or key toggles it, a click pins it open (aria-expanded)'>
          <Tooltip
            trigger="toggle"
            content={
              <>
                <TooltipHeader title="Toxic Bullets" subtitle="Rush this against tanks" />
                <TooltipStats>
                  <TooltipStat label="Bought in" value="61% of matches" />
                </TooltipStats>
              </>
            }
          >
            <TooltipTarget className="flex flex-col items-center text-xs">
              <span className="sr-only">Toxic Bullets, bought in </span>
              61%
            </TooltipTarget>
          </Tooltip>
        </Variants>
        <Variants label="TooltipTarget display (tab through them to see the ring)" className="items-stretch">
          <div className="flex w-full max-w-md flex-col gap-2 text-sm">
            <p className="text-muted-foreground">
              The default <TooltipTarget>inline-block</TooltipTarget> keeps one box, so the ring wraps the whole
              trigger.
            </p>
            <TooltipTarget display="block" className="bg-muted p-2">
              block: fills its column, for a bar or a full-width row
            </TooltipTarget>
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="InfoTip"
        source="ui/info-tip"
        note="An info mark beside a label, for what an author wrote about it. A toggletip: hover and focus open it, a tap toggles it, a click pins it open until a second click, a press outside or Escape. A 16px glyph with a 24px hit area; the parent keeps a gap of at least 4px."
      >
        <Variants>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            Laning
            <InfoTip label="About Laning" content="Buy these before the first guardian falls." />
          </span>
        </Variants>
      </Specimen>

      <Specimen
        name="Popover"
        source="ui/popover"
        note="Opens on click and holds controls: a filter list, a calendar, a menu. Information shown on hover is a Tooltip. It is a dialog named by aria-label on PopoverContent, or by its trigger without one. fit available keeps the given side and caps the height at the room there, its content scrolling (min-h-0 on the scroller), for a popup that grows while open (a combobox's results); sideWithRoom(anchor, reserve) picks that side when it opens."
      >
        <Variants>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Popover
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 text-sm">Popover content</PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Rank: Phantom 1+
              </Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Rank" className="w-56 text-sm">
              Named "Rank" rather than by its trigger
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                fit available
              </Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Heroes" side="bottom" fit="available" className="w-56 p-1 text-sm">
              <div className="flex min-h-0 flex-col overflow-y-auto">
                {[
                  "Abrams",
                  "Bebop",
                  "Dynamo",
                  "Grey Talon",
                  "Haze",
                  "Infernus",
                  "Ivy",
                  "Kelvin",
                  "Lady Geist",
                  "Lash",
                  "McGinnis",
                  "Mo & Krill",
                  "Paradox",
                  "Pocket",
                  "Seven",
                  "Shiv",
                  "Vindicta",
                  "Viscous",
                  "Warden",
                  "Wraith",
                  "Yamato",
                ].map((hero) => (
                  <OptionRow key={hero}>{hero}</OptionRow>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </Variants>
      </Specimen>

      <Specimen
        name="Dialog"
        source="ui/dialog"
        note="One task, then back to the page. DialogHeader keeps a long title clear of the close button by itself. DialogPager steps through a sequence from the header, beside the title: its buttons are named by their target, the arrow keys step too, and a polite status announces the new title. DialogStatus is status text beside the title (an <output>), so the dialog's name stays its title while the status changes."
      >
        <Variants>
          <DialogPagerDemo />
          <DialogStatusDemo />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Dialog
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog title</DialogTitle>
                <DialogDescription>One task, then back to the page.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Variants>
      </Specimen>

      <Specimen name="AlertDialog" source="ui/alert-dialog" note="Confirms an irreversible action.">
        <Variants>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive-soft" size="sm">
                <Trash2 /> AlertDialog
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this account?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Variants>
      </Specimen>

      <Specimen
        name="Alert"
        source="ui/alert"
        note="A message in the flow of the page. For a failed request use ErrorState, which adds the retry. live: assertive (role=alert, the default for destructive), polite (role=status, a result that just arrived), off (no role, the default for every other variant: a notice that is always there)."
      >
        <Variants className="grid items-start md:grid-cols-2">
          {(["default", "primary", "info", "warning", "positive", "destructive"] as const).map((variant) => (
            <Alert key={variant} variant={variant}>
              <Info />
              <AlertTitle>{variant}</AlertTitle>
              <AlertDescription>Data for the current patch is still filling in.</AlertDescription>
            </Alert>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="Callout"
        source="ui/callout"
        note="A message pinned under the control it is about, over the page: nothing moves and the field keeps focus. Escape, a click elsewhere or typing closes it."
      >
        <CalloutDemo />
      </Specimen>

      <Specimen
        name="Skeleton"
        source="ui/skeleton"
        note="Holds the final size of content that is loading, so the layout does not jump."
      >
        <div className="flex w-56 flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </Specimen>

      <Specimen name="Spinner" source="ui/spinner" note="An inline busy indicator for a control or a line of text.">
        <Variants className="gap-6">
          {(["xs", "sm", "default", "lg"] as const).map((size) => (
            <Spinner key={size} size={size} />
          ))}
        </Variants>
      </Specimen>

      <Specimen name="Avatar" source="ui/avatar">
        <Variants>
          <Avatar>
            <AvatarFallback>DL</AvatarFallback>
          </Avatar>
          <Avatar className="size-12">
            <AvatarFallback>IN</AvatarFallback>
          </Avatar>
        </Variants>
      </Specimen>

      <Specimen name="Collapsible" source="ui/collapsible">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm">
              Toggle details <ChevronDown />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 text-xs text-muted-foreground">Hidden content</CollapsibleContent>
        </Collapsible>
      </Specimen>

      <Specimen name="CopyButton" source="ui/copy-button">
        <Variants>
          <CopyButton text="deadlock-api.com" variant="outline" size="sm" />
          <CopyButton text="deadlock-api.com" variant="ghost" size="icon-sm" />
          <CopyButton text="deadlock-api.com" icon={null} variant="ghost" size="xs">
            Copy match link
          </CopyButton>
          <CopyButton
            text="https://deadlock-api.com"
            icon={Link2}
            variant="outline"
            size="icon"
            aria-label="Copy link"
            title="Copy link"
          />
        </Variants>
      </Specimen>

      <PrimitivesMore />
      <Round3Primitives />
      <Round3PrimitivesMore />
      <Round4States />
      <Round4Requests />
      <Round4Requests2 />
      <SoundSpecimens />
    </Chapter>
  );
}
