import { PanelSection } from "~/components/patterns/panel/Panel";
import { ErrorState } from "~/components/patterns/states/ErrorState";

/**
 * A section of the build's details whose request failed: its title stays, and one line says what failed with a retry,
 * so the section never silently disappears.
 */
export function BuildSectionError({
  title,
  what,
  onRetry,
  retrying,
}: {
  /** The section's title, as it shows when loaded. */
  title: string;
  /** What could not be loaded: "the matchups". */
  what: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="flex flex-col">
      <PanelSection variant="label" title={title} />
      <ErrorState variant="inline" title={`Could not load ${what}`} onRetry={onRetry} retrying={retrying} />
    </section>
  );
}
