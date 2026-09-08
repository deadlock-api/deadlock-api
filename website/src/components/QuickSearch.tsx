import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import Fuse from "fuse.js";
import { CornerDownLeft, SearchIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { AssetImage, type AssetImageData } from "~/components/AssetImage";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { heroSlug } from "~/lib/hero-slug";
import { itemSlug } from "~/lib/item-slug";
import { bottomNavLinks, navGroups, topLinks } from "~/lib/site-nav";
import { cn } from "~/lib/utils";
import {
  filterPlayableHeroes,
  filterShopableItems,
  heroesQueryOptions,
  itemUpgradesQueryOptions,
} from "~/queries/asset-queries";

interface SearchEntry {
  kind: "hero" | "item" | "page";
  name: string;
  detail: string;
  to: string;
  image?: AssetImageData;
  icon?: React.ComponentType<{ className?: string }>;
}

const KIND_LABELS: Record<SearchEntry["kind"], string> = { hero: "Heroes", item: "Items", page: "Pages" };
const KIND_ORDER: SearchEntry["kind"][] = ["hero", "item", "page"];
const MAX_PER_KIND = 6;

const PAGE_ENTRIES: SearchEntry[] = [
  ...topLinks.map((link) => ({ link, group: "Home" })),
  ...navGroups.flatMap((group) => group.links.map((link) => ({ link, group: group.label }))),
  ...bottomNavLinks.map((link) => ({ link, group: "Services" })),
].map(({ link, group }) => ({ kind: "page", name: link.label, detail: group, to: link.to, icon: link.icon }));

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const QuickSearchContext = createContext<() => void>(() => {});

export function useQuickSearch() {
  return useContext(QuickSearchContext);
}

export function QuickSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openSearch = useCallback(() => setOpen(true), []);

  return (
    <QuickSearchContext.Provider value={openSearch}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Remounting per open is what resets the query and cursor. */}
        {open && <QuickSearchDialog onClose={() => setOpen(false)} />}
      </Dialog>
    </QuickSearchContext.Provider>
  );
}

function QuickSearchDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [rawCursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: heroes = [] } = useQuery(heroesQueryOptions);
  const { data: items = [] } = useQuery(itemUpgradesQueryOptions);

  const entries = useMemo<SearchEntry[]>(
    () => [
      ...filterPlayableHeroes(heroes).map<SearchEntry>((hero) => ({
        kind: "hero",
        name: hero.name,
        detail: "Hero",
        to: `/heroes/${heroSlug(hero.name)}`,
        image: {
          webp: hero.images?.minimap_image_webp,
          png: hero.images?.minimap_image,
          fallbackSrc: hero.images?.minimap_image_webp ?? hero.images?.minimap_image,
          alt: "",
        },
      })),
      ...filterShopableItems(items).map<SearchEntry>((item) => ({
        kind: "item",
        name: item.name,
        detail: `Tier ${item.item_tier} · ${capitalize(item.item_slot_type)}`,
        to: `/items/${itemSlug(item.name)}`,
        image: { webp: item.shop_image_webp, png: item.shop_image, fallbackSrc: item.shop_image_small, alt: "" },
      })),
      ...PAGE_ENTRIES,
    ],
    [heroes, items],
  );

  const fuse = useMemo(() => new Fuse(entries, { keys: ["name"], threshold: 0.25, ignoreLocation: true }), [entries]);

  const flat = useMemo(() => {
    const term = query.trim();
    const matches = term ? fuse.search(term).map((result) => result.item) : PAGE_ENTRIES;
    return KIND_ORDER.flatMap((kind) => matches.filter((entry) => entry.kind === kind).slice(0, MAX_PER_KIND));
  }, [query, fuse]);

  const groups = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        offset: flat.findIndex((entry) => entry.kind === kind),
        entries: flat.filter((entry) => entry.kind === kind),
      })).filter((group) => group.entries.length > 0),
    [flat],
  );
  const cursor = Math.min(rawCursor, Math.max(0, flat.length - 1));

  const select = (entry: SearchEntry) => {
    onClose();
    navigate({ to: entry.to });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.max(0, Math.min(flat.length - 1, cursor + (event.key === "ArrowDown" ? 1 : -1)));
      setCursor(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && flat[cursor]) {
      event.preventDefault();
      select(flat[cursor]);
    }
  };

  return (
    <DialogContent
      className="top-[15%] flex max-h-[70dvh] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      showCloseButton={false}
    >
      <DialogHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border p-3.5">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <DialogTitle className="sr-only">Quick search</DialogTitle>
        <DialogDescription className="sr-only">Jump to any hero, item, or page on the site.</DialogDescription>
        <Input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search heroes, items, pages…"
          aria-label="Search heroes, items, pages"
          className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </DialogHeader>

      <div ref={listRef} className="overflow-y-auto p-2">
        {flat.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No results</p>}
        {groups.map((group) => (
          <div key={group.kind} className="mb-1 last:mb-0">
            <p className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {KIND_LABELS[group.kind]}
            </p>
            {group.entries.map((entry, i) => {
              const index = group.offset + i;
              const active = index === cursor;
              const Icon = entry.icon;
              return (
                <button
                  key={entry.to}
                  type="button"
                  data-index={index}
                  onClick={() => select(entry)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                    active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                >
                  {entry.image ? (
                    <AssetImage
                      asset={entry.image}
                      isLoading={false}
                      emptyClassName="size-7 rounded bg-muted"
                      imgClassName={cn("size-7 object-contain", entry.kind === "hero" && "rounded-full")}
                    />
                  ) : Icon ? (
                    <span className="flex size-7 items-center justify-center rounded bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.detail}</span>
                  {active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </DialogContent>
  );
}

export function QuickSearchButton({ onOpen, className }: { onOpen?: () => void; className?: string }) {
  const openSearch = useQuickSearch();
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );

  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openSearch();
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md border border-sidebar-border/50 px-3 py-1.5 text-sm text-sidebar-foreground/50 transition-colors duration-150 hover:border-sidebar-border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        className,
      )}
    >
      <SearchIcon className="size-4 shrink-0 opacity-60" />
      <span className="flex-1 truncate text-left">Search…</span>
      <kbd className="rounded border border-sidebar-border/50 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/40">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
