import { type ChartMarker, ChartMarkers } from "~/components/patterns/charts/ChartMarkers";
import { usePeriodLists } from "~/hooks/usePeriodLists";

/**
 * Every patch as a marker on a time axis in ms, hero releases too: labelled with its name as the date picker lists
 * it, or with its `shortName` for small charts such as the ones in hover cards (`size="sm"`).
 */
export function usePatchMarkers(size: "default" | "sm" = "default"): readonly ChartMarker[] {
  const { patches } = usePeriodLists();
  return patches.map((patch) =>
    size === "sm"
      ? { at: patch.startUnix * 1000, label: patch.shortName }
      : { at: patch.startUnix * 1000, label: patch.name, shortLabel: patch.shortName },
  );
}

/**
 * Patch lines for a chart whose x-axis is a timestamp in ms. Give the chart `CHART_MARGIN_MARKED`. `size="sm"` labels
 * them with their short names.
 */
export function PatchMarkers({
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof ChartMarkers>, "markers"> & { size?: "default" | "sm" }) {
  return <ChartMarkers markers={usePatchMarkers(size)} {...props} />;
}
