import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { useState } from "react";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { CheckboxField } from "~/components/ui/checkbox-field";
import { Code } from "~/components/ui/code";
import { CornerBadge } from "~/components/ui/corner-badge";
import { DetailPopover } from "~/components/ui/detail-popover";
import { InlineStat } from "~/components/ui/inline-stat";
import { Kbd } from "~/components/ui/kbd";
import { KeyValue, KeyValueList } from "~/components/ui/key-value";
import { NoValue } from "~/components/ui/no-value";
import { Pips } from "~/components/ui/pips";
import { SplitBar } from "~/components/ui/rate-bar";
import { SearchInput } from "~/components/ui/search-input";
import { Separator } from "~/components/ui/separator";
import { StatusDot } from "~/components/ui/status-dot";
import { StepMeter, StepMeterStep, type StepState } from "~/components/ui/step-meter";
import { SwitchField } from "~/components/ui/switch-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { TextLink } from "~/components/ui/text-link";
import { TooltipHeader, TooltipStat, TooltipStats } from "~/components/ui/tooltip";

const QUIZ_STEPS: readonly StepState[] = ["wrong", "wrong", "correct", "empty", "empty", "empty"];
const ROUND_STEPS: readonly StepState[] = [
  "correct",
  "correct",
  "wrong",
  "correct",
  "current",
  "empty",
  "empty",
  "empty",
];
const STEP_VARIANTS = ["dots", "squares", "track"] as const;
const STEP_EXAMPLES = [
  { label: "Solved on attempt 3 of 6", steps: QUIZ_STEPS },
  { label: "Question 5 of 8, 3 correct", steps: ROUND_STEPS },
  { label: "Step 4 of 5", steps: ["done", "done", "done", "current", "empty"] satisfies StepState[] },
];
const STEP_STATES: readonly StepState[] = ["done", "current", "correct", "wrong", "empty"];
const DOT_TONES = ["muted", "primary"] as const;

function SearchInputExamples() {
  const [query, setQuery] = useState("Infernus");
  const [small, setSmall] = useState("");
  const [ghost, setGhost] = useState("");
  return (
    <>
      <Variants label="size" className="items-start">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search heroes…"
          aria-label="Search heroes"
          className="w-full sm:w-64"
        />
        <SearchInput
          size="sm"
          value={small}
          onValueChange={setSmall}
          placeholder="Search tables…"
          aria-label="Search tables"
          className="w-full sm:w-56"
        />
      </Variants>
      <Variants label="uncontrolled (defaultValue), disabled" className="items-start">
        <SearchInput
          defaultValue="Paradox"
          placeholder="Uncontrolled"
          aria-label="Uncontrolled search"
          className="w-full sm:w-56"
        />
        <SearchInput defaultValue="Locked" disabled aria-label="Disabled search" className="w-full sm:w-56" />
      </Variants>
      <Variants label='variant="ghost": the header of a dialog or popover'>
        <div className="flex w-full max-w-sm items-center rounded-lg border bg-popover px-3 py-1.5">
          <SearchInput
            variant="ghost"
            value={ghost}
            onValueChange={setGhost}
            placeholder="Pick a hero…"
            aria-label="Pick a hero"
            className="flex-1"
          />
        </div>
      </Variants>
    </>
  );
}

