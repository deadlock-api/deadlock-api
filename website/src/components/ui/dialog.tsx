import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
