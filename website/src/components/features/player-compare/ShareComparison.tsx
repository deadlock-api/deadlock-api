import { useRouterState } from "@tanstack/react-router";
import { CheckIcon, DownloadIcon, ImageIcon, LinkIcon } from "lucide-react";

import { Panel, PanelBody, PanelHeader } from "~/components/patterns/panel/Panel";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/components/ui/hooks/use-copy-to-clipboard";
import { SharePreview } from "~/components/ui/share-preview";
import { Inline, Stack } from "~/components/ui/stack";
import { compareCardUrl, compareShareParams, compareShareUrl } from "~/lib/compare-share";
import type { CompareFilters } from "~/queries/player-compare-queries";

/** The card's PNG, fetched on click for the clipboard. */
async function fetchCard(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Card failed to load: ${response.status}`);
  return response.blob();
}

/**
 * The comparison's share card and its short link. Posted in Discord (or anywhere), the link unfurls as this card (the
 * page's og:image), with its dates pinned so everyone sees the same numbers. The image itself can be copied, to paste
 * straight into a chat, or downloaded; clicking the card copies the link.
 */
export function ShareComparison({
  filters,
  names,
  ...props
}: {
  filters: CompareFilters;
  /** The players' names, for the downloaded file's name. */
  names: readonly string[];
} & React.ComponentProps<typeof Panel>) {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const link = useCopyToClipboard();
  const image = useCopyToClipboard();
  const params = compareShareParams(searchStr, filters);
  const shareUrl = compareShareUrl(params);
  // Relative, so the preview and the copy come from the site the reader is on.
  const cardSrc = compareCardUrl(params, "");
  const copyLink = () => void link.copy(shareUrl);
  const fileName = `${names.join("-vs-").replaceAll(/[^\p{L}\p{N}-]+/gu, "_") || "comparison"}.png`;
  return (
    <Panel {...props}>
      <PanelHeader size="sm" title="Share" description="The link unfurls as this card in Discord" />
      <PanelBody size="sm">
        <Stack gap={3}>
          <SharePreview
            src={cardSrc}
            width={1200}
            height={630}
            alt="The share card of this comparison"
            aria-label="Copy the link to this comparison"
            state={link.copied ? "confirmed" : "idle"}
            onClick={copyLink}
          />
          <Inline gap={2}>
            <Button size="sm" onClick={copyLink} className="flex-1">
              {link.copied ? <CheckIcon aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
              {link.copied ? "Link copied" : "Copy link"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void image.copy(fetchCard(cardSrc))} className="flex-1">
              {image.copied ? <CheckIcon aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
              {image.copied ? "Image copied" : "Copy image"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={cardSrc} download={fileName}>
                <DownloadIcon aria-hidden="true" />
                Download
              </a>
            </Button>
          </Inline>
          <span className="sr-only" aria-live="polite">
            {link.copied ? "Link copied" : image.copied ? "Image copied" : ""}
          </span>
        </Stack>
      </PanelBody>
    </Panel>
  );
}