function FieldRowExamples() {
  const [wilson, setWilson] = useState(true);
  const [legendary, setLegendary] = useState(false);
  return (
    <>
      <Specimen
        name="CheckboxField"
        source="ui/checkbox-field"
        note="A checkbox with its label, and an optional description, on one row. It generates the ids; every other prop reaches the Checkbox."
      >
        <Variants label="size" className="items-start gap-6">
          <CheckboxField
            label="Exclude legendary"
            checked={legendary}
            onCheckedChange={(v) => setLegendary(v === true)}
          />
          <CheckboxField size="sm" label="Don't show again" defaultChecked />
        </Variants>
        <Variants label="description, disabled, invalid" className="items-start gap-6">
          <CheckboxField
            label="Show recent matches"
            description="The last five matches appear under the stats."
            defaultChecked
          />
          <CheckboxField label="Show today's matches" description="Needs recent matches." disabled />
          <CheckboxField label="Accept the terms" description="Required to continue." aria-invalid />
        </Variants>
      </Specimen>

      <Specimen
        name="SwitchField"
        source="ui/switch-field"
        note="A switch with its label on one row, for a setting that applies at once."
      >
        <Variants label="size" className="items-start gap-6">
          <SwitchField label="All stats" defaultChecked />
          <SwitchField size="sm" label="Show fine grained intervals" />
          <SwitchField label="Disabled" disabled />
          <SwitchField label="Disabled, on" disabled defaultChecked />
        </Variants>
        <Variants label="description">
          <div className="w-full max-w-md">
            <SwitchField
              label="Conservative win rate"
              description="Fewer matches behind a point mean less confidence, so its win rate is pulled toward 50%."
              checked={wilson}
              onCheckedChange={setWilson}
            />
          </div>
        </Variants>
      </Specimen>
    </>
  );
}

