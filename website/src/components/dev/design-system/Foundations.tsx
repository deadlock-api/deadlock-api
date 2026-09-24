import { Chapter, Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { tokenUsage } from "~/components/dev/design-system/usage";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

const COLOR_GROUPS: { name: string; note: string; tokens: string[] }[] = [
  {
    name: "Surfaces",
    note: "Darkest to most raised. Text on them is foreground or muted-foreground.",
    tokens: ["background", "card", "popover", "muted", "secondary", "accent", "border", "input"],
  },
  {
    name: "Translucent layers",
    note: "For panels that sit on imagery or on another surface.",
    tokens: ["hairline", "subtle", "subtle-hover", "subtle-active"],
  },
  {
    name: "Ink and brand",
    note: "Primary is for brand, selection and focus. It never means bad.",
    tokens: ["foreground", "muted-foreground", "primary", "primary-foreground", "ring"],
  },
  {
    name: "Status",
    note: "Positive is teal, not green, so the pair survives red-green colorblindness.",
    tokens: ["positive", "negative", "warning", "info", "destructive"],
  },
  {
    name: "Chart series",
    note: "Assign in order, never cycle. win-rate and share keep their meaning across the site.",
    tokens: [
      "chart-1",
      "chart-2",
      "chart-3",
      "chart-4",
      "chart-5",
      "chart-6",
      "chart-7",
      "chart-8",
      "chart-win-rate",
      "chart-share",
    ],
  },
  {
    name: "Game and third-party",
    note: "Item categories as colored in the client; brand colors of services we link to.",
    tokens: ["item-weapon", "item-vitality", "item-spirit", "steam-bg", "steam-border", "discord"],
  },
];

function Swatch({ token }: { token: string }) {
  return (
    <div className="flex w-28 flex-col gap-1">
      <div className="h-10 rounded-md border" style={{ backgroundColor: `var(--${token})` }} />
      <code className="truncate font-mono text-2xs">{token}</code>
      <Text variant="meta" tone="muted" numeric="tabular">
        {tokenUsage(token).toLocaleString("en-US")} uses
      </Text>
      <code
        className="truncate font-mono text-3xs text-muted-foreground"
        ref={(el) => {
          if (el) el.textContent = getComputedStyle(el).getPropertyValue(`--${token}`).trim();
        }}
      />
    </div>
  );
}

const TYPE_SCALE = [
  ["text-4xs", "9px · chart annotations, corner counters"],
  ["text-3xs", "10px · eyebrow labels, dense meta"],
  ["text-2xs", "11px · dense table cells, hints"],
  ["text-xs", "12px · secondary text, toolbar labels"],
  ["text-sm", "14px · body of data pages, controls"],
  ["text-base", "16px · prose"],
  ["text-xl", "20px · section titles"],
  ["text-2xl", "24px · page titles on data pages"],
  ["text-3xl", "30px · page titles on content pages"],
] as const;

const RADII = [
  ["rounded-sm", "focus rings, tiny chips"],
  ["rounded-md", "controls"],
  ["rounded-lg", "nested blocks, toolbars"],
  ["rounded-xl", "cards and panels"],
  ["rounded-full", "pills, avatars"],
] as const;

const SHADOWS = ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"] as const;

const HEIGHTS = [
  ["h-6", "xs · inside dense panels"],
  ["h-7", "Segmented default"],
  ["h-8", "sm · toolbars, tables"],
  ["h-9", "default · forms"],
  ["h-10", "lg · marketing calls to action"],
] as const;

export function Foundations() {
  return (
    <Chapter
      id="foundations"
      title="Foundations"
      intro="Tokens live in src/styles/tokens.css in three tiers: primitives, semantic tokens, and the Tailwind theme that turns them into utilities. Components use the utilities only."
    >
      {COLOR_GROUPS.map((group) => (
        <Specimen key={group.name} name={group.name} source="styles/tokens.css" note={group.note}>
          <div className="flex flex-wrap gap-3">
            {group.tokens.map((token) => (
              <Swatch key={token} token={token} />
            ))}
          </div>
        </Specimen>
      ))}

      <Specimen
        name="Type scale"
        note="Inter for UI, JetBrains Mono for code and ids, New Rocker (font-game) for game titles only."
      >
        <div className="flex flex-col gap-2">
          {TYPE_SCALE.map(([cls, use]) => (
            <div key={cls} className="flex flex-wrap items-baseline gap-x-4">
              <span className={cn(cls, "font-medium tabular-nums")}>Win rate 52.4%</span>
              <code className="font-mono text-2xs text-muted-foreground">
                {cls} · {use}
              </code>
            </div>
          ))}
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span className="eyebrow">Matches played</span>
            <code className="font-mono text-2xs text-muted-foreground">eyebrow · the label above a value</code>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span className="font-game text-2xl">Deadlockdle</span>
            <code className="font-mono text-2xs text-muted-foreground">font-game</code>
          </div>
        </div>
      </Specimen>

      <Specimen
        name="Radius"
        note="Controls are rounded-md, nested blocks rounded-lg, cards and panels rounded-xl, pills rounded-full."
      >
        <Variants>
          {RADII.map(([cls, use]) => (
            <div key={cls} className="flex flex-col items-center gap-1">
              <div className={cn("size-14 border bg-card", cls)} />
              <code className="font-mono text-3xs">{cls}</code>
              <span className="text-3xs text-muted-foreground">{use}</span>
            </div>
          ))}
        </Variants>
      </Specimen>

      <Specimen name="Shadow" note="Heavier than Tailwind's defaults, for a near-black page.">
        <Variants className="gap-4">
          {SHADOWS.map((cls) => (
            <div key={cls} className="flex flex-col items-center gap-1">
              <div className={cn("size-14 rounded-lg border bg-card", cls)} />
              <code className="font-mono text-3xs">{cls}</code>
            </div>
          ))}
        </Variants>
      </Specimen>

      <Specimen name="Control height" note="Pick the size prop of the control; never override heights with classes.">
        <Variants className="items-end">
          {HEIGHTS.map(([cls, use]) => (
            <div key={cls} className="flex flex-col items-center gap-1">
              <div className={cn("w-20 rounded-md border bg-card", cls)} />
              <code className="font-mono text-3xs">{cls}</code>
              <span className="text-3xs text-muted-foreground">{use}</span>
            </div>
          ))}
        </Variants>
      </Specimen>
    </Chapter>
  );
}
