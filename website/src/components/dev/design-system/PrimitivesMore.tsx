import { Bold, ExternalLink, FolderOpen, Italic, Underline } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { Specimen, Variants } from "~/components/dev/design-system/Specimen";
import { PrefetchAnchor } from "~/components/domain/navigation/PrefetchAnchor";
import { SmartLink } from "~/components/domain/navigation/SmartLink";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Heading } from "~/components/ui/heading";
import { IconTile } from "~/components/ui/icon-tile";
import { ImgWithSkeleton } from "~/components/ui/img-with-skeleton";
import { OptimizedImage } from "~/components/ui/optimized-image";
import { Skeleton } from "~/components/ui/skeleton";
import { Toaster } from "~/components/ui/sonner";
import { Toggle } from "~/components/ui/toggle";
import { useHydrated } from "~/hooks/useHydrated";

const HEADING_SIZES = ["eyebrow", "xs", "sm", "default", "lg", "xl", "2xl"] as const;
const SHOWN_MONTH = new Date(2026, 8, 1);

export function HeadingSpecimen() {
  return (
    <Specimen
      name="Heading"
      source="ui/heading"
      note="A heading that is not the title of a page, section, panel or card: those come from PageHeader, Section, PanelHeader and CardTitle. as sets the level by outline, size sets the look."
    >
      <div className="flex flex-col gap-2">
        {HEADING_SIZES.map((size) => (
          <div key={size} className="flex flex-wrap items-baseline gap-x-3">
            <code className="w-16 shrink-0 font-mono text-2xs text-muted-foreground">{size}</code>
            <Heading as="h4" size={size}>
              Win rate by rank
            </Heading>
          </div>
        ))}
      </div>
    </Specimen>
  );
}

export function ToggleSpecimen() {
  return (
    <Specimen
      name="Toggle"
      source="ui/toggle"
      note="One independent on/off button. Several of them that belong together are a ToggleGroup."
    >
      <Variants label="variant">
        <Toggle aria-label="Bold (default)" defaultPressed>
          <Bold />
        </Toggle>
        <Toggle variant="outline" aria-label="Italic (outline)">
          <Italic />
        </Toggle>
        <Toggle variant="outline" defaultPressed>
          <Underline /> With text
        </Toggle>
        <Toggle variant="outline" disabled>
          Disabled
        </Toggle>
      </Variants>
      <Variants label="size">
        {(["sm", "default", "lg"] as const).map((size) => (
          <Toggle key={size} size={size} variant="outline">
            {size}
          </Toggle>
        ))}
      </Variants>
    </Specimen>
  );
}

/** Calendar formats `data-day` and the month dropdown in the viewer's locale, so server markup would not match. */
function CalendarExamples() {
  const hydrated = useHydrated();
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 8, 14));
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(2026, 8, 7),
    to: new Date(2026, 8, 18),
  });

  if (!hydrated) return <Skeleton className="h-72 w-full" />;
  return (
    <Variants className="items-start gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">mode="single"</span>
        <Calendar
          mode="single"
          defaultMonth={SHOWN_MONTH}
          selected={date}
          onSelect={setDate}
          weekStartsOn={1}
          className="rounded-lg border"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">mode="range", showWeekNumber</span>
        <Calendar
          mode="range"
          defaultMonth={SHOWN_MONTH}
          selected={range}
          onSelect={setRange}
          weekStartsOn={1}
          showWeekNumber
          className="rounded-lg border"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">captionLayout="dropdown", disabled days</span>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          defaultMonth={SHOWN_MONTH}
          disabled={{ after: new Date(2026, 8, 20) }}
          weekStartsOn={1}
          className="rounded-lg border"
        />
      </div>
    </Variants>
  );
}

