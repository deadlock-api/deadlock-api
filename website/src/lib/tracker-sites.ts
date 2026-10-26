/** A site that shows Deadlock API match data. */
export interface TrackerSite {
  name: string;
  /** The site's icon, a copy in public/tracker-sites so visitors' browsers never contact the site. */
  icon: string;
  /** Set for sponsors only: their logo links to them. */
  href?: string;
}

/**
 * Sites built on Deadlock API's match data, sponsors first.
 */
export const TRACKER_SITES: readonly TrackerSite[] = [
  {
    name: "DeadChaps",
    icon: "/tracker-sites/deadchaps.webp",
    href: "https://www.deadchaps.gg/?ref=deadlock-api.com",
  },
  {
    name: "Statlocker",
    icon: "/tracker-sites/statlocker.webp",
    href: "https://statlocker.gg/?ref=deadlock-api.com",
  },
  { name: "EDL", icon: "/tracker-sites/edl.webp", href: "https://edl.gg" },
  { name: "Tracklock", icon: "/tracker-sites/tracklock.webp" },
  { name: "LockBlaze", icon: "/tracker-sites/lockblaze.webp" },
  { name: "Tracker.gg", icon: "/tracker-sites/tracker-gg.webp" },
  { name: "Mobalytics", icon: "/tracker-sites/mobalytics.webp" },
  { name: "Blitz", icon: "/tracker-sites/blitz.webp" },
  { name: "Lockbuilds", icon: "/tracker-sites/lockbuilds.webp" },
  { name: "Deadlock Academy", icon: "/tracker-sites/deadlock-academy.webp" },
  {
    name: "Soulcounter",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230a0d0f'/%3E%3Cpath d='M16 5l9 5v12l-9 5-9-5V10z' fill='none' stroke='%23d4ae62' stroke-width='2.5'/%3E%3Ccircle cx='16' cy='16' r='3.5' fill='%23d4ae62'/%3E%3C/svg%3E",
  },
  { name: "VP Esports", icon: "/tracker-sites/vp-esports.webp" },
  { name: "Deadlock Labs", icon: "/tracker-sites/deadlock-labs.webp" },
  { name: "Soultracker", icon: "/tracker-sites/soultracker.webp" },
  { name: "Rankalytics", icon: "/tracker-sites/rankalytics.webp" },
  { name: "LockTV", icon: "/tracker-sites/locktv.webp" },
  { name: "LockCodex", icon: "/tracker-sites/lockcodex.webp" },
  { name: "Deadlock Builds", icon: "/tracker-sites/deadlock-builds.webp" },
  { name: "Urnlock", icon: "/tracker-sites/urnlock.webp" },
  { name: "Buildlock", icon: "/tracker-sites/buildlock.svg" },
  { name: "DeadUnlock", icon: "/tracker-sites/deadunlock.svg" },
  { name: "LiveLock", icon: "/tracker-sites/livelock.webp" },
  { name: "Statlocked", icon: "/tracker-sites/statlocked.webp" },
  { name: "DTV", icon: "/tracker-sites/dtv.webp" },
  { name: "Chudlock", icon: "/tracker-sites/chudlock.svg" },
  { name: "ScrimCache", icon: "/tracker-sites/scrimcache.webp" },
  { name: "The Cursed Apple", icon: "/tracker-sites/the-cursed-apple.svg" },
  { name: "Deadlock+", icon: "/tracker-sites/deadlock.webp" },
  { name: "Tierspire", icon: "/tracker-sites/tierspire.webp" },
  { name: "Deadlock Brasil", icon: "/tracker-sites/deadlock-brasil.webp" },
  { name: "SoulScope", icon: "/tracker-sites/soulscope.svg" },
  { name: "DeadStats", icon: "/tracker-sites/deadstats.webp" },
  { name: "Deadlock Sensei", icon: "/tracker-sites/deadlock-sensei.webp" },
  { name: "Deadlock Meta", icon: "/tracker-sites/deadlock-meta.webp" },
  { name: "Deadlock Mods", icon: "/tracker-sites/deadlock-mods.webp" },
  { name: "DraftMeta", icon: "/tracker-sites/draftmeta.webp" },
  { name: "Buildlock.io", icon: "/tracker-sites/buildlock-io.webp" },
];
