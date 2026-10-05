import { cn } from "~/lib/utils";

/**
 * Rows of sounds: each a name, an optional picture of who or what makes it, and its takes as `SoundButton`s. A wide
 * container lays the rows out in columns (two from `@4xl`, three from `@8xl`, four from `@9xl`), so a row is never
 * mostly empty. Inside a row the name has a fixed width and the takes follow it, so they line up down a column; in a
 * narrow column they drop below the name.
 */
export function SoundList({ className, children, ...props }: React.ComponentProps<"ul">) {
  return (
    <div data-slot="sound-list-frame" className="@container">
      <ul
        data-slot="sound-list"
        className={cn("grid grid-cols-1 gap-x-4 @4xl:grid-cols-2 @8xl:grid-cols-3 @9xl:grid-cols-4", className)}
        {...props}
      >
        {children}
      </ul>
    </div>
  );
}

interface SoundListItemProps extends Omit<React.ComponentProps<"li">, "title"> {
  /** The name of the line or effect. */
  label: React.ReactNode;
  /** A quiet second line: the folder, the speaker. */
  meta?: React.ReactNode;
  /** A small picture before the name, such as the speaker's hero icon. Decorative: the label names the row. */
  media?: React.ReactNode;
  /** The row whose sound is playing; it is marked by a fill and an edge, its button says the rest. */
  active?: boolean;
}

export function SoundListItem({
  label,
  meta,
  media,
  active = false,
  className,
  children,
  ...props
}: SoundListItemProps) {
  return (
    <li
      data-slot="sound-list-item"
      data-active={active || undefined}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-s-2 border-b border-s-transparent px-3 py-1.5",
        "data-active:border-s-primary data-active:bg-subtle-active",
        className,
      )}
      {...props}
    >
      <div className="flex w-56 max-w-full min-w-0 items-center gap-2">
        {media && (
          <span data-slot="sound-list-item-media" aria-hidden="true" className="flex shrink-0 items-center">
            {media}
          </span>
        )}
        <div className="flex min-w-0 flex-col">
          <span data-slot="sound-list-item-label" className="text-sm break-words">
            {label}
          </span>
          {meta && (
            <span data-slot="sound-list-item-meta" className="truncate text-xs text-muted-foreground">
              {meta}
            </span>
          )}
        </div>
      </div>
      {children && (
        <div data-slot="sound-list-item-takes" className="flex min-w-32 flex-1 flex-wrap items-center gap-1">
          {children}
        </div>
      )}
    </li>
  );
}
