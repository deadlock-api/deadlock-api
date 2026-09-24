#!/usr/bin/env node
// Enforces the design system rules in docs/design-system.md. Run by `pnpm lint`.
//
// A finding is silenced by a comment containing `ds-allow <rule>: <reason>` on the same line or up to three lines
// above it. The reason is mandatory: an exception nobody can explain is a violation.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

// Lower layers never import from higher ones.
const LAYERS = ["ui", "patterns", "domain", "features", "app"];
// ui and patterns know nothing about Deadlock: no API client, no queries, no asset hooks.
const DOMAIN_FREE = ["ui", "patterns"];
const DOMAIN_IMPORT = /^(deadlock_api_client|deadlock_api_graphql_client|~\/queries\/|~\/hooks\/useAssetById)/;

// Stream overlays render inside OBS over arbitrary video with a viewer-configured theme, not on the site's surfaces.
const EXEMPT = [
  /^src\/components\/features\/streamkit\/widgets\//,
  /^src\/(hooks|lib|constants)\/streamkit\//,
  /^src\/routes\/streamkit\/widgets\//,
  /\.test\.tsx?$/,
  /^src\/routeTree\.gen\.ts$/,
];

const HUES =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const COLOR_UTILS =
  "bg|text|border|ring|fill|stroke|from|to|via|accent|decoration|outline|shadow|divide|caret|placeholder|inset-ring|inset-shadow";

// ---- The 20 Laws (docs/design-system-laws.md), as far as a static check can see them. -------------------------------
const SYSTEM = (rel) => /^src\/components\/(ui|patterns|domain)\//.test(rel);
const SHARED = (rel) => /^src\/components\/(ui|patterns)\//.test(rel);
// Page chrome and navigation lay out the viewport itself, so they are the one place viewport breakpoints belong.
const VIEWPORT_OWNER = (rel) => /^src\/components\/patterns\/(page|navigation)\//.test(rel);
const LOOK_BOOLEAN =
  /\b(?:is[A-Z]\w*|compact|dense|interactive|fullWidth|fluid|bordered|borderless|outlined|rounded|pill|sticky|centered|center|inline|block|ghost|primary|secondary|small|large|mini|flush|elevated|muted|subtle|badge|striped|hoverable|clickable)\??:\s*boolean\b/;

