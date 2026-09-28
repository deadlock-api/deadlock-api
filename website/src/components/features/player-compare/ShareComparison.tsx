import { useRouterState } from "@tanstack/react-router";
import { CheckIcon, LinkIcon } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/components/ui/hooks/use-copy-to-clipboard";
import { SharePreview } from "~/components/ui/share-preview";
import { compareCardUrl, compareShareParams, compareShareUrl } from "~/lib/compare-share";
import type { CompareFilters } from "~/queries/player-compare-queries";

/**
 * The comparison's share card and its short link: clicking the card or the button copies the link. Posted anywhere,
 * the link previews as this card (the page's og:image), with its dates pinned so everyone sees the same numbers.
 */
export function ShareComparison({
  filters,
  ...props
}: { filters: CompareFilters } & React.ComponentProps<typeof Panel>) {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const { copied, copy } = useCopyToClipboard();
  const params = compareShareParams(searchStr, filters);
  const shareUrl = compareShareUrl(params);
  const copyLink = () => void copy(shareUrl);
  return (
    <Panel {...props}>
      <PanelHeader size="sm" title="Share the result">
        <Button size="xs" onClick={copyLink}>
          {copied ? <CheckIcon aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
          {copied ? "Link copied" : "Copy link"}
        </Button>
      </PanelHeader>
      <PanelBody size="sm">
        {/* Relative, so the preview comes from the site the reader is on. */}
        <SharePreview
          src={compareCardUrl(params, "")}
          width={1200}
          height={630}
          alt="The share card of this comparison"
          aria-label="Copy the link to this comparison"
          state={copied ? "confirmed" : "idle"}
          onClick={copyLink}
        />
      </PanelBody>
    </Panel>
  );
}
