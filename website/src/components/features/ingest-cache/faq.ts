import { INGEST_TRACKER_WINDOW_DAYS } from "~/components/domain/ingest/links";

/** Where Steam keeps its cache, most common first. The FAQ answers below name the most common ones. */
export const STEAM_CACHE_PATHS = {
  windows: "C:\\Program Files (x86)\\Steam\\appcache\\httpcache",
  macos: "~/Library/Application Support/Steam/appcache/httpcache",
  linux: [
    "~/.local/share/Steam/appcache/httpcache",
    "~/.steam/steam/appcache/httpcache",
    "~/.var/app/com.valvesoftware.Steam/.local/share/Steam/appcache/httpcache",
  ],
  linuxMore: [
    "~/.var/app/com.valvesoftware.Steam/.steam/steam/appcache/httpcache",
    "~/.var/app/com.valvesoftware.Steam/.steam/root/appcache/httpcache",
    "~/.steam/root/appcache/httpcache",
    "~/.steam/debian-installation/appcache/httpcache",
    "~/snap/steam/common/.local/share/Steam/appcache/httpcache",
    "~/snap/steam/common/.steam/steam/appcache/httpcache",
    "~/snap/steam/common/.steam/root/appcache/httpcache",
  ],
} as const;

/**
 * The questions on /ingest-cache. The page renders them and its head turns the same list into FAQPage JSON-LD, so
 * what search engines read is what visitors see.
 */
export interface IngestFaqEntry {
  question: string;
  answer: string;
}

export const INGEST_FAQ: readonly IngestFaqEntry[] = [
  {
    question: "Why are my Deadlock matches missing on Statlocker, Tracklock or other trackers?",
    answer:
      "Valve does not publish a list of every match. To load a match's stats and replay, a tracker needs its match ID and a salt, a key that Deadlock downloads through Steam when it shows you the match. Deadlock API finds many matches by itself, but not all of them, and a match it has not found is missing on every tracker built on its data until someone sends that match ID and salt.",
  },
  {
    question: "How do I get my matches on tracker sites?",
    answer:
      "Install the background tool on this page. It sends every match you play to Deadlock API, which passes it on to Statlocker, Tracklock, Lockblaze and the other sites that use its data. To send the matches already on your PC once, without installing anything, upload your Steam cache folder instead.",
  },
  {
    question: "What is the difference between the background tool and the cache upload?",
    answer:
      "The background tool runs on your PC all the time. It sends the matches already in your Steam cache when it starts, then each new match as Deadlock downloads or loads it. While the game is closed, it asks Steam for up to 40 missing matches a day for each Steam account saved on your PC: new matches of your Steam friends who play Deadlock first, then matches still missing for everyone. The cache upload runs once in your browser and sends what is in your cache right now, so new matches need another upload. It needs no install and works on macOS, where the tool only runs in Docker.",
  },
  {
    question: "Where is Steam's httpcache folder?",
    answer: `It is the httpcache folder inside Steam's appcache folder. On Windows that is ${STEAM_CACHE_PATHS.windows}, on macOS ${STEAM_CACHE_PATHS.macos}, and on Linux usually ${STEAM_CACHE_PATHS.linux[0]} or ${STEAM_CACHE_PATHS.linux[1]}.`,
  },
  {
    question: "What does it send, and is it safe?",
    answer:
      "The cache upload sends only match IDs and their salts, taken from the addresses of the match files in Steam's cache. The background tool sends the same plus your Steam account ID, a public number that already appears in every match you play. To find your friends' new matches, it also sends the account IDs of your Steam friends. While Deadlock runs, it reads match salts from the game's memory, read-only. It asks Steam for missing matches with the saved sessions of the Steam accounts on your PC and never sends those sessions to Deadlock API. Nothing else about your account, your PC or your other games is sent. The tool is open source on GitHub, and its README lists the switches that turn off the Steam requests and the memory reading.",
  },
  {
    question: "Do I get the player tracker for running the tool?",
    answer: `Yes. Every Steam account the background tool sent matches for in the last ${INGEST_TRACKER_WINDOW_DAYS} days gets its player tracker on deadlock-api.com for free: full match history, rank progression, hero stats, and the teammates and opponents you play with most. There is nothing to sign in to: open your profile on the tracker page once we have checked one of the matches the tool sent. A match counts for whoever sent it first, so matches someone else already sent do not unlock it. The one-time cache upload does not unlock it, because it does not send your Steam account ID.`,
  },
  {
    question: "Does it work on macOS?",
    answer: `The cache upload does: choose ${STEAM_CACHE_PATHS.macos} and the matches are sent. Finder hides the Library folder, so press Cmd+Shift+G in the file dialog and paste the path. The background tool runs on Windows and Linux, and on macOS in Docker. In the Docker command, mount "$HOME/Library/Application Support/Steam" instead of ~/.steam/steam, keeping the quotes because the path has a space.`,
  },
];

/** FAQPage JSON-LD for the same questions. */
export function ingestFaqJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: INGEST_FAQ.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
