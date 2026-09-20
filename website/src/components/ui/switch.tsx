import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "~/lib/utils";

// The tracks are under 24px tall; the pseudo-element extends the hit area to 24px.
const TRACK = {
  default: "h-5 w-9 after:-inset-y-0.5",
  sm: "h-3.5 w-6 after:-inset-y-1.25",
};

// The travel is the track's inner width minus the thumb, mirrored where the reading direction is.
const THUMB = {
  default: "size-4 data-[state=checked]:translate-x-4.5 rtl:data-[state=checked]:-translate-x-4.5",
  sm: "size-3 data-[state=checked]:translate-x-2.5 rtl:data-[state=checked]:-translate-x-2.5",
};

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer relative inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none after:absolute after:inset-x-0 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40 data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary/90 data-[state=unchecked]:bg-input/80 data-[state=unchecked]:hover:bg-input",
        TRACK[size],
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full ring-0 transition-transform data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-foreground",
          THUMB[size],
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
