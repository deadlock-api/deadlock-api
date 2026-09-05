import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const path = 'website/src/components/heatmap/heatmap-grid.ts';
async function load(source) {
  const { outputFiles } = await build({ stdin: { contents: source, loader: 'ts' }, format: 'esm', write: false });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}
const before = await load(execFileSync('git', ['show', `${process.argv[2] || '39169c7a'}:${path}`], { encoding: 'utf8' }));
const after = await load(await readFile(new URL('../../' + path, import.meta.url), 'utf8'));
let seed = 42;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const fixtures = [[], [{ position_x: 0, position_y: 0, kills: 0, deaths: 0 }]];
for (let i = 0; i < 12; i++) {
  fixtures.push(Array.from({ length: 200 }, () => ({
    position_x: (random() * 2 - 1) * 11000,
    position_y: (random() * 2 - 1) * 11000,
    kills: Math.floor(random() * 200), deaths: Math.floor(random() * 200),
  })));
}
let checks = 0;
for (const data of fixtures) {
  const oldRaw = before.buildHeatGrids(data, 10752);
  const raw = after.buildHeatGrids(data, 10752);
  for (const mode of ['kills', 'deaths', 'kd']) {
    for (const sensitivity of [-1, 0, 0.8, 0.98, 0.99, 0.999, 1, 2]) {
      assert.deepEqual(after.normalizeHeatGrids(raw, mode, sensitivity), before.normalizeHeatGrids(oldRaw, mode, sensitivity));
      checks++;
    }
  }
  assert.deepEqual(raw, oldRaw, 'normalization must preserve raw tooltip counts');
}
assert.deepEqual(after.COLOR_LUT, before.COLOR_LUT);
console.log(`${checks} grid comparisons passed; raw counts and colors preserved.`);
