import { HighlightedCode, type HighlightLanguage } from "~/components/patterns/code/HighlightedCode";
import { Card } from "~/components/ui/card";
import { CopyButton } from "~/components/ui/copy-button";
import { FOCUS_RING, SCROLLBAR_THIN } from "~/components/ui/recipes";
import { cn } from "~/lib/utils";

type CardRootProps = Omit<
  React.ComponentProps<typeof Card>,
  "children" | "tone" | "size" | "radius" | "interaction" | "asChild"
>;

/**
 * One command or path to copy, in a framed row with its copy button. `language` highlights it; without one it is
 * plain monospace, for a file path. A listing of several lines is `HighlightedCode actions="copy"`.
 */
export function CopyableCode({
  code,
  language,
  size = "default",
  copyLabel = "Copy",
  className,
  ...props
}: CardRootProps & {
  code: string;
  language?: HighlightLanguage;
  size?: "sm" | "default";
  /** Names the copy button: "Copy command", "Copy path". */
  copyLabel?: string;
}) {
  return (
    <Card
      data-slot="copyable-code"
      data-size={size}
      tone="inset"
      size="xs"
      radius="md"
      className={cn("flex-row items-start gap-2", size === "sm" ? "py-1 ps-3 pe-1" : "py-2 ps-3 pe-2", className)}
      {...props}
    >
      {language ? (
        <HighlightedCode code={code} language={language} variant="plain" className="flex-1 self-center" />
      ) : (
        <code
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable by keyboard
          tabIndex={0}
          className={cn(
            FOCUS_RING,
            SCROLLBAR_THIN,
            "min-w-0 flex-1 self-center overflow-x-auto rounded-sm font-mono text-xs whitespace-pre text-foreground",
          )}
        >
          {code}
        </code>
      )}
      <CopyButton size="icon-sm" text={code} aria-label={copyLabel} title={copyLabel} />
    </Card>
  );
}

/**
 * An address the reader takes elsewhere: a label, the value and its copy button on one line. `children` are further
 * actions on the trailing edge, such as "Open".
 */
export function CopyableUrl({
  label,
  value = "",
  placeholder = "Nothing to copy yet",
  overflow = "truncate",
  copyLabel,
  className,
  children,
  ...props
}: Omit<CardRootProps, "defaultValue"> & {
  /** What the address is, as an eyebrow before it: "Manifest", "MCP URL". */
  label?: React.ReactNode;
  value?: string;
  /** Shown instead of the address while `value` is empty. */
  placeholder?: React.ReactNode;
  /** `wrap` shows the whole address on several lines, when the reader has to check it before copying. */
  overflow?: "truncate" | "wrap";
  copyLabel?: string;
  children?: React.ReactNode;
}) {
  const name = copyLabel ?? (typeof label === "string" ? `Copy ${label}` : "Copy URL");
  return (
    <Card
      data-slot="copyable-url"
      tone="glass"
      size="xs"
      className={cn("flex-row flex-wrap items-center gap-x-3 gap-y-1 px-3", className)}
      {...props}
    >
      {label && <span className="shrink-0 eyebrow">{label}</span>}
      {value ? (
        <code
          title={overflow === "truncate" ? value : undefined}
          // A floor on its width, so the actions wrap onto a second line before the address shrinks to "ht…".
          className={cn(
            "max-w-full min-w-48 flex-1 font-mono text-xs text-foreground",
            overflow === "wrap" ? "break-all" : "truncate",
          )}
        >
          {value}
        </code>
      ) : (
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">{placeholder}</span>
      )}
      <CopyButton size="icon-sm" text={value} disabled={!value} aria-label={name} title={name} />
      {children}
    </Card>
  );
}
