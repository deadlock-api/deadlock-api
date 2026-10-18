import { cva, type VariantProps } from "class-variance-authority";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "~/components/ui/button";
import { FieldLabelContext } from "~/components/ui/hooks/use-field-control";
import { DIALOG_CONTENT, DIALOG_OVERLAY } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="dialog-overlay" className={cn(DIALOG_OVERLAY, className)} {...props} />;
}

const dialogContentVariants = cva(DIALOG_CONTENT, {
  variants: {
    size: {
      default: "max-w-lg",
      lg: "max-w-2xl",
      xl: "max-w-4xl",
      full: "max-w-7xl",
    },
  },
  defaultVariants: { size: "default" },
});

function DialogContent({
  className,
  children,
  size = "default",
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean;
  }) {
  // Radix returns focus to its `DialogTrigger`. A dialog opened from state (a slot, a row, "Add items") has none, so
  // focus fell to <body>; it goes back to whatever had it when the dialog opened, while that is still on the page.
  const opener = React.useRef<HTMLElement | null>(null);
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      {/* A dialog opened from inside a Field is not labelled by it. */}
      <FieldLabelContext value={null}>
        <DialogPrimitive.Content
          data-slot="dialog-content"
          data-size={size}
          className={cn(dialogContentVariants({ size }), className)}
          onOpenAutoFocus={(event) => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            onOpenAutoFocus?.(event);
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            const element = opener.current;
            if (event.defaultPrevented || !element?.isConnected || element === document.body) return;
            event.preventDefault();
            element.focus();
          }}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close asChild>
              <Button data-slot="dialog-close" variant="ghost" size="icon-sm" className="absolute inset-e-2 top-2">
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </FieldLabelContext>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center @sm:text-start", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      // `justify-end` is unconditional (it does nothing in the stacked column) so a caller's one class replaces it.
      className={cn("flex flex-col-reverse justify-end gap-2 @sm:flex-row", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

/**
 * Steps a dialog through a sequence (the next metric, the previous item) without closing it. It sits in the
 * `DialogHeader` beside the title, so it takes header room and never covers the content. The arrow keys anywhere in
 * the dialog step too (not from a text field or a slider, which use them), and a polite status announces `status`
 * (the new title) after each step, since focus stays on the button while the content changes around it. Name the
 * buttons by their target: "Next: Deaths".
 */
function DialogPager({
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  status,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  /** The previous button's accessible name, naming where it goes: "Previous: Kills". */
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  /** What a step lands on, announced politely after it: the new title. */
  status: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Only the steps are announced: the status stays empty until the first one, as the title is read when it opens.
  const [stepped, setStepped] = React.useState(false);
  const previous = () => {
    setStepped(true);
    onPrevious();
  };
  const next = () => {
    setStepped(true);
    onNext();
  };
  const onKey = React.useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable], [role=slider], [role=radiogroup]")) return;
    if (event.key === "ArrowLeft") previous();
    else if (event.key === "ArrowRight") next();
    else return;
    event.preventDefault();
  });
  React.useEffect(() => {
    const content = ref.current?.closest<HTMLElement>("[data-slot=dialog-content]");
    if (!content) return;
    const listener = (event: KeyboardEvent) => onKey(event);
    content.addEventListener("keydown", listener);
    return () => content.removeEventListener("keydown", listener);
  }, []);
  return (
    <div ref={ref} data-slot="dialog-pager" className={cn("flex shrink-0 items-center gap-1", className)} {...props}>
      <Button variant="outline" size="icon-sm" aria-label={previousLabel} onClick={previous}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label={nextLabel} onClick={next}>
        <ChevronRight aria-hidden="true" />
      </Button>
      <output className="sr-only">{stepped ? status : ""}</output>
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  DialogPager,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