export function Round3Primitives() {
  return (
    <>
      <Specimen
        name="TextLink"
        source="ui/text-link"
        note='A link inside running text. A link that looks like a button is Button asChild. asChild makes a router Link or a SmartLink the anchor. underline="dotted" is the "there is more behind this word" mark: a muted dotted rule that goes solid and takes the link colour on hover and on focus.'
      >
        <Variants label="tone">
          <TextLink href="#text-link">primary</TextLink>
          <span className="text-sm text-muted-foreground">
            A sentence with an{" "}
            <TextLink href="#text-link" tone="inherit" underline="always">
              inherit
            </TextLink>{" "}
            link in it.
          </span>
          <TextLink href="#text-link" tone="muted">
            muted
          </TextLink>
        </Variants>
        <Variants label="underline">
          <TextLink href="#text-link" underline="hover">
            hover
          </TextLink>
          <TextLink href="#text-link" underline="always">
            always
          </TextLink>
        </Variants>
        <Variants label='underline="dotted" (hover or tab to one: muted dotted turns solid and coloured)'>
          <TextLink href="#text-link" underline="dotted">
            dotted, primary
          </TextLink>
          <span className="text-sm">
            412 matches in{" "}
            <TextLink href="#text-link" tone="inherit" underline="dotted">
              this bucket
            </TextLink>
          </span>
          <TextLink href="#text-link" tone="muted" underline="dotted">
            dotted, muted
          </TextLink>
        </Variants>
        <Variants label="external, asChild">
          <TextLink href="https://github.com/deadlock-api" external>
            GitHub
          </TextLink>
          <TextLink asChild>
            <Link to="/dev/design-system">router Link</Link>
          </TextLink>
          <TextLink asChild external>
            <SmartLink href="https://api.deadlock-api.com/docs" external>
              SmartLink, external
            </SmartLink>
          </TextLink>
        </Variants>
      </Specimen>

      <Specimen name="Kbd" source="ui/kbd" note="A key the reader presses. One element per key.">
        <Variants>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd> opens the search
          </span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move, <Kbd>Enter</Kbd> to pick
          </span>
        </Variants>
      </Specimen>

      <Specimen
        name="Code"
        source="ui/code"
        note="A short piece of code inside a sentence, one type step below the text around it: size default in body text, sm in captions, lg in prose. A block of code is HighlightedCode."
      >
        <p className="text-sm text-muted-foreground">
          Pass <Code>min_unix_timestamp</Code> to limit the window; the default is <Code>0</Code>.
        </p>
        <p className="text-xs text-muted-foreground">
          size="sm" in small print: <Code size="sm">~/.steam/steam/steamapps</Code>
        </p>
        <p className="text-base text-muted-foreground">
          size="lg" in prose: <Code size="lg">GET /v1/matches</Code>
        </p>
      </Specimen>

      <Specimen
        name="NoValue"
        source="ui/no-value"
        note='The dash of a cell with nothing to show. A screen reader hears "No value" (or the label) instead of the dash.'
      >
        <Table density="compact" className="max-w-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Hero</TableHead>
              <TableHead className="text-end">Win rate</TableHead>
              <TableHead className="text-end">Rank</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Infernus</TableCell>
              <TableCell className="text-end tabular-nums">52.4%</TableCell>
              <TableCell className="text-end">
                <NoValue label="Unranked" />
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Paradox</TableCell>
              <TableCell className="text-end">
                <NoValue />
              </TableCell>
              <TableCell className="text-end tabular-nums">12</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Specimen>

      <FieldRowExamples />

      <Specimen
        name="SearchInput"
        source="ui/search-input"
        note="A text field that filters what is below it: leading icon, a clear button once it has text. value / defaultValue / onValueChange; ref and input props reach the input, className sizes the row."
      >
        <SearchInputExamples />
      </Specimen>

      <Specimen
        name="StepMeter"
        source="ui/step-meter"
        note="A few discrete steps and the state of each: quiz attempts, questions of a round, stages of a flow. StepMeterStep children carry the state; label is what a screen reader hears."
      >
        {STEP_VARIANTS.map((variant) => (
          <Variants key={variant} label={`variant="${variant}"`} className="gap-6">
            {STEP_EXAMPLES.map((example) => (
              <StepMeter
                key={example.label}
                variant={variant}
                label={example.label}
                className={variant === "track" ? "max-w-48" : undefined}
              >
                {example.steps.map((state, index) => (
                  // oxlint-disable-next-line react/no-array-index-key -- a step is its position
                  <StepMeterStep key={index} state={state} />
                ))}
              </StepMeter>
            ))}
          </Variants>
        ))}
        <Variants
          label="state: a check or a cross, or a thin segment, so correct and wrong never differ by color alone"
          className="gap-4"
        >
          {STEP_STATES.map((state) => (
            <span key={state} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StepMeter label={state}>
                <StepMeterStep state={state} />
              </StepMeter>
              <StepMeter variant="track" label={state} className="w-8">
                <StepMeterStep state={state} />
              </StepMeter>
              {state}
            </span>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="StatusDot"
        source="ui/status-dot"
        note="A dot of state beside a label that says the same thing, or the swatch of a data color. Always decorative."
      >
        <Variants label="tone">
          {DOT_TONES.map((tone) => (
            <span key={tone} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StatusDot tone={tone} /> {tone}
            </span>
          ))}
        </Variants>
        <Variants label="color">
          <span className="flex items-center gap-1.5 text-xs">
            <StatusDot color="var(--lane-purple)" /> Purple lane
          </span>
        </Variants>
      </Specimen>

      <Specimen
        name="KeyValueList"
        source="ui/key-value"
        note="Labelled values, one per row, numbers aligned. Inside a tooltip use TooltipStats."
      >
        <Variants className="items-start gap-6">
          <div className="flex w-56 flex-col gap-1.5">
            <span className="eyebrow">divided (default)</span>
            <KeyValueList>
              <KeyValue label="Matches" value="4,120" />
              <KeyValue label="Win rate" value="52.4%" />
              <KeyValue label="Avg. duration" value="32:10" />
            </KeyValueList>
          </div>
          <div className="flex w-56 flex-col gap-1.5">
            <span className="eyebrow">plain</span>
            <KeyValueList variant="plain">
              <KeyValue label="Matches" value="4,120" />
              <KeyValue label="Win rate" value="52.4%" />
              <KeyValue label="Avg. duration" value="32:10" />
            </KeyValueList>
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="InlineStat"
        source="ui/inline-stat"
        note="A value and its unit on one line of text; the value is in ink."
      >
        <Variants className="gap-4 text-sm">
          <InlineStat value="412" label="matches" />
          <InlineStat value="54.1%" label="win rate" />
          <InlineStat value="3.2" label="KDA" className="text-xs" />
        </Variants>
      </Specimen>

      <Specimen
        name="Separator"
        source="ui/separator"
        note="A rule between groups that share one surface. Blocks of a page are spaced, not ruled."
      >
        <div className="flex max-w-sm flex-col gap-2 text-sm">
          <span>Above</span>
          <Separator />
          <span>Below</span>
        </div>
        <div className="flex h-5 items-center gap-3 text-sm">
          <span>Left</span>
          <Separator orientation="vertical" />
          <span>Right</span>
        </div>
      </Specimen>

      <Specimen
        name="Pips"
        source="ui/pips"
        note="A small count out of a small maximum: ability levels, confidence. The label replaces the marks for a screen reader."
      >
        <Variants className="gap-6">
          <Pips value={3} max={4} label="Level 3 of 4" />
          <Pips value={1} max={4} label="Level 1 of 4" />
          <Pips value={2} max={3} tone="positive" label="Confidence 2 of 3" />
          <Pips value={1} max={3} tone="negative" label="Confidence 1 of 3" />
          <Pips value={2} max={5} tone="muted" label="2 of 5" />
        </Variants>
      </Specimen>

      <Specimen
        name="CornerBadge"
        source="ui/corner-badge"
        note="A count pinned to the corner of an icon or portrait. The parent is relative."
      >
        <Variants className="gap-6 py-2">
          {(["top-end", "bottom-end", "top-start"] as const).map((corner) => (
            <span key={corner} className="relative">
              <Avatar className="rounded-md">
                <AvatarFallback className="rounded-md">IN</AvatarFallback>
              </Avatar>
              <CornerBadge corner={corner}>3</CornerBadge>
            </span>
          ))}
          <span className="relative">
            <Avatar className="rounded-md">
              <AvatarFallback className="rounded-md">IN</AvatarFallback>
            </Avatar>
            <CornerBadge tone="muted">x2</CornerBadge>
          </span>
          <span className="relative">
            <Avatar className="rounded-md">
              <AvatarFallback className="rounded-md bg-primary/40">IN</AvatarFallback>
            </Avatar>
            <CornerBadge tone="scrim" corner="bottom-end">
              12
            </CornerBadge>
          </span>
        </Variants>
      </Specimen>

      <Specimen
        name="DetailPopover"
        source="ui/detail-popover"
        note="Details behind a small trigger: hover shows them as a preview, a click, tap or Enter pins the same content in a popover."
      >
        <Variants>
          <DetailPopover
            label="Infernus"
            details={
              <>
                <TooltipHeader title="Infernus" subtitle="Last 30 days" />
                <TooltipStats>
                  <TooltipStat label="Matches" value="4,120" />
                  <TooltipStat label="Win rate" value="52.4%" />
                </TooltipStats>
              </>
            }
          >
            <InfoIcon />
          </DetailPopover>
          <DetailPopover
            label="Sample size"
            size="icon-xs"
            details={<p className="text-xs">412 matches in this bucket.</p>}
          >
            <InfoIcon />
          </DetailPopover>
        </Variants>
      </Specimen>

      <Specimen
        name="SplitBar"
        source="ui/rate-bar"
        note="Two sides of one whole, meeting where the shares say; the tick marks the even split."
      >
        <Variants className="gap-6">
          <SplitBar left={62} right={38} className="w-40" />
          <SplitBar left={30} right={70} className="w-40" />
          <SplitBar
            left={55}
            right={45}
            leftColor="var(--lane-yellow)"
            rightColor="var(--lane-blue)"
            className="w-40"
          />
        </Variants>
      </Specimen>
    </>
  );
}
