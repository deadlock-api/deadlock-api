import { ChartOverlaySlider } from "~/components/patterns/charts/ChartOverlay";

/**
 * The percentile the density scale tops out at (80-100%). The share view's scale is fixed, so there it stays in place,
 * disabled, and the map keeps its size when the view switches.
 */
export function SensitivitySlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <ChartOverlaySlider
      label="Sensitivity"
      min={800}
      max={1000}
      value={Math.round(value * 1000)}
      onValueChange={(next) => onChange(next / 1000)}
      format={(next) => `${(next / 10).toFixed(1)}%`}
      disabled={disabled}
    />
  );
}
