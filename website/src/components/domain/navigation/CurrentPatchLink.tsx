import { Link } from "@tanstack/react-router";

import { TextLink } from "~/components/ui/text-link";
import { PATCHES } from "~/lib/constants";
import { currentPatchLabel } from "~/lib/seasons";

/**
 * The patch the pages' default date range covers, named as titles name it ("Oct 30 Patch") and linked to its patch
 * page, where its win rate changes are. For the line that says which period a page's numbers are from; a season is
 * plain text. Keeps the color of the text around it, underlined so it still reads as a link.
 */
export function CurrentPatchLink({
  tone = "inherit",
  underline = "always",
  children,
  ...props
}: Omit<React.ComponentProps<typeof TextLink>, "asChild" | "href" | "external">) {
  return (
    <TextLink data-slot="current-patch-link" asChild tone={tone} underline={underline} {...props}>
      <Link to="/patches/$patchId" params={{ patchId: PATCHES[0].id }} preload="intent">
        {children ?? currentPatchLabel()}
      </Link>
    </TextLink>
  );
}
