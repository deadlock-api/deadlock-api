import { ChartOverlayItem } from "~/components/patterns/charts/ChartOverlay";
import { Field } from "~/components/ui/field";
import { Slider } from "~/components/ui/slider";

export function SensitivitySlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <ChartOverlayItem>
      <Field
        orientation="horizontal"
        label={
          <span
            className="text-3xs"
            title="Controls how much the brightest spots dominate the map. Lower values spread the colors more evenly, making smaller hotspots easier to see."
          >
            Sensitivity
          </span>
        }
      >
        <Slider
          aria-label="Sensitivity"
          min={800}
          max={1000}
          step={1}
          value={[Math.round(value * 1000)]}
          onValueChange={([next]) => onChange(next / 1000)}
          getValueText={(next) => `${(next / 10).toFixed(1)}%`}
          className="w-20"
        />
        <span className="w-12 text-3xs text-muted-foreground tabular-nums">{(value * 100).toFixed(1)}%</span>
      </Field>
    </ChartOverlayItem>
  );
}
