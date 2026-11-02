import { ChartOverlayItem } from "~/components/patterns/charts/ChartOverlay";
import { Field } from "~/components/ui/field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";

/**
 * 2D or 3D, in the map's own corner overlay with its sliders: how the map is drawn is a control of the map, not a
 * filter of the data. Its pill spans the overlay's columns like a slider's, so the rows line up.
 */
export function HeatmapViewToggle({ is3D, onChange }: { is3D: boolean; onChange: (is3D: boolean) => void }) {
  return (
    <ChartOverlayItem className="col-span-3">
      <Field orientation="horizontal" label="View">
        <Segmented size="sm" width="hug" value={is3D ? "3d" : "2d"} onValueChange={(next) => onChange(next === "3d")}>
          <SegmentedItem value="2d">2D</SegmentedItem>
          <SegmentedItem value="3d">3D</SegmentedItem>
        </Segmented>
      </Field>
    </ChartOverlayItem>
  );
}
