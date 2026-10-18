import { cn } from "~/lib/utils";

interface RevealCaptionProps extends React.ComponentProps<"div"> {
  /** Off: the caption keeps its place but is invisible and hidden from screen readers. */
  revealed?: boolean;
}

/**
 * The answer's name under the art of a guessing round. It is laid out from the start, invisible until `revealed`, so
 * revealing the answer moves nothing; it then fades in. Children are its lines (the name, then what it belongs to).
 */
export function RevealCaption({ revealed = false, className, ...props }: RevealCaptionProps) {
  return (
    <div
      data-slot="reveal-caption"
      data-state={revealed ? "revealed" : "hidden"}
      aria-hidden={!revealed || undefined}
      className={cn(
        "flex flex-col items-center text-center font-mono transition-[opacity,visibility] duration-slow",
        !revealed && "invisible opacity-0",
        className,
      )}
      {...props}
    />
  );
}
