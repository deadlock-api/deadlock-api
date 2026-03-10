export function SensitivitySlider({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-sm ${className ?? ""}`}
    >
      <span
        className="cursor-help text-[10px] whitespace-nowrap text-muted-foreground"
        title="Controls how much the brightest spots dominate the map. Lower values spread the colors more evenly, making smaller hotspots easier to see."
      >
        Sensitivity
      </span>
      <input
        type="range"
        min={800}
        max={1000}
        step={1}
        value={Math.round(value * 1000)}
        onChange={(e) => onChange(Number(e.target.value) / 1000)}
        className="h-1 w-20 cursor-pointer accent-primary"
      />
      <span className="w-12 text-[10px] text-muted-foreground tabular-nums">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}
