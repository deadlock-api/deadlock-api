#!/usr/bin/env node
// Writes the pixel size of every raster blog image to src/lib/blog-image-sizes.json, so a post's <img> can reserve
// its real aspect ratio (the Worker cannot read public/ at render time). Run it after adding a PNG to
// public/blog/images/; `pnpm test:unit` fails while the manifest is out of date.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = path.join(ROOT, "public/blog/images");
const OUT = path.join(ROOT, "src/lib/blog-image-sizes.json");

/** Width and height from a PNG's IHDR chunk, which always starts at byte 16. */
export function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("not a PNG");
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

export function readBlogImageSizes(dir = IMAGES) {
  const sizes = {};
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".png")) continue;
    sizes[`/blog/images/${file}`] = pngSize(fs.readFileSync(path.join(dir, file)));
  }
  return sizes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUT, `${JSON.stringify(readBlogImageSizes(), null, 2)}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
