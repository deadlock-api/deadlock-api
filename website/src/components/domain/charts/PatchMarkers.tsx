import { type ChartMarker, ChartMarkers } from "~/components/patterns/charts/ChartMarkers";
import { PATCHES } from "~/lib/constants";

/** Every patch as a marker on a time axis in ms, labelled with its name as the date picker lists it. */
export const PATCH_MARKERS: readonly ChartMarker[] = PATCHES.map((patch) => ({
  at: patch.startDate.valueOf(),
  label: patch.name,
}));

/** The same markers labelled with each patch's `shortName`, for small charts such as the ones in hover cards. */
export const PATCH_MARKERS_SHORT: readonly ChartMarker[] = PATCHES.map((patch) => ({
  at: patch.startDate.valueOf(),
  label: patch.shortName,
}));

/**
 * Patch lines for a chart whose x-axis is a timestamp in ms. Give the chart `CHART_MARGIN_MARKED`. `size="sm"` labels
 * them with their short names.
 */
export function PatchMarkers({
  size = "default",
  ...props
}: Omit<React.ComponentProps<typeof ChartMarkers>, "markers"> & { size?: "default" | "sm" }) {
  return <ChartMarkers markers={size === "sm" ? PATCH_MARKERS_SHORT : PATCH_MARKERS} {...props} />;
}
