import { useRouterState } from "@tanstack/react-router";
import { CheckIcon, LinkIcon } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/components/ui/hooks/use-copy-to-clipboard";
import { SharePreview } from "~/components/ui/share-preview";
import { compareCardUrl, compareShareParams, compareShareUrl } from "~/lib/compare-share";
import type { CompareFilters } from "~/queries/player-compare-queries";

/**
 * The comparison's short link and the card it unfurls as. Posted in Discord (or anywhere), the link previews as this
 * card (the page's og:image), with its dates pinned so everyone sees the same numbers. The button and the card both
 * copy the link.
 */
export function ShareComparison({
  filters,
  ...props
}: { filters: CompareFilters } & React.ComponentProps<typeof Panel>) {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const { copied, failed, copy } = useCopyToClipboard();
  const params = compareShareParams(searchStr, filters);
  const shareUrl = compareShareUrl(params);
  const copyLink = () => void copy(shareUrl);
  return (
    <Panel {...props}>
      <PanelHeader size="sm" title="Share">
        <Button size="xs" onClick={copyLink} aria-live="polite">
          {copied ? <CheckIcon aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
          {copied ? "Link copied" : failed ? "Copy failed" : "Copy link"}
        </Button>
      </PanelHeader>
      {/* The card as large as the panel allows, in both directions: the panel's height comes from its grid row. */}
      <PanelBody size="sm" className="@container-size flex min-h-40 flex-1 items-center justify-center">
        <SharePreview
          // Relative, so the preview comes from the site the reader is on.
          src={compareCardUrl(params, "")}
          width={1200}
          height={630}
          alt="The share card of this comparison"
          aria-label="Copy the link to this comparison"
          state={copied ? "confirmed" : "idle"}
          onClick={copyLink}
          // The header's button is the keyboard's way to copy; the card is a second, pointer-sized target for it.
          tabIndex={-1}
          fit="contain"
        />
      </PanelBody>
    </Panel>
  );
}
