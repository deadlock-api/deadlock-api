#!/usr/bin/env node
// Prerendered pages bypass src/server.ts. Give Workers Static Assets the same
// public preload hints, using the actual content-hashed URLs from each page.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = join(root, "dist/client");
const headers = await readFile(join(root, "public/_headers"), "utf8");
const files = await readdir(client, { recursive: true, withFileTypes: true });
const pages = files.filter((file) => file.isFile() && file.name.endsWith(".html"));
const rules = await Promise.all(
  pages.map(async (file) => {
    const path = join(file.parentPath, file.name);
    const html = await readFile(path, "utf8");
    const links = new Set();
    for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
      const attrs = Object.fromEntries(
        [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key.toLowerCase(), value]),
      );
      const { href, rel, as } = attrs;
      if (href?.startsWith("/assets/") && rel === "stylesheet") {
        links.add(`<${href}>; rel=preload; as=style; fetchpriority=high`);
      } else if (href?.startsWith("/assets/") && rel === "preload" && as === "font") {
        links.add(`<${href}>; rel=preload; as=font; type="font/woff2"; crossorigin`);
      } else if (href === "/logo/hexe.svg" && rel === "preload") {
        links.add(`<${href}>; rel=preload; as=image; fetchpriority=high`);
      }
    }
    if (!links.size) return "";
    const route = `/${relative(client, path)}`.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
    return `${route === "/" ? route : route.replace(/\/$/, "")}\n  Link: ${[...links].join(", ")}\n`;
  }),
);

// Always regenerate from public/_headers so repeated builds cannot accumulate
// stale hashes or duplicate rules. Preserve security and cache headers verbatim.
await writeFile(join(client, "_headers"), `${headers.trimEnd()}\n\n${rules.filter(Boolean).sort().join("\n")}`);
console.log(`[preload-headers] Added Link headers for ${rules.filter(Boolean).length} prerendered pages.`);
