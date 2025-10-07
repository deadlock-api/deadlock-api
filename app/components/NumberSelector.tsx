export default function NumberSelector({
  value,
  onChange,
  label,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (val: number) => void;
  label: string;
  step: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex flex-col max-w-40 gap-1.5 ">
      <div className="flex justify-center md:justify-start items-center h-8">
        <span className="text-sm font-semibold text-foreground text-wrap">{label}</span>
      </div>
      <div className="flex items-center border rounded-md px-2 py-1 bg-transparent min-w-0 h-9 w-full md:text-sm focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring">
        <button
          type="button"
          aria-label="Decrease"
          className="px-2 text-lg font-bold text-muted-foreground hover:text-foreground focus:outline-none"
          onClick={() => onChange(Math.max(min || 0, value - step))}
        >
          -
        </button>
        <span className={"flex-1 text-center select-none text-muted-foreground"} style={{ minWidth: 32 }}>
          {value}
        </span>
        <button
          type="button"
          aria-label="Increase"
          className="px-2 text-lg font-bold text-muted-foreground hover:text-foreground focus:outline-none"
          onClick={() => {
            onChange(Math.min(max || Number.POSITIVE_INFINITY, value + step));
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
