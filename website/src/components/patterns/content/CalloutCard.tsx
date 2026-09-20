import { Card } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { cn } from "~/lib/utils";

interface CalloutCardProps extends Omit<
  React.ComponentProps<typeof Card>,
  "title" | "size" | "interaction" | "asChild"
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** An `IconTile` or image above the title. */
  media?: React.ReactNode;
  /** The one thing to do: usually a single `Button size="lg"`. */
  action?: React.ReactNode;
  /** Fine print under the action: the price, a condition. */
  footer?: React.ReactNode;
  as?: "h2" | "h3" | "h4";
  size?: "sm" | "default";
}

/** A centred invitation to do one thing: subscribe, upgrade, sign in. Not a status message (that is `Alert`). */
export function CalloutCard({
  title,
  description,
  media,
  action,
  footer,
  as = "h2",
  size = "default",
  tone = "primary",
  className,
  children,
  ...props
}: CalloutCardProps) {
  return (
    <Card
      data-slot="callout-card"
      tone={tone}
      size={size}
      className={cn("items-center text-center", size === "sm" ? "gap-2 px-3" : "gap-4 px-6", className)}
      {...props}
    >
      {media}
      <div className="flex min-w-0 flex-col items-center gap-2">
        <Heading as={as} size={size === "sm" ? "default" : "xl"}>
          {title}
        </Heading>
        {description && (
          <p className={cn("max-w-md text-balance text-muted-foreground", size === "sm" ? "text-xs" : "text-sm")}>
            {description}
          </p>
        )}
      </div>
      {children}
      {(action || footer) && (
        <div className="flex flex-col items-center gap-3">
          {action}
          {footer && (
            <p data-slot="callout-card-footer" className="text-xs text-muted-foreground">
              {footer}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
