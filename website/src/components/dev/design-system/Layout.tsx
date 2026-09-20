import { Chapter, Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { Box } from "~/components/ui/box";
import { Card, CardContent } from "~/components/ui/card";
import { Grid } from "~/components/ui/grid";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

const TYPE_STEPS = [
  "display",
  "title-lg",
  "title",
  "heading",
  "subheading",
  "label",
  "body",
  "prose",
  "caption",
  "meta",
  "eyebrow",
  "value-lg",
  "value",
] as const;
const TONES = ["default", "muted", "primary", "positive", "negative", "warning", "info", "destructive"] as const;

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <Card tone="inset" size="xs">
      <CardContent>
        <Text variant="caption" tone="muted">
          {children}
        </Text>
      </CardContent>
    </Card>
  );
}

export function Layout() {
  return (
    <Chapter
      id="layout"
      title="Layout and type"
      intro="Law 4: layout belongs to the parent. Components set no margins; Stack, Inline and Grid space their children from the spacing scale, Box pads, and Text sets type from the named type scale. Reach for these before writing flex and gap classes."
    >
      <Specimen
        name="Stack"
        source="ui/stack"
        note="Children in a column. gap is a step of the spacing scale; align and justify are enums."
      >
        <Variants label="gap 1, 3 (default), 6" className="items-start gap-6">
          {([1, 3, 6] as const).map((gap) => (
            <Stack key={gap} gap={gap} className="w-32">
              <Tile>gap {gap}</Tile>
              <Tile>two</Tile>
              <Tile>three</Tile>
            </Stack>
          ))}
        </Variants>
      </Specimen>

      <Specimen
        name="Inline"
        source="ui/stack"
        note='Children in a row that wraps on a narrow container. wrap="nowrap" keeps one line.'
      >
        <Inline gap={2}>
          {["Win rate", "Pick rate", "Ban rate", "Matches", "Souls per minute"].map((label) => (
            <Tile key={label}>{label}</Tile>
          ))}
        </Inline>
        <Inline justify="between">
          <Tile>justify between</Tile>
          <Tile>end</Tile>
        </Inline>
      </Specimen>

      <Specimen
        name="Grid"
        source="ui/grid"
        note="Equal columns that step with the width of the grid's own container, not of the viewport."
      >
        <Grid columns={{ base: 2, sm: 3, md: 6 }} gap={2}>
          {Array.from({ length: 6 }, (_, i) => (
            <Tile key={i}>{i + 1}</Tile>
          ))}
        </Grid>
      </Specimen>

      <Specimen
        name="Box"
        source="ui/box"
        note="Padding from the spacing scale and nothing else. A surface is a Card; a Box never draws."
      >
        <Inline gap={3}>
          {([1, 3, 6] as const).map((padding) => (
            <Card key={padding} tone="outline" size="flush">
              <Box padding={padding}>
                <Tile>padding {padding}</Tile>
              </Box>
            </Card>
          ))}
        </Inline>
      </Specimen>

      <Specimen
        name="Text"
        source="ui/text"
        note="Text in a step of the named type scale: one name sets size, line height, weight and tracking. tone, align, wrap and numeric are enums."
      >
        <Stack gap={2}>
          {TYPE_STEPS.map((variant) => (
            <Inline key={variant} gap={4} align="baseline">
              <Text variant={variant}>Win rate 52.4%</Text>
              <Text variant="caption" tone="muted">
                {variant}
              </Text>
            </Inline>
          ))}
        </Stack>
        <Variants label="tone">
          {TONES.map((tone) => (
            <Text key={tone} variant="label" tone={tone}>
              {tone}
            </Text>
          ))}
        </Variants>
        <Variants label="wrap: truncate, numeric: tabular" className="max-w-60">
          <Text wrap="truncate">A hero name that is far too long for the column it sits in</Text>
          <Text numeric="tabular" align="end">
            1,204,118
          </Text>
        </Variants>
      </Specimen>
    </Chapter>
  );
}
