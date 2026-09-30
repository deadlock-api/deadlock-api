import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bookmark, BookmarkX, ClipboardPaste, Library } from "lucide-react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useId, useState } from "react";

import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Section } from "~/components/patterns/page/Section";
import { ErrorState } from "~/components/patterns/states/ErrorState";
import { LoadingState } from "~/components/patterns/states/LoadingState";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Code } from "~/components/ui/code";
import { CopyButton } from "~/components/ui/copy-button";
import { CornerBadge } from "~/components/ui/corner-badge";
import { Field } from "~/components/ui/field";
import { Grid } from "~/components/ui/grid";
import { Input } from "~/components/ui/input";
import { OptionRow } from "~/components/ui/option-row";
import { PixelImage, PixelStage } from "~/components/ui/pixel-stage";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Segmented, SegmentedItem } from "~/components/ui/segmented";
import { SliderField } from "~/components/ui/slider-field";
import { Inline, Stack } from "~/components/ui/stack";
import { SwitchField } from "~/components/ui/switch-field";
import { Text } from "~/components/ui/text";
import { Textarea } from "~/components/ui/textarea";
import { isClientError } from "~/lib/http";
import { pageTitle, seo } from "~/lib/seo";
import { useStoredState } from "~/lib/use-stored-state";
import { useDebouncedValue } from "~/lib/utils";
import {
  CROSSHAIR_CODE_PREFIX,
  type CrosshairSettings,
  DEFAULT_CROSSHAIR_SETTINGS,
  crosshairCodeImageQueryOptions,
  crosshairCodeQueryOptions,
  crosshairCodeSettingsQueryOptions,
  crosshairImageQueryOptions,
  isCrosshairCode,
} from "~/queries/crosshair-queries";

export const Route = createFileRoute("/crosshair")({
  component: CrosshairEditor,
  head: () =>
    seo({
      title: pageTitle("Crosshair Editor"),
      description:
        "Import a Deadlock crosshair share code or design your own with sliders, see it at its true size over a game scene, and copy the code to use in game.",
      path: "/crosshair",
    }),
});

/** Dragging a slider redraws a moment after it stops, not on every step. */
const SETTINGS_DEBOUNCE_MS = 150;

const RESOLUTION_LABELS = { "1080": "1080p", "1440": "1440p", "2160": "4K" } as const;
type Resolution = keyof typeof RESOLUTION_LABELS;
const RESOLUTIONS = Object.keys(RESOLUTION_LABELS) as Resolution[];

const BACKDROP_LABELS = { game: "Game", neutral: "Grey", light: "Light", dark: "Dark" } as const;
type Backdrop = keyof typeof BACKDROP_LABELS;

const ZOOMS = ["2", "4", "8"] as const;

/** Bookmarks live only in this browser. */
const BOOKMARKS_KEY = "crosshair-bookmarks";

interface CrosshairBookmark {
  code: string;
  /** ISO time it was bookmarked. */
  savedAt: string;
}

type NumericSetting = {
  [K in keyof CrosshairSettings]: CrosshairSettings[K] extends number ? K : never;
}[keyof CrosshairSettings];

