import { Link } from "@tanstack/react-router";

import { TextLink } from "~/components/ui/text-link";
import { usePeriodLists } from "~/hooks/usePeriodLists";
import { currentPatchLabel } from "~/lib/period";

/**
 * The patch the pages' default date range covers, named as titles name it ("Nov 26 Patch") and linked to its patch
 * page, where its win rate changes are. For the line that says which period a page's numbers are from; a season is
 * plain text. Keeps the color of the text around it, underlined so it still reads as a link.
 */
export function CurrentPatchLink({
  tone = "inherit",
  underline = "always",
  children,
  ...props
}: Omit<React.ComponentProps<typeof TextLink>, "asChild" | "href" | "external">) {
  const lists = usePeriodLists();
  const patch = lists.patches[0];
  if (!patch) return children ?? null;
  return (
    <TextLink data-slot="current-patch-link" asChild tone={tone} underline={underline} {...props}>
      <Link to="/patches/$patchId" params={{ patchId: patch.id }} preload="intent">
        {children ?? currentPatchLabel(lists)}
      </Link>
    </TextLink>
  );
}
