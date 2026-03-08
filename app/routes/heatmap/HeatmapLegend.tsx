interface HeatmapLegendProps {
  viewMode: "kills" | "deaths" | "kd";
  maxValue: number;
}

export function HeatmapLegend({ viewMode, maxValue }: HeatmapLegendProps) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 backdrop-blur-sm px-3 py-1.5">
      <span className="text-[10px] text-muted-foreground">0</span>
      <div
        className="h-2.5 w-24 rounded-full"
        style={{
          background:
            "linear-gradient(to right, rgb(20,0,200), rgb(0,100,255), rgb(0,230,230), rgb(50,255,50), rgb(230,255,0), rgb(255,130,0), rgb(255,0,0))",
        }}
      />
      <span className="text-[10px] text-muted-foreground">
        {viewMode === "kd" ? maxValue.toFixed(2) : Math.round(maxValue).toLocaleString()}
      </span>
    </div>
  );
}
