import { useQuery } from "@tanstack/react-query";
import { Download, ImageIcon, Share2 } from "lucide-react";
import { useId, useState } from "react";

import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { ActionButton } from "~/components/ui/action-button";
import { Card } from "~/components/ui/card";
import { CopyButton } from "~/components/ui/copy-button";
import { Field } from "~/components/ui/field";
import { type ShareImageAction, type ShareImageStatus, useShareImage } from "~/components/ui/hooks/use-share-image";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { badgeLabel, getRankImageUrl } from "~/lib/rank-utils";
import { cn } from "~/lib/utils";
import { hasDamageMatrix, mergeDamageSources } from "~/lib/year-recap/recap";
import {
  SHARE_FORMAT_IDS,
  SHARE_FORMATS,
  type ShareFormat,
  shareCardAlt,
  shareCardData,
  shareFilename,
  shareText,
} from "~/lib/year-recap/share-card";
import { renderShareCard } from "~/lib/year-recap/share-card-render";
import type { ModeRecap, YearRecap } from "~/lib/year-recap/types";
import { abilitiesQueryOptions, heroesQueryOptions, itemUpgradesQueryOptions } from "~/queries/asset-queries";
import { ranksQueryOptions } from "~/queries/ranks-query";
import { steamProfileQueryOptions } from "~/queries/steam-queries";

import { useNamedDamageSources } from "./useDamageSources";

// The skeleton keeps the shape of the image it stands for.
const PREVIEW_ASPECT: Record<ShareFormat, string> = {
  story: "aspect-9/16",
  square: "aspect-square",
  wide: "aspect-video",
};

const OUTCOME: Record<ShareImageAction, { done: string; failed: string }> = {
  share: { done: "Shared.", failed: "Could not share the image. Download it instead." },
  copy: {
    done: "Image copied. Paste it into a post or a chat.",
    failed: "Could not copy the image. Download it instead.",
  },
  save: { done: "Image saved.", failed: "Could not save the image. Try again." },
};

/** What became of the last action pressed, while its status says so. */
function outcome(status: Record<ShareImageAction, ShareImageStatus>, last: ShareImageAction | undefined): string {
  const state = last && status[last];
  return last && (state === "done" || state === "failed") ? OUTCOME[last][state] : "";
}

/**
 * The share image at the end of the recap: a PNG of the headline numbers in three sizes, made in the browser, with
 * the actions this browser can do on it (share sheet, download, copy) and the post text.
 */