export function PrimitivesMore() {
  return (
    <>
      <Specimen
        name="Calendar"
        source="ui/calendar"
        note="The month grid inside date pickers. On a page, reach for DateRangePicker, which adds the presets and the reset."
      >
        <CalendarExamples />
      </Specimen>

      <Specimen
        name="IconTile"
        source="ui/icon-tile"
        note="The framed icon that leads a feature card, a step or a list entry. Decorative: the text beside it names it."
      >
        <Variants className="gap-6">
          {(["muted", "primary"] as const).map((tone) =>
            (["default", "sm"] as const).map((size) => (
              <span key={`${tone}-${size}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconTile tone={tone} size={size}>
                  <FolderOpen />
                </IconTile>
                {tone} · {size}
              </span>
            )),
          )}
        </Variants>
      </Specimen>

      <Specimen
        name="Empty"
        source="ui/empty"
        note="The shadcn parts under EmptyState. Pages use EmptyState; compose these only for an empty screen with a custom layout."
      >
        <Variants className="grid items-stretch md:grid-cols-2">
          <Empty className="border md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen />
              </EmptyMedia>
              <EmptyTitle>No saved builds</EmptyTitle>
              <EmptyDescription>
                Builds you save show up here. <a href="#empty">Learn more</a>
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm">Browse builds</Button>
            </EmptyContent>
          </Empty>
          <Empty className="border md:p-6">
            <EmptyHeader>
              <EmptyMedia>
                <FolderOpen className="size-8 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>EmptyMedia variant="default"</EmptyTitle>
              <EmptyDescription>The media slot without the tile, for an illustration or an avatar.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Variants>
      </Specimen>

      <Specimen
        name="ImgWithSkeleton"
        source="ui/img-with-skeleton"
        note="An image that shows a Skeleton of the same classes until it has loaded or failed. For remote images whose size is set by className."
      >
        <Variants className="gap-6">
          <ImgWithSkeleton src="/favicon.png" alt="Deadlock API logo" className="size-12 rounded-lg" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ImgWithSkeleton src="/favicon.png" alt="" className="size-5 rounded" />
            default skeleton size (size-5)
          </div>
        </Variants>
      </Specimen>

      <Specimen
        name="OptimizedImage"
        source="ui/optimized-image"
        note="An image from public/ served through Cloudflare image resizing as a srcSet. In dev and for SVGs it renders the original unchanged."
      >
        <Variants>
          <OptimizedImage
            src="/logo/deadchaps.png"
            alt="Deadchaps logo"
            widths={[192, 384]}
            sizes="192px"
            width={600}
            height={127}
            loading="lazy"
            className="h-auto w-48 object-contain"
          />
        </Variants>
      </Specimen>

      <Specimen
        name="PrefetchAnchor"
        source="domain/navigation/PrefetchAnchor"
        note="A plain <a> that prefetches the document on hover or focus. For links that must do a full page load, such as the sidebar."
      >
        <Variants>
          <Button asChild variant="outline" size="sm">
            <PrefetchAnchor to="/analytics/heroes">As a button</PrefetchAnchor>
          </Button>
          <Button asChild variant="link" className="h-auto p-0">
            <PrefetchAnchor to="/analytics/items">As a text link</PrefetchAnchor>
          </Button>
        </Variants>
      </Specimen>

      <Specimen
        name="SmartLink"
        source="domain/navigation/SmartLink"
        note="One link for data-driven hrefs: a router Link with intent preloading, or a new-tab anchor with rel set when external."
      >
        <Variants>
          <Button asChild variant="link" className="h-auto p-0">
            <SmartLink href="/analytics/heroes">Internal: router Link</SmartLink>
          </Button>
          <Button asChild variant="link" className="h-auto p-0">
            <SmartLink href="https://github.com/deadlock-api" external>
              External: new tab <ExternalLink />
            </SmartLink>
          </Button>
        </Variants>
      </Specimen>

      <Specimen
        name="Sonner"
        source="ui/sonner"
        note="Toasts for the result of an action that has no place on the page. The Toaster is mounted once in routes/__root.tsx; call toast() from sonner."
      >
        <Variants>
          <Button variant="outline" size="sm" onClick={() => toast("Removed saved match 38291204")}>
            toast()
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.success("Steam account added")}>
            success
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info("A new patch was detected")}>
            info
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.warning("Data for this patch is incomplete")}>
            warning
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.error("Could not copy to the clipboard")}>
            error
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast("Removed saved match", {
                description: "Match 38291204 is no longer in your list.",
                action: { label: "Undo", onClick: () => toast.success("Restored") },
              })
            }
          >
            description and action
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
                loading: "Saving…",
                success: "Saved",
                error: "Could not save",
              })
            }
          >
            promise
          </Button>
        </Variants>
        <Variants label="a second Toaster, addressed by id">
          <Toaster id="design-system" position="top-center" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast("Shown by the top-center Toaster", { toasterId: "design-system" })}
          >
            toasterId
          </Button>
        </Variants>
      </Specimen>
    </>
  );
}
