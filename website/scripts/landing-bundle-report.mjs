#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const html = readFileSync(resolve(root, "dist/client/index.html"), "utf8");
const stats = JSON.parse(readFileSync(resolve(root, "stats.json"), "utf8"));

const initial = [...html.matchAll(/"\/assets\/([A-Za-z0-9_.-]+\.js)"/g)].map((m) => `assets/${m[1]}`);

const importsByChunk = new Map();
function scanChunk(chunk) {
  if (importsByChunk.has(chunk)) return;
  const path = resolve(root, "dist/client", chunk);
  let src;
  try {
    src = readFileSync(path, "utf8");
  } catch {
    importsByChunk.set(chunk, []);
    return;
  }
  const deps = new Set();
  for (const m of src.matchAll(/from\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g)) deps.add(`assets/${m[1]}`);
  for (const m of src.matchAll(/import\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g)) deps.add(`assets/${m[1]}`);
  importsByChunk.set(chunk, [...deps]);
  for (const d of deps) scanChunk(d);
}
initial.forEach(scanChunk);

const reachable = new Set(importsByChunk.keys());

const moduleByChunk = new Map();
for (const [, m] of Object.entries(stats.nodeMetas)) {
  const modPath = m.id || m.name;
  if (!modPath || !m.moduleParts) continue;
  for (const [bundle, partId] of Object.entries(m.moduleParts)) {
    if (!reachable.has(bundle)) continue;
    const part = stats.nodeParts[partId];
    if (!part) continue;
    if (!moduleByChunk.has(bundle)) moduleByChunk.set(bundle, []);
    moduleByChunk.get(bundle).push({ path: modPath, size: part.renderedLength });
  }
}

function labelFor(modPath) {
  if (modPath.includes("/node_modules/.pnpm/")) {
    const tail = modPath.split("/node_modules/.pnpm/")[1];
    const pkg = tail.split("/node_modules/")[1]?.split("/").slice(0, 2).join("/") ?? tail.split("/")[0];
    return pkg.replace(/^@/, "@").replace(/_.*$/, "");
  }
  if (modPath.startsWith("/src/")) return modPath;
  return modPath.replace(/^.*node_modules\//, "");
}

const root2 = { name: "landing-page", children: [] };
const byChunk = new Map();
for (const chunk of reachable) {
  const fsSize = (() => {
    try {
      return statSync(resolve(root, "dist/client", chunk)).size;
    } catch {
      return 0;
    }
  })();
  const modules = moduleByChunk.get(chunk) ?? [];
  const node = { name: chunk, fsSize, children: [] };
  const grouped = new Map();
  for (const m of modules) {
    const label = labelFor(m.path);
    grouped.set(label, (grouped.get(label) ?? 0) + m.size);
  }
  for (const [label, size] of grouped) node.children.push({ name: label, value: size });
  node.children.sort((a, b) => b.value - a.value);
  byChunk.set(chunk, node);
  root2.children.push(node);
}
root2.children.sort((a, b) => b.fsSize - a.fsSize);

const totalRaw = root2.children.reduce((s, c) => s + c.fsSize, 0);

const html_out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Landing page bundle</title>
<style>
  body { margin: 0; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; background: #0b0d10; color: #e5e7eb; }
  header { padding: 16px 20px; border-bottom: 1px solid #1f2937; display: flex; gap: 24px; align-items: baseline; }
  header h1 { margin: 0; font-size: 16px; font-weight: 600; }
  header .stats { color: #9ca3af; font-size: 12px; }
  #treemap { width: 100vw; height: calc(100vh - 56px); }
  .node rect { stroke: #0b0d10; stroke-width: 1px; }
  .node text { pointer-events: none; fill: #f9fafb; font-size: 11px; }
  .chunk-label { font-weight: 600; font-size: 11px; fill: #fbbf24; }
  .tooltip { position: fixed; pointer-events: none; background: #1f2937; color: #f9fafb; padding: 6px 10px; border-radius: 4px; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: none; max-width: 480px; word-break: break-all; }
</style>
</head>
<body>
<header>
  <h1>Landing page (/) — eagerly loaded bundle</h1>
  <div class="stats">${root2.children.length} chunks · ${(totalRaw / 1024).toFixed(1)} KB raw on disk · click a tile for details</div>
</header>
<div id="treemap"></div>
<div class="tooltip" id="tooltip"></div>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<script>
const data = ${JSON.stringify(root2)};
const palette = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16","#06b6d4","#a855f7","#eab308"];
const chunkColor = new Map();
data.children.forEach((c, i) => chunkColor.set(c.name, palette[i % palette.length]));

const tip = document.getElementById("tooltip");
function showTip(e, t) { tip.textContent = t; tip.style.display = "block"; tip.style.left = (e.clientX + 12) + "px"; tip.style.top = (e.clientY + 12) + "px"; }
function hideTip() { tip.style.display = "none"; }

function render() {
  const w = window.innerWidth, h = window.innerHeight - 56;
  const sumValues = (node) => {
    if (!node.children || node.children.length === 0) return node.value || 0;
    return node.children.reduce((s, c) => s + sumValues(c), 0);
  };
  data.children.forEach(c => { c.value = sumValues(c) || c.fsSize; });
  const hierarchy = d3.hierarchy(data).sum(d => d.children ? 0 : (d.value || 0)).sort((a,b) => b.value - a.value);
  d3.treemap().size([w, h]).paddingTop(18).paddingInner(1).round(true)(hierarchy);

  const svg = d3.select("#treemap").html("").append("svg").attr("width", w).attr("height", h);

  const chunkG = svg.selectAll("g.chunk").data(hierarchy.children).enter().append("g").attr("class", "chunk");
  chunkG.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0)
    .attr("fill", d => chunkColor.get(d.data.name)).attr("opacity", 0.25);
  chunkG.append("text").attr("class", "chunk-label").attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 12)
    .text(d => d.data.name.replace("assets/", "") + " · " + (d.data.fsSize/1024).toFixed(1) + "KB");

  const leaves = hierarchy.leaves();
  const leafG = svg.selectAll("g.leaf").data(leaves).enter().append("g").attr("class", "leaf");
  leafG.append("rect")
    .attr("x", d => d.x0).attr("y", d => d.y0)
    .attr("width", d => Math.max(0, d.x1 - d.x0)).attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill", d => chunkColor.get(d.parent.data.name))
    .attr("opacity", 0.85)
    .on("mousemove", (e, d) => showTip(e, d.data.name + " — " + (d.data.value/1024).toFixed(1) + " KB · in " + d.parent.data.name))
    .on("mouseleave", hideTip);
  leafG.append("text")
    .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 14)
    .text(d => {
      const w = d.x1 - d.x0, h = d.y1 - d.y0;
      if (w < 60 || h < 16) return "";
      const label = d.data.name.length > Math.floor(w/6) ? d.data.name.slice(0, Math.floor(w/6) - 1) + "…" : d.data.name;
      return label;
    });
  leafG.append("text")
    .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 26)
    .attr("fill", "#d1d5db").attr("font-size", "10px")
    .text(d => {
      const w = d.x1 - d.x0, h = d.y1 - d.y0;
      if (w < 60 || h < 28) return "";
      return (d.data.value/1024).toFixed(1) + " KB";
    });
}
render();
window.addEventListener("resize", render);
</script>
</body>
</html>`;

writeFileSync(resolve(root, "stats-landing.html"), html_out);
console.log(`wrote stats-landing.html — ${root2.children.length} chunks, ${(totalRaw / 1024).toFixed(1)} KB raw`);