export function RecapShare({ recap, main }: { recap: YearRecap; main: ModeRecap }) {
  const reasonId = useId();
  const [format, setFormat] = useState<ShareFormat>("story");
  const [last, setLast] = useState<ShareImageAction>();
  const profile = useQuery(steamProfileQueryOptions(recap.account_id));
  const heroes = useQuery(heroesQueryOptions);
  const ranks = useQuery(ranksQueryOptions);
  const abilities = useQuery(abilitiesQueryOptions);
  const items = useQuery(itemUpgradesQueryOptions);
  const [signature] = useNamedDamageSources(
    hasDamageMatrix(main.totals) ? mergeDamageSources(main.damage_sources).slice(0, 1) : [],
  );
  const [top] = main.heroes;
  const hero = top ? heroes.data?.find((candidate) => candidate.id === top.hero_id) : undefined;
  const peak = main.rank?.peak_badge;
  const data = shareCardData({
    recap,
    main,
    name: profile.data?.personaname,
    heroName: hero?.name,
    peakRank: peak === undefined ? null : badgeLabel(ranks.data, peak),
    signature: signature?.name,
  });
  const sources = {
    avatar: profile.data?.avatarfull ?? profile.data?.avatar ?? null,
    hero: hero?.images.icon_hero_card_webp ?? hero?.images.icon_hero_card ?? null,
    badge:
      peak === undefined
        ? null
        : (getRankImageUrl(
            ranks.data?.find((rank) => rank.tier === Math.floor(peak / 10)),
            "png",
            peak % 10,
          ) ?? null),
  };
  // Drawn once what it shows has loaded, so the image is not made twice.
  const inputsReady = [profile, heroes, ranks, abilities, items].every((query) => !query.isLoading);
  const card = useQuery({
    queryKey: ["year-recap-share-card", format, data, sources],
    queryFn: () => renderShareCard({ format, data, sources }),
    enabled: inputsReady,
    staleTime: Infinity,
    retry: false,
  });

  const { support, status, share, copy, save } = useShareImage();
  const spec = SHARE_FORMATS[format];
  const filename = shareFilename(recap.year, format);
  const text = shareText(data);
  const image = card.data?.blob;
  const canCopy = support?.copy ?? false;
  const reasons = [
    support && !support.share ? "Sharing to an app works on phones." : null,
    support && !support.copy ? "This browser cannot copy images." : null,
    !image && !card.isError ? "The image is still being made." : null,
  ].filter(Boolean);
  const describedBy = reasons.length > 0 ? reasonId : undefined;

  return (
    <div className="flex w-full flex-col items-center justify-center gap-6 @3xl/story:flex-row @3xl/story:gap-10">
      <div className="flex w-full min-w-0 justify-center @3xl/story:flex-1">
        <Card tone="inset" size="flush" className="w-fit max-w-full">
          {card.data ? (
            <img
              src={card.data.url}
              width={spec.width}
              height={spec.height}
              alt={shareCardAlt(data)}
              className="block story-media-fit"
            />
          ) : card.isError ? (
            <ErrorState
              variant="inline"
              title="Could not make the image"
              description="Something went wrong while drawing it."
              onRetry={() => void card.refetch()}
              retrying={card.isFetching}
            />
          ) : (
            <LoadingState
              variant="skeleton"
              label="the share image"
              className={cn("story-media-fit h-dvh", PREVIEW_ASPECT[format])}
            />
          )}
        </Card>
      </div>
      <Stack gap={4} align="center" className="w-full max-w-sm shrink-0 @3xl/story:w-96">
        <Field
          label="Image size"
          description={`${spec.width} × ${spec.height}, for ${spec.use}`}
          className="w-full max-w-sm"
        >
          <Segmented value={format} onValueChange={setFormat}>
            {SHARE_FORMAT_IDS.map((id) => (
              <SegmentedItem key={id} value={id}>
                {SHARE_FORMATS[id].label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
        <Inline gap={2} justify="center">
          {support?.share && (
            <ActionButton
              size="touch"
              icon={Share2}
              status={status.share}
              busyLabel="Sharing"
              doneLabel="Shared"
              failedLabel="Share failed"
              aria-disabled={!image || undefined}
              aria-describedby={!image ? describedBy : undefined}
              onClick={() => {
                if (!image) return;
                setLast("share");
                void share(image, { filename, title: `My ${recap.year} in Deadlock`, text });
              }}
            >
              Share
            </ActionButton>
          )}
          <ActionButton
            size="touch"
            variant={support?.share ? "outline" : "default"}
            icon={Download}
            status={status.save}
            busyLabel="Saving"
            doneLabel="Saved"
            failedLabel="Save failed"
            aria-disabled={!image || undefined}
            aria-describedby={!image ? describedBy : undefined}
            onClick={() => {
              if (!image) return;
              setLast("save");
              void save(image, filename);
            }}
          >
            Download PNG
          </ActionButton>
          <ActionButton
            size="touch"
            variant="outline"
            icon={ImageIcon}
            status={status.copy}
            busyLabel="Copying"
            doneLabel="Copied"
            failedLabel="Copy failed"
            aria-disabled={!image || !canCopy || undefined}
            aria-describedby={!image || !canCopy ? describedBy : undefined}
            onClick={() => {
              if (!image || !canCopy) return;
              setLast("copy");
              void copy(image);
            }}
          >
            Copy image
          </ActionButton>
          <CopyButton size="touch" variant="outline" text={text}>
            Copy text
          </CopyButton>
        </Inline>
        {reasons.length > 0 && (
          <Text as="p" id={reasonId} variant="caption" tone="muted" align="center">
            {reasons.join(" ")}
          </Text>
        )}
        <output className="text-center">
          <Text variant="caption" tone="muted">
            {outcome(status, last)}
          </Text>
        </output>
      </Stack>
    </div>
  );
}
