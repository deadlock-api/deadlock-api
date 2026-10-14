/** A site that shows Deadlock API match data. */
export interface TrackerSite {
  name: string;
  /** The site's own icon, served from its own host. */
  icon: string;
  /** Set for sponsors only: their logo links to them. */
  href?: string;
}

/**
 * Sites built on Deadlock API's match data, sponsors first. Their icons load from their own servers, so each host is
 * also listed under img-src in public/_headers; the few behind a bot wall come from Google's favicon service.
 */
export const TRACKER_SITES: readonly TrackerSite[] = [
  {
    name: "DeadChaps",
    icon: "https://www.deadchaps.gg/favicon.png",
    href: "https://www.deadchaps.gg/?ref=deadlock-api.com",
  },
  {
    name: "Statlocker",
    icon: "https://statlocker.gg/logo-icon-192.png",
    href: "https://statlocker.gg/?ref=deadlock-api.com",
  },
  { name: "EDL", icon: "https://edl.gg/edl-apple-touch-icon.png", href: "https://edl.gg" },
  { name: "Tracklock", icon: "https://tracklock.gg/favicon.ico" },
  { name: "LockBlaze", icon: "https://www.lockblaze.com/favicon.ico" },
  { name: "Tracker.gg", icon: "https://www.google.com/s2/favicons?domain=tracker.gg&sz=64" },
  { name: "Mobalytics", icon: "https://www.google.com/s2/favicons?domain=mobalytics.gg&sz=64" },
  { name: "Blitz", icon: "https://blitz.gg/favicon.png" },
  { name: "Lockbuilds", icon: "https://lockbuilds.com/favicon.ico" },
  { name: "Deadlock Academy", icon: "https://deadlockacademy.com/apple-touch-icon.png" },
  {
    name: "Soulcounter",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230a0d0f'/%3E%3Cpath d='M16 5l9 5v12l-9 5-9-5V10z' fill='none' stroke='%23d4ae62' stroke-width='2.5'/%3E%3Ccircle cx='16' cy='16' r='3.5' fill='%23d4ae62'/%3E%3C/svg%3E",
  },
  { name: "VP Esports", icon: "https://deadlock.vpesports.com/favicon.ico" },
  { name: "Deadlocker", icon: "https://deadlocker.gg/icon.png" },
  { name: "Deadlock Labs", icon: "https://deadlocklabs.gg/favicon-192.png" },
  { name: "Soultracker", icon: "https://soultracker.gg/apple-touch-icon.png" },
  { name: "Rankalytics", icon: "https://rankalytics.gg/icon.png" },
  { name: "LockTV", icon: "https://locktv.org/favicon-192.png" },
  { name: "LockCodex", icon: "https://lockcodex.com/apple-icon.png" },
  { name: "Deadlock Builds", icon: "https://www.deadlockbuilds.pro/favicon.ico" },
  { name: "Urnlock", icon: "https://www.urnlock.com/favicon-96.png" },
  { name: "Buildlock", icon: "https://buildlock.net/icon.svg" },
  { name: "DeadUnlock", icon: "https://deadunlock.gg/favicon.svg" },
  { name: "LiveLock", icon: "https://livelock.gg/resources/favicon.ico" },
  { name: "Statlocked", icon: "https://statlocked.com/favicon.ico" },
  { name: "DTV", icon: "https://dtv.gg/icon.png" },
  { name: "Chudlock", icon: "https://chudlock.com/favicon.svg" },
  { name: "ScrimCache", icon: "https://scrimcache.vercel.app/favicon-mlc.png" },
  { name: "The Cursed Apple", icon: "https://thecursedapple.app/favicon.svg" },
  { name: "Deadlock+", icon: "https://deadlockplus.app/favicon.png" },
  { name: "Tierspire", icon: "https://tierspire.com/apple-touch-icon.png" },
  { name: "Deadlock Brasil", icon: "https://dlbr.gg/apple-touch-icon.png" },
];
