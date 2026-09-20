import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

type SelectionBoxState = "selected" | "hovered" | "marquee";

const stateClass: Record<SelectionBoxState, string> = {
  selected: "rounded-sm bg-primary/15 ring-2 ring-primary",
  hovered: "rounded-sm bg-primary/10 ring-2 ring-primary transition-all duration-fast",
  marquee: "rounded-sm border-2 border-dashed border-primary bg-primary/5",
};

interface SelectionBoxProps extends Omit<React.ComponentProps<"div">, "children"> {
  /**
   * `selected` is a box the reader has picked, `hovered` the one under the pointer, `marquee` the rectangle being
   * dragged. All three read as a selection without relying on color alone: the marquee's border is dashed.
   */
  state?: SelectionBoxState;
  /**
   * A name for the box, drawn as a tag against its leading edge. It flips below the box when there is no room
   * above, which the caller signals with `labelPosition`.
   */
  label?: React.ReactNode;
  /** `above` is the default; `below` for a box too close to the top of the viewport. */
  labelPosition?: "above" | "below";
}

/**
 * The highlight drawn over an arbitrary element of the page while the reader picks one. Position and size are
 * geometry the caller measures, so they arrive through `style`; only the look lives here.
 */
export function SelectionBox({
  state = "selected",
  label,
  labelPosition = "above",
  className,
  ...props
}: SelectionBoxProps) {
  return (
    <div
      data-slot="selection-box"
      data-state={state}
      aria-hidden="true"
      className={cn("absolute", stateClass[state], className)}
      {...props}
    >
      {label != null && (
        <Badge
          shape="square"
          data-slot="selection-box-label"
          className={cn(
            "absolute start-0 max-w-72 truncate font-mono",
            labelPosition === "below" ? "top-full" : "bottom-full",
          )}
        >
          {label}
        </Badge>
      )}
    </div>
  );
}
