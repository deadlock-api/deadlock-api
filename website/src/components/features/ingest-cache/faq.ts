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
      "The background tool runs on your PC all the time: it sends the matches in your Steam cache when it starts, sends each new match as Deadlock downloads it, and while the game is closed it fetches a few matches a day that are still missing for everyone. The cache upload runs once in your browser: it sends the matches in your cache right now and nothing after that, so new matches need another upload. It needs no install and works on macOS, where the tool does not run.",
  },
  {
    question: "Where is Steam's httpcache folder?",
    answer:
      "It is the httpcache folder inside Steam's appcache folder. On Windows that is C:\\Program Files (x86)\\Steam\\appcache\\httpcache, on macOS ~/Library/Application Support/Steam/appcache/httpcache, and on Linux usually ~/.local/share/Steam/appcache/httpcache or ~/.steam/steam/appcache/httpcache.",
  },
  {
    question: "What does it send, and is it safe?",
    answer:
      "The cache upload sends only match IDs and their salts, read from the addresses of the match files in Steam's cache. The background tool sends the same, plus your Steam account ID, a public number that already appears in every match you play. Nothing else about your account, your PC or your other games is sent. The tool uses your saved Steam session to ask Steam for missing matches, and that session is never sent to Deadlock API. The tool is open source on GitHub.",
  },
  {
    question: "Does it work on macOS?",
    answer:
      "The cache upload does: choose ~/Library/Application Support/Steam/appcache/httpcache and the matches are sent. The background tool runs on Windows and Linux, and in Docker.",
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
