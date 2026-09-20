// Class lists shared by several components. They are plain Tailwind classes, so a class passed later through `cn()`
// still overrides any of them. Written out in full so Tailwind can see every class.

/** The one focus treatment (Law 17). Put it first in a class list. */
export const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** The focus treatment of a bordered control: the border takes the ring color too. */
export const FOCUS_RING_BORDER =
  "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const INVALID_STATE = "aria-invalid:border-destructive aria-invalid:ring-destructive/40";

export const DISABLED_STATE = "disabled:pointer-events-none disabled:opacity-50";

/** Icons inside a control: inert, never squeezed, 16px unless the icon sets its own `size-*`. */
export const SVG_SLOT = "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/** Enter direction and exit of content positioned by Radix Popper. The enter animation itself stays with the component. */
export const POPPER_MOTION =
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95";

export const DIALOG_OVERLAY =
  "fixed inset-0 z-50 bg-scrim data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0";

// Centred by the inline insets plus auto margins rather than `start-1/2` and a translate, which would need a mirrored
// translate in RTL. The insets are also the gutter on a narrow screen, so the width needs no viewport breakpoint.
// It is the query container of its header and footer.
export const DIALOG_CONTENT = `${FOCUS_RING} @container fixed inset-x-4 top-1/2 z-50 mx-auto grid max-h-dvh -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg duration-normal data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95`;