const LAW_RULES = [
  {
    id: "law1-arbitrary-value",
    message: "Law 1/3: arbitrary value; use the spacing scale, a named type step, or add a token",
    // `(--token)` references and `calc()` over tokens are token usage, not raw values.
    // Grid templates describe structure, and the icon plugin's arbitrary-value classes (not spelled out: Tailwind scans this file); neither is a raw value.
    token: (raw, base) =>
      /^-?[a-z][a-z0-9-]*-\[(?!--|var\(|calc\(var\()[^\]]*\d[^\]]*\]$/.test(base) &&
      !/^(?:icon|grid-cols|grid-rows|col|row|auto-cols|auto-rows)-\[/.test(base),
  },
  {
    id: "law1-numeric-duration",
    message: "Law 1: numeric duration or delay; use duration-fast | duration-normal | duration-slow",
    token: (raw, base) => /^(?:duration|delay)-\d+$/.test(base),
  },
  {
    id: "law2-theme-branch",
    message: "Law 2: `dark:` is a theme branch in component code; a theme is a token swap in tokens.css",
    token: (raw) => /(?:^|:)dark:/.test(raw),
  },
  {
    id: "law4-outer-margin",
    message:
      "Law 4: margins space a component from the outside; the parent owns spacing: use gap, Stack, Inline or Grid (auto margins are fine)",
    token: (raw, base) => /^-?m[trblxyse]?-(?!auto$)[\w./-]+$/.test(base) || /^-?space-[xy]-(?!reverse$)/.test(base),
  },
  {
    id: "law5-important",
    message: "Law 5: `!important` is banned; fix the specificity so one consumer class wins",
    // A word of prose that ends in "!" ("Thanks!") is not a class: a class has a dash, a colon or a bracket.
    token: (raw) => /[-:[]/.test(raw) && (/(?:^|:)![a-z-]/.test(raw) || /[\w\])]!$/.test(raw)),
  },
  {
    id: "law7-boolean-look",
    message:
      "Law 7: appearance as a boolean prop; make it an enum (`size`, `variant`, `width`, `display`, `position`, `align`)",
    pattern: LOOK_BOOLEAN,
    only: SYSTEM,
  },
  {
    id: "law10-render-prop",
    message: "Law 10: `renderX` prop; take children or a slot element instead",
    pattern: /\brender[A-Z]\w*\??:/g,
    only: SYSTEM,
  },
  {
    id: "law10-config-array",
    message:
      "Law 10: a config array prop (`items` / `options` / `rows` / `columns` / `steps` / `tabs`); compose children",
    pattern:
      /\b(?:items|options|rows|columns|steps|tabs|links|actions)\??:\s*(?:readonly\s+)?(?:\w+(?:<[^>]*>)?\[\]|Array<|ReadonlyArray<)/g,
    only: SHARED,
  },
  {
    id: "law11-vocabulary",
    message: "Law 9/11: one vocabulary; value callbacks are `onValueChange`, open state is `onOpenChange`",
    pattern: /\bon(?:[A-Z]\w*)?(?:Selected|Select|Changed)\??:|\b(?:selected[A-Z]\w*|on[A-Z]\w*Change)\??:\s*\(/g,
    only: SYSTEM,
    skip: (line) => /\bon(?:Value|Open|Checked|Pressed|Sort|Page|PageSize)Change\??:/.test(line),
  },
  {
    id: "law13-business-import",
    message:
      "Law 13: ui/ and patterns/ never import the router, the API, queries or analytics; take links through asChild",
    // A type-only import carries no behaviour into the bundle.
    skip: (line) => /^\s*import\s+type\b/.test(line),
    pattern:
      /from\s+"(?:@tanstack\/react-router|@tanstack\/react-query|posthog-js|~\/lib\/(?:api|analytics|graphql|http)|~\/queries\/[^"]*|~\/hooks\/(?!useHydrated)[^"]*)"/g,
    only: SHARED,
  },
  {
    id: "law17-focus-removed",
    message:
      "Law 17: outline removed without a focus-visible replacement in the same class list; use FOCUS_RING from ~/components/ui/recipes",
    pattern: /(?<![\w:-])outline-(?:none|hidden)\b/g,
    skip: (line) => /focus-visible:|focus-within:|focus:/.test(line),
    only: SYSTEM,
  },
  {
    id: "law18-text-alpha",
    message:
      "Law 18: translucent text drops below 4.5:1; use text-foreground or text-muted-foreground at full strength",
    token: (raw, base) =>
      /^text-(?:muted-foreground|foreground|card-foreground|popover-foreground|sidebar-foreground)\/\d+$/.test(base),
  },
  {
    id: "law19-physical-direction",
    message:
      "Law 19: physical direction; use logical utilities (ms/me/ps/pe/start/end/text-start/text-end/border-s/border-e/rounded-s/rounded-e)",
    token: (raw, base) =>
      /^-?(?:(?:ml|mr|pl|pr|scroll-ml|scroll-mr|scroll-pl|scroll-pr)-.+|(?:left|right)-.+|text-(?:left|right)|border-[lr](?:-.+)?|rounded-(?:l|r|tl|tr|bl|br)(?:-.+)?|float-(?:left|right)|clear-(?:left|right))$/.test(
        base,
      ),
  },
  {
    id: "law19-viewport-breakpoint",
    message: "Law 19: viewport breakpoint inside a component; use a container query (@container + @sm: / @md:)",
    token: (raw) => /(?:^|:)(?:max-)?(?:sm|md|lg|xl|2xl):/.test(raw),
    only: (rel) => SHARED(rel) && !VIEWPORT_OWNER(rel),
  },
];

const insideSystem = (rel) => /^src\/components\/(ui|patterns)\//.test(rel);

const RULES = [
  {
    id: "palette-color",
    message: "raw Tailwind palette color; use a semantic token (positive, negative, warning, info, primary, muted...)",
    pattern: new RegExp(`(?<![\\w-])(?:${COLOR_UTILS})-(?:${HUES})-\\d{2,3}(?![\\w])`, "g"),
  },
  {
    id: "arbitrary-color",
    message: "hardcoded color in a class; add or reuse a token in src/styles/tokens.css",
    pattern: new RegExp(`(?<![\\w-])(?:${COLOR_UTILS})-\\[(?:#|rgb|hsl|oklch)[^\\]]*\\]`, "g"),
  },
  {
    id: "arbitrary-alpha",
    message: "ad-hoc white/black alpha; use hairline, subtle, subtle-hover or subtle-active",
    pattern: new RegExp(`(?<![\\w-])(?:${COLOR_UTILS})-(?:white|black)/\\[[\\d.]+\\]`, "g"),
  },
  {
    id: "color-literal",
    message: "color literal in code; use a CSS variable from tokens.css or a constant from patterns/charts/theme",
    pattern: /(?<![\w&])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?=["'`\s,;)])|\brgba?\(\s*\d/g,
  },
  {
    id: "arbitrary-text-size",
    message: "arbitrary font size; use text-4xs (9px), text-3xs (10px), text-2xs (11px), text-xs...",
    pattern: /(?<![\w-])text-\[\d+(?:\.\d+)?(?:px|rem)\]/g,
  },
  {
    id: "raw-button",
    message: "raw <button>; use Button, SortButton, Segmented, OptionRow or ToggleGroup from ~/components/ui",
    pattern: /<(?:motion\.)?button\b/g,
    skip: (rel) => rel.startsWith("src/components/ui/"),
  },
  // The site is a composition of the design system: these elements exist once, inside it.
  {
    id: "raw-heading",
    message: "raw heading; use PageHeader, Section, PanelHeader, CardTitle, DialogTitle or Heading",
    pattern: /<h[1-6](?:[\s>]|$)/g,
    skip: insideSystem,
  },
  {
    id: "raw-control",
    message: "raw form control; use Input, Textarea, Select, Checkbox, Switch or Slider",
    pattern: /<(?:input|select|textarea)(?:[\s>]|$)/g,
    skip: insideSystem,
  },
  {
    id: "raw-table",
    message: "raw <table>; use Table from ~/components/ui/table",
    pattern: /<table(?:[\s>]|$)/g,
    skip: insideSystem,
  },
  {
    id: "raw-chart-frame",
    message: "bare ResponsiveContainer; every plot sits in ChartSurface",
    pattern: /<ResponsiveContainer[\s>]/g,
    skip: insideSystem,
  },
  {
    id: "raw-loading",
    message: "hand-rolled loading indicator; use Spinner or LoadingState",
    pattern: /animate-spin/g,
    skip: insideSystem,
  },
];

// Composition only: outside the design system a class name arranges and sets type. It never draws. A surface, a
// border, a radius, a shadow, a focus ring, a hover fill or a transition is a design decision, and those are made once,
// inside a design-system component, and reached through its props.
const COMPOSED = (rel) => /^src\/(routes|pages)\//.test(rel) || /^src\/components\/(features|app)\//.test(rel);
const DRAWING_UTILITY =
  /^-?(?:bg|border|rounded|shadow|inset-shadow|ring|inset-ring|outline|divide|backdrop|from|via|to|fill|stroke|accent|caret|decoration|underline|opacity|brightness|contrast|saturate|blur|grayscale|invert|drop-shadow|mix-blend|transition|duration|ease|delay|animate|cursor|scrollbar|glass|appearance|mask)(?:-|$)/;
// Utilities that start like a drawing utility but only affect layout or behaviour.
// `cursor-target` is the hook the mini-games' custom cursor looks for, not a style.
const NOT_DRAWING =
  /^(?:border-(?:collapse|separate|spacing.*)|outline-hidden|transition-none|cursor-target|scrollbar-(?:thin|none))$/;
const CLASS_STRING = /(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
const VARIANT_PREFIX = /^(?:\[[^\]]*\]|[@a-z0-9-]+(?:\[[^\]]*\])?(?:\/[a-z0-9-]+)?):/i;

// Every class token written on a line: [raw, base], where base has its variants (`hover:`, `md:`, `data-[x]:`) and
// its `!` stripped. Strings that are the value of a prop other than className are component props, not classes.
function classTokens(line) {
  const tokens = [];
  CLASS_STRING.lastIndex = 0;
  for (let m = CLASS_STRING.exec(line); m; m = CLASS_STRING.exec(line)) {
    const prop = /([\w-]+)=\{?$/.exec(line.slice(0, m.index))?.[1];
    if (prop && !/class(?:name)?$/i.test(prop)) continue;
    const aboutClasses = /class(?:Name)?\b|\b(?:cn|cva|clsx)\(/.test(line);
    // A lone bare word ("glass", "outline") is a value, not a class list, unless the line is about classes.
    if (/^[a-z]+$/.test(m[2]) && !aboutClasses) continue;
    for (const raw of m[2].split(/\s+/)) {
      if (!/^[!\w@[\]():/.&>*=_'%,#+~-]+$/.test(raw) || !/[a-z]/.test(raw)) continue;
      let base = raw.replace(/^!|!$/g, "");
      while (VARIANT_PREFIX.test(base)) base = base.replace(VARIANT_PREFIX, "");
      tokens.push([raw, base.replace(/^!|!$/g, "")]);
    }
  }
  return tokens;
}

function drawingTokens(line) {
  return classTokens(line)
    .filter(
      ([raw, base]) =>
        (raw.includes("-") ||
          /^(?:border|rounded|shadow|ring|outline|underline|glass|transition|blur|grayscale|invert)$/.test(base)) &&
        DRAWING_UTILITY.test(base) &&
        !NOT_DRAWING.test(base),
    )
    .map(([raw]) => raw);
}

const VISUAL_STYLE_KEY =
  /\b(?:color|background(?:Color|Image)?|border(?:Color|Width|Radius|Style|Top\w*|Bottom\w*|Left\w*|Right\w*|Inline\w*|Block\w*)?|boxShadow|outline\w*|opacity|filter|backdropFilter|fill|stroke)\s*:/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

function layerOf(rel) {
  const m = /^src\/components\/([^/]+)\//.exec(rel);
  return m && LAYERS.includes(m[1]) ? m[1] : null;
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file);
  if (EXEMPT.some((re) => re.test(rel))) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const allowed = (rule, i) => {
    for (let j = Math.max(0, i - 3); j <= i; j++) {
      if (new RegExp(`ds-allow\\s+${rule}:\\s*\\S`).test(lines[j])) return true;
    }
    return false;
  };
  const layer = layerOf(rel);

  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.skip?.(rel)) continue;
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(line);
      if (match && !allowed(rule.id, i))
        findings.push({ rel, line: i + 1, rule: rule.id, text: match[0], message: rule.message });
    }

    let tokens;
    for (const rule of LAW_RULES) {
      if (rule.only && !rule.only(rel)) continue;
      if (rule.skip?.(line)) continue;
      // Law rules read class lists and prop types; prose in comments is not code.
      if (/^\s*(?:\/\/|\*|\/\*|\{\/\*)/.test(line) && rule.id !== "law13-business-import") continue;
      let text;
      if (rule.token) {
        tokens ??= classTokens(line);
        text = tokens.find(([raw, base]) => rule.token(raw, base))?.[0];
      } else {
        rule.pattern.lastIndex = 0;
        text = rule.pattern.exec(line)?.[0];
      }
      if (text && !allowed(rule.id, i)) findings.push({ rel, line: i + 1, rule: rule.id, text, message: rule.message });
    }

    if (COMPOSED(rel) && !/^\s*(?:import|export .* from)\b/.test(line)) {
      const drawn = drawingTokens(line);
      if (drawn.length > 0 && !allowed("drawing-class", i)) {
        findings.push({
          rel,
          line: i + 1,
          rule: "drawing-class",
          text: drawn.slice(0, 4).join(" "),
          message: "this file composes the design system and may not draw; use a component's variant, or add one",
        });
      }
      if (/style=\{\{/.test(line) && VISUAL_STYLE_KEY.test(line) && !allowed("drawing-style", i)) {
        findings.push({
          rel,
          line: i + 1,
          rule: "drawing-style",
          text: VISUAL_STYLE_KEY.exec(line)[0],
          message: "inline visual style; pass the value to a design-system component prop (color, accent, tone)",
        });
      }
    }

    const spec = /(?:from|import)\s*\(?\s*["']([^"']+)["']/.exec(line)?.[1];
    if (!spec || !layer) return;
    const target = /^~\/components\/([^/]+)\//.exec(spec)?.[1];
    if (target && LAYERS.indexOf(target) > LAYERS.indexOf(layer) && !allowed("layer-import", i)) {
      findings.push({
        rel,
        line: i + 1,
        rule: "layer-import",
        text: spec,
        message: `${layer}/ must not import from ${target}/`,
      });
    }
    const featureOf = (value) => /(?:^src|^~)\/components\/features\/([^/]+)\//.exec(value)?.[1];
    if (layer === "features" && featureOf(spec) && featureOf(spec) !== featureOf(rel) && !allowed("layer-import", i)) {
      findings.push({
        rel,
        line: i + 1,
        rule: "layer-import",
        text: spec,
        message: "a feature must not import another feature; move the shared piece to domain/ or patterns/",
      });
    }
    if (DOMAIN_FREE.includes(layer) && DOMAIN_IMPORT.test(spec) && !allowed("layer-import", i)) {
      findings.push({
        rel,
        line: i + 1,
        rule: "layer-import",
        text: spec,
        message: `${layer}/ must stay free of game data; move the component to domain/`,
      });
    }
  });
}

// Law 15: the first render must match the server's HTML. A state initializer or a memo runs during that render, so one that reads
// storage or a browser global starts the client on a value the server never had: the text differs and React throws
// the server markup away. Read it after hydration instead (`useStoredState`, `useHydrated`, or an Effect).
const BROWSER_READ =
  /\b(?:localStorage|sessionStorage|readLocalStorage|readStoredJson|matchMedia|navigator\.|window\.|document\.)/;
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file);
  if (EXEMPT.some((re) => re.test(rel)) || /\.test\.tsx?$/.test(rel)) continue;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!/\buse(?:State|Reducer|Memo)\b(?:<[^>]*>)?\(\s*\(\)\s*=>/.test(line)) return;
    // The initializer's body: this line and the next few, up to the line that closes the call.
    for (let j = i; j < Math.min(lines.length, i + 8); j++) {
      const body = j === i ? line.slice(line.search(/\buse(?:State|Reducer|Memo)\b/)) : lines[j];
      if (!/^\s*(?:\/\/|\*)/.test(body) && BROWSER_READ.test(body)) {
        const allowedHere = [i - 1, i].some((k) => /ds-allow\s+law15-browser-initial-state:\s*\S/.test(lines[k] ?? ""));
        if (!allowedHere)
          findings.push({
            rel,
            line: j + 1,
            rule: "law15-browser-initial-state",
            text: body.trim().slice(0, 80),
            message:
              "Law 15: a state initializer reads a browser API, so hydration starts from a value the server never rendered; read it after hydration (useStoredState, useHydrated, an Effect)",
          });
        break;
      }
      // The call ends on this line: a one-line initializer, or the closing `});` / `}, [deps]);` of a longer one.
      if (/\);\s*$/.test(lines[j])) break;
    }
  });
}