interface SliderSpec {
  key: NumericSetting;
  label: string;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const opacity = (key: NumericSetting, label: string): SliderSpec => ({
  key,
  label,
  min: 0,
  max: 1,
  step: 0.05,
  format: percent,
});

const SLIDER_GROUPS: { title: string; sliders: SliderSpec[] }[] = [
  {
    title: "Dot",
    sliders: [
      { key: "dot_size", label: "Size", min: 0, max: 20 },
      opacity("dot_opacity", "Opacity"),
      { key: "dot_outline_border", label: "Outline thickness", min: 0, max: 10 },
      { key: "dot_outline_gap", label: "Outline gap", min: 0, max: 10 },
      opacity("dot_outline_opacity", "Outline opacity"),
    ],
  },
  {
    title: "Pips",
    sliders: [
      { key: "pip_width", label: "Width", min: 0, max: 20 },
      { key: "pip_height", label: "Length", min: 0, max: 50 },
      { key: "pip_gap", label: "Gap", min: -14, max: 50 },
      opacity("pip_opacity", "Opacity"),
      { key: "pip_outline_border", label: "Outline thickness", min: 0, max: 10 },
      { key: "pip_outline_gap", label: "Outline gap", min: 0, max: 10 },
      opacity("pip_outline_opacity", "Outline opacity"),
    ],
  },
];

/** The value of a colour input for three 0-255 channels. */
function toHex(...channels: number[]): string {
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function fromHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function CrosshairEditor() {
  const [codeParam, setCodeParam] = useQueryState(
    "code",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );
  const [resolution, setResolution] = useQueryState(
    "res",
    parseAsStringLiteral(RESOLUTIONS).withDefault("1080").withOptions({ history: "replace" }),
  );
  const [backdrop, setBackdrop] = useState<Backdrop>("game");
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>("4");

  const code = codeParam.trim();
  const queryClient = useQueryClient();
  const imported = useQuery(crosshairCodeSettingsQueryOptions(code));
  // Slider changes apply on top of the imported code; importing another code starts over from it.
  const [edits, setEdits] = useState<{ code: string; settings: CrosshairSettings }>();
  const edited = edits?.code === code;
  const settings = edited ? edits.settings : (imported.data ?? DEFAULT_CROSSHAIR_SETTINGS);
  const update = (patch: Partial<CrosshairSettings>) => setEdits({ code, settings: { ...settings, ...patch } });

  const rendered = useDebouncedValue(settings, SETTINGS_DEBOUNCE_MS);
  const image = useQuery({
    ...crosshairImageQueryOptions(rendered, Number(resolution)),
    placeholderData: keepPreviousData,
  });
  const shareCode = useQuery({ ...crosshairCodeQueryOptions(rendered), placeholderData: keepPreviousData });
  // The code of what is on screen, once it is encoded; a placeholder is the previous crosshair's.
  const currentCode = shareCode.isPlaceholderData ? undefined : shareCode.data;

  const [bookmarks, saveBookmarks] = useStoredState<CrosshairBookmark[]>(BOOKMARKS_KEY, () => []);
  const bookmarked = currentCode !== undefined && bookmarks.some((bookmark) => bookmark.code === currentCode);
  const toggleBookmark = () => {
    if (currentCode === undefined) return;
    saveBookmarks(
      bookmarked
        ? bookmarks.filter((bookmark) => bookmark.code !== currentCode)
        : [{ code: currentCode, savedAt: new Date().toISOString() }, ...bookmarks],
    );
  };

  /** Loads a pasted code into the settings; the error to show when it is not a code the API accepts. */
  const importCode = async (value: string): Promise<string | null> => {
    const next = value.trim();
    if (!isCrosshairCode(next)) {
      return `A crosshair code starts with "${CROSSHAIR_CODE_PREFIX}". Check that you copied all of it.`;
    }
    try {
      await queryClient.query(crosshairCodeSettingsQueryOptions(next));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import this code.";
      return isClientError(error) ? `${message}. Check that you copied the whole code.` : message;
    }
    setEdits(undefined);
    await setCodeParam(next);
    return null;
  };

  return (
    <PageShell density="content" width="wide">
      <PageHeader
        size="lg"
        title="Crosshair Editor"
        description="Import a crosshair code or design your own with sliders"
      >
        <p>
          In Deadlock, a crosshair is shared as a code that starts with <code>DL.</code>. Paste one to see it at its
          true size over a game scene and tweak it, or start from the game's default and design your own. Copy the code
          below the preview into the crosshair settings in game.
        </p>
      </PageHeader>

      {/* Settings span both rows on the left; the preview takes whatever height the code card leaves. */}
      <Grid columns={{ base: 1, lg: 2 }} gap={6} className="@2xl:grid-rows-[1fr_auto]">
        <Section title="Settings" className="@2xl:row-span-2">
          <Card className="flex-1">
            <CardContent>
              <Stack gap={6}>
                {SLIDER_GROUPS.map((group, index) => (
                  <Section
                    key={group.title}
                    as="h3"
                    size="sm"
                    title={group.title}
                    // The card's first row holds the import, at its top right.
                    action={
                      index === 0 && (
                        <Inline gap={1} wrap="nowrap">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={bookmarked ? "Remove this crosshair's bookmark" : "Bookmark this crosshair"}
                            aria-pressed={bookmarked}
                            title={
                              bookmarked ? "Bookmarked on this browser · click to remove" : "Bookmark on this browser"
                            }
                            disabled={currentCode === undefined}
                            onClick={toggleBookmark}
                          >
                            <Bookmark fill={bookmarked ? "currentColor" : "none"} />
                          </Button>
                          <BookmarksButton
                            bookmarks={bookmarks}
                            onLoad={importCode}
                            onRemove={(code) => saveBookmarks(bookmarks.filter((bookmark) => bookmark.code !== code))}
                          />
                          <ImportCodeButton onImport={importCode} />
                        </Inline>
                      )
                    }
                  >
                    <Grid columns={{ base: 1, md: 2 }} gap={4}>
                      {group.sliders.map(({ key, label, min, max, ...slider }) => (
                        <SliderField
                          key={key}
                          label={label}
                          // An imported value outside the usual range stays reachable.
                          min={Math.min(min, settings[key])}
                          max={Math.max(max, settings[key])}
                          value={settings[key]}
                          onValueChange={(value) => update({ [key]: value })}
                          {...slider}
                        />
                      ))}
                    </Grid>
                    {group.title === "Pips" && (
                      <SwitchField
                        label="Fixed gap"
                        checked={settings.pip_gap_static}
                        onCheckedChange={(checked) => update({ pip_gap_static: checked })}
                      />
                    )}
                  </Section>
                ))}
                <Section as="h3" size="sm" title="Colour">
                  <Inline gap={6}>
                    <Field label="Colour" orientation="horizontal">
                      <Input
                        type="color"
                        aria-label="Colour"
                        value={toHex(settings.color_r, settings.color_g, settings.color_b)}
                        onChange={(event) => {
                          const [color_r, color_g, color_b] = fromHex(event.target.value);
                          update({ color_r, color_g, color_b });
                        }}
                      />
                    </Field>
                    <Field label="Outline" orientation="horizontal">
                      <Input
                        type="color"
                        aria-label="Outline colour"
                        value={toHex(settings.outline_color_r, settings.outline_color_g, settings.outline_color_b)}
                        onChange={(event) => {
                          const [outline_color_r, outline_color_g, outline_color_b] = fromHex(event.target.value);
                          update({ outline_color_r, outline_color_g, outline_color_b });
                        }}
                      />
                    </Field>
                  </Inline>
                  <SwitchField
                    label="Use the hero's crosshair"
                    checked={settings.themed}
                    onCheckedChange={(checked) => update({ themed: checked })}
                  />
                </Section>
              </Stack>
            </CardContent>
          </Card>
        </Section>

        <Section title="Preview">
          <Card className="flex-1">
            <CardContent>
              <Stack gap={4}>
                <Inline gap={4}>
                  <Field label="Screen" orientation="horizontal">
                    <Segmented
                      value={resolution}
                      onValueChange={(next) => void setResolution(next)}
                      size="sm"
                      width="hug"
                    >
                      {RESOLUTIONS.map((value) => (
                        <SegmentedItem key={value} value={value}>
                          {RESOLUTION_LABELS[value]}
                        </SegmentedItem>
                      ))}
                    </Segmented>
                  </Field>
                  <Field label="Backdrop" orientation="horizontal">
                    <Segmented value={backdrop} onValueChange={setBackdrop} size="sm" width="hug">
                      {Object.entries(BACKDROP_LABELS).map(([value, label]) => (
                        <SegmentedItem key={value} value={value}>
                          {label}
                        </SegmentedItem>
                      ))}
                    </Segmented>
                  </Field>
                  <Field label="Zoom" orientation="horizontal">
                    <Segmented value={zoom} onValueChange={setZoom} size="sm" width="hug">
                      {ZOOMS.map((value) => (
                        <SegmentedItem key={value} value={value}>
                          {value}×
                        </SegmentedItem>
                      ))}
                    </Segmented>
                  </Field>
                </Inline>
                <Preview
                  image={image.data}
                  error={image.error}
                  fetching={image.isFetching}
                  onRetry={() => void image.refetch()}
                  backdrop={backdrop}
                  zoom={Number(zoom)}
                  resolutionLabel={RESOLUTION_LABELS[resolution]}
                />
              </Stack>
            </CardContent>
          </Card>
        </Section>
        <Card>
          <CardHeader>
            <CardTitle>Crosshair code</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap={3}>
              {shareCode.data ? (
                <Code size="lg" className="break-all">
                  {shareCode.data}
                </Code>
              ) : (
                <Text variant="label">{shareCode.isError ? shareCode.error.message : "Encoding…"}</Text>
              )}
              <CopyButton
                text={shareCode.data ?? ""}
                disabled={!shareCode.data || shareCode.isPlaceholderData}
                className="self-start"
              >
                Copy code
              </CopyButton>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </PageShell>
  );
}

function Preview({
  image,
  error,
  fetching,
  onRetry,
  backdrop,
  zoom,
  resolutionLabel,
}: {
  image: string | undefined;
  error: Error | null;
  fetching: boolean;
  onRetry: () => void;
  backdrop: Backdrop;
  zoom: number;
  resolutionLabel: string;
}) {
  if (error && !image) {
    return (
      <ErrorState
        title="Could not draw this crosshair"
        description={error.message}
        onRetry={onRetry}
        retrying={fetching}
      />
    );
  }
  if (!image) return <LoadingState label="crosshair" />;

  const views = [
    {
      id: "true-size",
      label: "True size",
      scale: 1,
      alt: `The crosshair at its true size on a ${resolutionLabel} screen`,
    },
    {
      id: "enlarged",
      label: `Enlarged ${zoom}×`,
      scale: zoom,
      alt: `The crosshair enlarged ${zoom} times, each pixel drawn as a square`,
    },
  ];
  return (
    <Grid columns={{ base: 1, md: 2 }} gap={4} aria-busy={fetching || undefined}>
      {views.map((view) => (
        <Stack key={view.id} gap={2}>
          <Text variant="label">{view.label}</Text>
          <PixelStage backdrop={backdrop} className="min-h-56 flex-1">
            <PixelImage src={image} scale={view.scale} alt={view.alt} />
          </PixelStage>
        </Stack>
      ))}
      {error && <Text variant="label">{error.message}</Text>}
    </Grid>
  );
}

/**
 * A button that imports the crosshair code on the clipboard at once, or else opens a small popover to paste one into,
 * which loads as it changes and closes on a valid code.
 */
function ImportCodeButton({ onImport }: { onImport: (code: string) => Promise<string | null> }) {
  const codeId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async (value: string) => {
    setDraft(value);
    if (!value.trim()) return setError(null);
    const failure = await onImport(value);
    setError(failure);
    if (!failure) {
      setOpen(false);
      setDraft("");
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) return;
        setDraft("");
        setError(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Import a crosshair code"
          title="Import a crosshair code"
          onClick={(event) => {
            if (open) return;
            // Opening waits for the clipboard: a code on it is imported without showing the popover at all.
            event.preventDefault();
            void (async () => {
              const clipboard = await navigator.clipboard?.readText().catch(() => "");
              if (clipboard && isCrosshairCode(clipboard.trim())) {
                const failure = await onImport(clipboard);
                if (!failure) return;
                setDraft(clipboard);
                setError(failure);
              }
              setOpen(true);
            })();
          }}
        >
          <ClipboardPaste />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Import a crosshair code" className="w-80">
        <Field label="Crosshair code" htmlFor={codeId} error={error}>
          <Textarea
            id={codeId}
            value={draft}
            onChange={(event) => void load(event.target.value)}
            placeholder="DL.AQHL887tKLUv_WAF..."
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            rows={3}
            className="font-mono break-all"
          />
        </Field>
      </PopoverContent>
    </Popover>
  );
}

/** A button that opens the crosshairs bookmarked on this browser; picking one loads it. */
function BookmarksButton({
  bookmarks,
  onLoad,
  onRemove,
}: {
  bookmarks: CrosshairBookmark[];
  onLoad: (code: string) => Promise<string | null>;
  onRemove: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Bookmarked crosshairs (${bookmarks.length})`}
          title="Bookmarked crosshairs"
          className="relative"
        >
          <Library />
          {bookmarks.length > 0 && <CornerBadge aria-hidden="true">{bookmarks.length}</CornerBadge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Bookmarked crosshairs" className="w-80 p-2">
        {bookmarks.length === 0 ? (
          <Text variant="label" className="p-2">
            No bookmarks yet. Bookmark a crosshair to find it here again; bookmarks stay on this browser.
          </Text>
        ) : (
          <Stack gap={1}>
            {bookmarks.map((bookmark) => (
              <BookmarkRow
                key={bookmark.code}
                bookmark={bookmark}
                onLoad={async () => {
                  const failure = await onLoad(bookmark.code);
                  setError(failure);
                  if (!failure) setOpen(false);
                }}
                onRemove={() => onRemove(bookmark.code)}
              />
            ))}
            {error && (
              <Text variant="label" className="p-2">
                {error}
              </Text>
            )}
          </Stack>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BookmarkRow({
  bookmark,
  onLoad,
  onRemove,
}: {
  bookmark: CrosshairBookmark;
  onLoad: () => void;
  onRemove: () => void;
}) {
  const image = useQuery(crosshairCodeImageQueryOptions(bookmark.code, 1080));
  const saved = new Date(bookmark.savedAt).toLocaleDateString(undefined, { dateStyle: "medium" });
  return (
    <Inline gap={1} wrap="nowrap">
      <OptionRow
        className="min-w-0 flex-1"
        leading={
          <PixelStage size="sm" backdrop="game">
            {image.data && <PixelImage src={image.data} alt="" />}
          </PixelStage>
        }
        description={bookmark.code}
        onClick={onLoad}
      >
        Bookmarked {saved}
      </OptionRow>
      <Button variant="ghost" size="icon-sm" aria-label={`Remove the bookmark from ${saved}`} onClick={onRemove}>
        <BookmarkX />
      </Button>
    </Inline>
  );
}
