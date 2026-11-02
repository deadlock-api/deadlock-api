import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

type SmartLinkProps = {
  href: string;
  external?: boolean;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "href" | "target" | "rel">;

export function SmartLink({ href, external, children, ...rest }: SmartLinkProps) {
  if (external) {
    return (
      <a data-slot="smart-link" href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
        {/* The new tab is announced, not only implied by an icon some links do not draw. */}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    // Exact: a link to a section is not `aria-current="page"` on every page below it.
    <Link data-slot="smart-link" to={href} preload="intent" activeOptions={{ exact: true }} {...rest}>
      {children}
    </Link>
  );
}