// Everything in the design system is shown on the dev page: a component nobody can see gets reinvented.
const SHOWCASE = "src/components/dev/design-system";
const showcaseSource = walk(path.join(ROOT, SHOWCASE))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
const filterIndex = fs.readFileSync(path.join(SRC, "components/domain/filters/index.ts"), "utf8");
for (const layer of ["ui", "patterns", "domain"]) {
  for (const file of walk(path.join(SRC, "components", layer))) {
    const rel = path.relative(ROOT, file);
    if (!rel.endsWith(".tsx") || rel.endsWith(".test.tsx")) continue;
    const spec = `~/${rel.slice("src/".length).replace(/\.tsx$/, "")}`;
    const viaFilterNamespace =
      filterIndex.includes(`"${spec}"`) && showcaseSource.includes('"~/components/domain/filters"');
    if (showcaseSource.includes(`"${spec}"`) || viaFilterNamespace) continue;
    findings.push({
      rel,
      line: 1,
      rule: "showcase",
      text: spec,
      message: `not on the dev page; add a Specimen for it under ${SHOWCASE}/ and list it in nav.ts`,
    });
  }
}

for (const file of fs.readdirSync(path.join(SRC, "styles"))) {
  if (!file.endsWith(".css")) continue;
  fs.readFileSync(path.join(SRC, "styles", file), "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (/!important/.test(line) && !/ds-allow\s+law5-important:\s*\S/.test(line)) {
        findings.push({
          rel: `src/styles/${file}`,
          line: i + 1,
          rule: "law5-important",
          text: "!important",
          message: "Law 5: `!important` is banned; order the cascade with @layer instead",
        });
      }
    });
}

const summaryOnly = process.argv.includes("--summary");
const byRule = {};
for (const f of findings) {
  byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
  if (!summaryOnly) console.log(`${f.rel}:${f.line}  ${f.rule}  ${f.text}\n    ${f.message}`);
}
if (findings.length > 0) {
  console.log(`\ndesign-system: ${findings.length} violation(s)`, byRule);
  console.log("See docs/design-system.md. Silence a justified exception with `ds-allow <rule>: <reason>`.");
  process.exit(1);
}
console.log("design-system: ok");
