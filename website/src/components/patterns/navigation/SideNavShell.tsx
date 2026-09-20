import { MenuIcon, XIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { FOCUS_RING } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

/**
 * The fixed desktop column of the app navigation, from `md` up. It is the app's shell, so it is fixed to the
 * viewport by nature; the page beside it is offset by the same width (`md:ps-64` on its parent). Its children are
 * `SideNavHeader`, a `SideNav` with `className="flex-1 overflow-y-auto"`, and `SideNavFooter`s.
 */
export function SideNavShell({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="side-nav-shell"
      className={cn(
        "glass z-30 hidden border-e border-sidebar-border text-sidebar-foreground md:fixed md:inset-y-0 md:start-0 md:flex md:w-64 md:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const SideNavDrawerContext = createContext<{ close: () => void } | null>(null);

/** The native modal `<dialog>` behind `SideNavDrawer`: it supplies inertness, focus return and Escape. */
function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => ref.current?.close(), []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (desktop.matches) ref.current?.close();
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  return {
    open,
    close,
    show: () => {
      ref.current?.showModal();
      setOpen(true);
    },
    dialogProps: {
      ref,
      onClose: () => setOpen(false),
      onClick: (event: React.MouseEvent<HTMLDialogElement>) => {
        // Following any link inside is a navigation, which dismisses the drawer.
        if ((event.target as Element).closest("a[href]")) return close();
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (outside) close();
      },
    },
  };
}

/**
 * The same navigation below `md`: a floating menu button that opens a drawer sliding in from the leading edge.
 * A click on the backdrop or on any link inside closes it; a `SideNavHeader` inside gets a close button.
 */
export function SideNavDrawer({
  title = "Navigation",
  triggerLabel = "Open menu",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  /** Names the dialog for assistive technology. */
  title?: string;
  triggerLabel?: string;
}) {
  const { open, close, show, dialogProps } = useModalDialog();
  const titleId = useId();
  const context = useMemo(() => ({ close }), [close]);

  return (
    <div data-slot="side-nav-drawer" className={cn("md:hidden", className)} {...props}>
      <Button
        variant="ghost"
        size="icon"
        onClick={show}
        className="glass fixed start-3 top-3 z-40 border border-sidebar-border"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MenuIcon className="size-5" />
      </Button>

      {/* The content stays mounted so opening it does not build a second React tree during the tap. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the backdrop is pointer-dismissable; the native dialog supplies Escape */}
      <dialog
        {...dialogProps}
        data-slot="side-nav-drawer-dialog"
        aria-labelledby={titleId}
        // `mobile-navigation` (effects.css) carries the slide-in animation and locks page scroll while open.
        // ds-allow law4-outer-margin: m-0 resets the `margin: auto` a browser gives a modal dialog
        className="mobile-navigation fixed inset-y-0 start-0 m-0 h-dvh max-h-none w-64 max-w-full border-e border-sidebar-border bg-background p-0 text-sidebar-foreground shadow-lg backdrop:bg-black/50"
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        <SideNavDrawerContext.Provider value={context}>
          <div className="flex h-full flex-col">{children}</div>
        </SideNavDrawerContext.Provider>
      </dialog>
    </div>
  );
}

/** The brand row on top of the navigation. Inside a `SideNavDrawer` it adds the close button, which takes focus on open. */
export function SideNavHeader({
  closeLabel = "Close menu",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { closeLabel?: string }) {
  const drawer = useContext(SideNavDrawerContext);
  return (
    <div
      data-slot="side-nav-header"
      className={cn("flex shrink-0 items-center gap-2 border-b border-sidebar-border px-4 py-3", className)}
      {...props}
    >
      {children}
      {/* Native dialog autofocus runs on showModal(), not on page load. */}
      {/* oxlint-disable jsx-a11y/no-autofocus */}
      {drawer && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={closeLabel}
          autoFocus
          onClick={drawer.close}
        >
          <XIcon />
        </Button>
      )}
      {/* oxlint-enable jsx-a11y/no-autofocus */}
    </div>
  );
}

/** The logo and product name, as the link home. The child is the link (`asChild`), holding an image and the name. */
export function SideNavBrand({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"a"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="side-nav-brand"
      className={cn(FOCUS_RING, "flex min-w-0 flex-1 items-center gap-3 rounded-md text-lg font-semibold", className)}
      {...props}
    />
  );
}
