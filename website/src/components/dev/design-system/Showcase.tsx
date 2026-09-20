import { useCallback, useEffect, useState } from "react";

import { Charts } from "~/components/dev/design-system/Charts";
import { Domain } from "~/components/dev/design-system/Domain";
import { Foundations } from "~/components/dev/design-system/Foundations";
import { Layout } from "~/components/dev/design-system/Layout";
import { NAV, NAV_NAMES, slug } from "~/components/dev/design-system/nav";
import { Patterns } from "~/components/dev/design-system/Patterns";
import { Primitives } from "~/components/dev/design-system/Primitives";
import { SideNavSection } from "~/components/dev/design-system/SideNavSection";
import { SlotLayoutContext, slotStore } from "~/components/dev/design-system/slots";
import { SideNav, SideNavItem } from "~/components/patterns/navigation/SideNav";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Heading } from "~/components/ui/heading";
import { SearchInput } from "~/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Inline, Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";

/** The id of the chapter or specimen nearest the top of the viewport. */
function useActiveTarget() {
  const [active, setActive] = useState<string>(NAV[0].id);
  useEffect(() => {
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        const first = [...visible]
          .filter((el) => el instanceof HTMLElement && el.dataset.navTarget === "specimen")
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (first) setActive(first.id);
      },
      { rootMargin: "-10% 0px -60% 0px" },
    );
    for (const el of document.querySelectorAll("[data-nav-target]")) observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return active;
}

const LANDING_WINDOW_MS = 2000;
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

let stopLanding = () => {};

/**
 * Scrolls to a specimen and keeps it there while the page settles: the specimens around a target mount only once
 * it is near (Specimen's LazyBody) and change the page height. Any input from the reader ends it at once.
 */
function landOn(id: string) {
  stopLanding();
  const target = document.getElementById(id);
  if (!target) return;
  const land = () => target.scrollIntoView({ block: "start" });
  const observer = new ResizeObserver(land);
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
  };
  const timer = setTimeout(stop, LANDING_WINDOW_MS);
  for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
  stopLanding = stop;
  land();
  observer.observe(document.body);
}

function jumpTo(id: string) {
  landOn(id);
  history.replaceState(null, "", `#${id}`);
}

/** Index links and deep links move by the URL hash, which the browser scrolls to before the lazy bodies settle. */
function useLandOnHash() {
  useEffect(() => {
    const land = () => {
      if (location.hash.length > 1) landOn(decodeURIComponent(location.hash.slice(1)));
    };
    land();
    window.addEventListener("hashchange", land);
    return () => {
      stopLanding();
      window.removeEventListener("hashchange", land);
    };
  }, []);
}

/** Which sections the reader opened or closed by hand. Anything not in here follows the active specimen. */
type Toggled = ReadonlyMap<string, boolean>;

function Sidebar({ active }: { active: string }) {
  const [query, setQuery] = useState("");
  const [toggled, setToggled] = useState<Toggled>(new Map());
  const needle = query.trim().toLowerCase();

  const chapters = NAV.map((chapter) => ({
    ...chapter,
    groups: chapter.groups
      .map((group) => ({ ...group, items: group.items.filter((item) => item.toLowerCase().includes(needle)) }))
      .filter((group) => group.items.length > 0),
  })).filter((chapter) => chapter.groups.length > 0);

  const firstMatch = chapters[0]?.groups[0]?.items[0];
  const holdsActive = (items: readonly string[]) => items.some((item) => slug(item) === active);
  // A search opens everything it matched; otherwise a section is open if the reader opened it, or if it holds the
  // specimen on screen and the reader has not closed it.
  const isOpen = (id: string, containsActive: boolean) => needle !== "" || (toggled.get(id) ?? containsActive);
  const toggle = (id: string) => (open: boolean) => setToggled((prev) => new Map(prev).set(id, open));
  const setAll = (open: boolean) =>
    setToggled(
      new Map(
        NAV.flatMap((chapter) => [chapter.id, ...chapter.groups.map((group) => `${chapter.id}/${group.title}`)]).map(
          (id) => [id, open],
        ),
      ),
    );

  return (
    <div className="sticky top-0 hidden max-h-dvh w-60 shrink-0 flex-col gap-2 self-start py-4 lg:flex">
      <SearchInput
        size="sm"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === "Enter" && firstMatch) jumpTo(slug(firstMatch));
        }}
        placeholder="Find a component"
        aria-label="Find a component"
      />
      <Inline gap={1} justify="between">
        <Text variant="meta" tone="muted">
          {NAV_NAMES.size} specimens
        </Text>
        <Inline gap={0.5}>
          <Button variant="ghost" size="xs" onClick={() => setAll(true)}>
            Expand all
          </Button>
          <Button variant="ghost" size="xs" onClick={() => setAll(false)}>
            Collapse all
          </Button>
        </Inline>
      </Inline>
      <SideNav
        aria-label="Design system"
        className="min-h-0 scrollbar-thin gap-1 overflow-y-auto overscroll-contain pe-1"
      >
        {chapters.map((chapter) => {
          const chapterItems = chapter.groups.flatMap((group) => group.items);
          return (
            <SideNavSection
              key={chapter.id}
              label={chapter.title}
              count={chapterItems.length}
              open={isOpen(chapter.id, holdsActive(chapterItems) || active === chapter.id)}
              onOpenChange={toggle(chapter.id)}
            >
              {chapter.groups.map((group) => {
                const id = `${chapter.id}/${group.title}`;
                return (
                  <SideNavSection
                    key={id}
                    level={2}
                    label={group.title}
                    count={group.items.length}
                    open={isOpen(id, holdsActive(group.items))}
                    onOpenChange={toggle(id)}
                  >
                    {group.items.map((item) => (
                      <SideNavItem
                        key={item}
                        href={`#${slug(item)}`}
                        active={active === slug(item)}
                        className="gap-2 px-2 py-1 text-xs font-normal"
                      >
                        {item}
                      </SideNavItem>
                    ))}
                  </SideNavSection>
                );
              })}
            </SideNavSection>
          );
        })}
        {chapters.length === 0 && (
          <Text variant="caption" tone="muted">
            Nothing matches.
          </Text>
        )}
      </SideNav>
    </div>
  );
}

