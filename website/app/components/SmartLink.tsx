import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

type SmartLinkProps = {
  href: string;
  external?: boolean;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "href" | "target" | "rel">;

export function SmartLink({ href, external, children, ...rest }: SmartLinkProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={href} prefetch="intent" {...rest}>
      {children}
    </Link>
  );
}
