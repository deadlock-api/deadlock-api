/**
 * `public/_headers` for responses the Worker renders itself. Cloudflare applies that file only to static assets it
 * serves directly; every `run_worker_first` route and every page that is not prerendered bypasses it. Reading the same
 * file keeps one list of security headers for both.
 */

interface HeaderRule {
  pattern: RegExp;
  headers: [name: string, value: string][];
}

/** A `_headers` path pattern: `*` matches any run of characters, everything else is literal. */
function toPattern(path: string): RegExp {
  const escaped = path
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

export function parseHeadersFile(source: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of source.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: toPattern(line.trim()), headers: [] });
      continue;
    }
    const separator = line.indexOf(":");
    const rule = rules.at(-1);
    if (separator < 0 || !rule) continue;
    rule.headers.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
  }
  return rules;
}

/**
 * The headers `_headers` gives `pathname`. A later rule replaces a header an earlier one set, which is how the file
 * reads (`/streamkit/widgets/*` lifts the `/*` frame ban for OBS).
 */
export function headersFor(rules: HeaderRule[], pathname: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rule of rules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const [name, value] of rule.headers) result.set(name.toLowerCase(), value);
  }
  return result;
}