/** Below `lg` the sidebar has no room: the same table of contents as a sticky select. */
function JumpSelect({ active }: { active: string }) {
  return (
    <div className="sticky top-2 z-10 lg:hidden">
      <Select value={active} onValueChange={jumpTo}>
        <SelectTrigger size="sm" className="w-full bg-card" aria-label="Jump to a component">
          <SelectValue placeholder="Jump to a component" />
        </SelectTrigger>
        <SelectContent>
          {NAV.flatMap((chapter) =>
            chapter.groups.map((group) => (
              <SelectGroup key={`${chapter.id}/${group.title}`}>
                <SelectLabel>
                  {chapter.title} · {group.title}
                </SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item} value={slug(item)}>
                    {item}
                  </SelectItem>
                ))}
              </SelectGroup>
            )),
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Where a specimen (or a chapter intro) lands. The ref is stable, so a re-render of the page never empties a slot. */
function Slot({ id, ...props }: React.ComponentProps<"div"> & { id: string }) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      slotStore.register(id, element);
      return () => slotStore.register(id, null);
    },
    [id],
  );
  return <div id={id} ref={ref} {...props} />;
}

export default function Showcase() {
  const active = useActiveTarget();
  useLandOnHash();
  return (
    <PageShell density="content">
      <PageHeader
        title="Design system"
        description="Every token and shared component, live. The contract is docs/design-system.md; pnpm lint enforces it."
        eyebrow={
          <Badge variant="warning" size="sm">
            dev only
          </Badge>
        }
        align="start"
      />
      <div className="flex min-w-0 items-start gap-6">
        <Sidebar active={active} />
        <div className="flex min-w-0 flex-1 flex-col gap-10">
          <JumpSelect active={active} />
          {NAV.map((chapter) => (
            <section
              key={chapter.id}
              id={chapter.id}
              aria-labelledby={`${chapter.id}-title`}
              className="flex min-w-0 scroll-mt-16 flex-col gap-4 lg:scroll-mt-4"
            >
              <Stack gap={1} className="border-b pb-2">
                <Heading as="h2" size="2xl" id={`${chapter.id}-title`}>
                  {chapter.title}
                </Heading>
                <Slot id={`${chapter.id}-intro`} className="max-w-3xl type-body text-muted-foreground" />
              </Stack>
              {chapter.groups.map((group) => (
                <Stack key={group.title} gap={3}>
                  <Heading as="h3" size="eyebrow">
                    {group.title}
                  </Heading>
                  {group.items.map((item) => (
                    <Slot
                      key={item}
                      id={slug(item)}
                      data-nav-target="specimen"
                      className="min-w-0 scroll-mt-16 lg:scroll-mt-4"
                    />
                  ))}
                </Stack>
              ))}
            </section>
          ))}
          {/* The chapter files render here. Every listed specimen leaves for its slot above; what stays visible is
              a specimen nav.ts does not know yet. */}
          <SlotLayoutContext.Provider value={true}>
            <Stack gap={4}>
              <Foundations />
              <Layout />
              <Primitives />
              <Patterns />
              <Charts />
              <Domain />
            </Stack>
          </SlotLayoutContext.Provider>
        </div>
      </div>
    </PageShell>
  );
}
