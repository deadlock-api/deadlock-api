import { Field } from "~/components/ui/field";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";

/** Whether matchups count only heroes who shared a lane, or any two heroes in the same match. For a table toolbar. */
export function HeroLaneFilter({
  value,
  onValueChange,
}: {
  /** True: the same lane only. */
  value: boolean;
  onValueChange: (sameLane: boolean) => void;
}) {
  return (
    <Field label="Lane" orientation="horizontal">
      <Segmented value={value ? "same" : "any"} onValueChange={(v) => onValueChange(v === "same")} width="hug">
        <SegmentedItem value="same">Same lane</SegmentedItem>
        <SegmentedItem value="any">Any lane</SegmentedItem>
      </Segmented>
    </Field>
  );
}
