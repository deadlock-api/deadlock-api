import type { ReactNode } from "react";

/** Compact headings keep filters and data close; longer context remains available on demand. */
export function DataPageHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-col items-center gap-1 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      {children && (
        <details className="max-w-3xl text-xs text-muted-foreground">
          <summary className="mx-auto w-fit cursor-pointer rounded-sm px-1 py-0.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            About this data
          </summary>
          <div className="pt-1 text-sm leading-relaxed">{children}</div>
        </details>
      )}
    </header>
  );
}
