import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Connect to the isolated agent-browser session; no instrumentation ships in the app.
const [scenario = 'heroes', output = `/tmp/${scenario}-profile.json`] = process.argv.slice(2);
const scenarios = {
  itemTiming: { settle: 1800, path: '/items?tab=item-purchase-analysis&item_ids=1396247347', ready: '!!document.querySelector(".recharts-line-curve")', action: `document.querySelector('#wilson-interval').click()` },
  itemPicker: { path: '/items', ready: 'document.querySelectorAll("tbody tr").length > 10', setup: `[...document.querySelectorAll('button')].find(b=>b.textContent==='Add Items').click()`, action: `document.querySelector('[role=dialog] button[aria-label="Include item"], [role=dialog] button[aria-label="Remove from included"]').click()` },
  itemFlow: { mouse: true, path: '/items?tab=build-flow', ready: 'document.querySelectorAll("button.absolute[data-slot=tooltip-trigger]").length > 4', setup: `document.querySelector('button.absolute[data-slot=tooltip-trigger]').scrollIntoView({block:'center'})`, action: `(() => { const r = document.querySelector('button.absolute[data-slot=tooltip-trigger]').getBoundingClientRect(); window.__hovered = !window.__hovered; return window.__hovered ? {x:r.x+r.width/2,y:r.y+r.height/2} : {x:1,y:1}; })()` },
  itemCombos: { path: '/items?tab=item-combos&item_combs_to_show=100', ready: 'document.querySelectorAll("tbody tr").length > 10', action: `(() => { const slider = document.querySelectorAll('[role=slider]')[1]; slider.dispatchEvent(new KeyboardEvent('keydown', {key: Number(slider.getAttribute('aria-valuenow')) >= 200 ? 'ArrowLeft' : 'ArrowRight', bubbles:true})); })()` },
  teamBuilder: { path: '/team-builder', ready: `!!document.querySelector('button[aria-label^="Add hero to"]')`, setup: `document.querySelector('button[aria-label^="Add hero to"]').click()`, action: `(() => { const input = document.querySelector('[role=dialog] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,input.value ? '' : 'a'); input.dispatchEvent(new Event('input',{bubbles:true})); })()` },

  heatmap: { path: '/heatmap', ready: '!!document.querySelector("input[aria-label=Sensitivity]") && document.querySelectorAll("canvas")[1]?.width > 100', action: `(() => { const input = document.querySelector('input[aria-label=Sensitivity]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,input.value === '990' ? '980' : '990'); input.dispatchEvent(new Event('input',{bubbles:true})); })()` },
  games: { settle: 1800, path: '/games?tab=over-time', ready: '!!document.querySelector(".recharts-line-curve")', action: `[...document.querySelectorAll('button')].find(b=>b.textContent === (new URL(location).searchParams.get('stat') === 'avg_deaths' ? 'Avg Kills' : 'Avg Deaths')).click()` },

  heroExperience: { path: '/heroes?tab=stats-by-experience', ready: 'document.querySelectorAll("tbody tr").length > 10 && !document.querySelector("tbody [data-slot=skeleton]")', action: `[...document.querySelectorAll('thead button')].find(b=>b.textContent.includes('Trend')).click()` },

  heroDuration: { settle: 1800, path: '/heroes?tab=stats-by-duration', ready: '!!document.querySelector(".recharts-line-curve")', action: `document.querySelectorAll('.recharts-legend-item')[2].click()` },
  heroRank: { path: '/heroes?tab=stats-by-rank', ready: '!!document.querySelector(".recharts-scatter-symbol")', action: `document.querySelectorAll('.recharts-legend-item')[2].click()` },
  rankFilter: { path: '/heroes', ready: 'document.querySelectorAll("tbody tr").length > 10', action: `[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Rank:')).click()` },

  heroChart: { path: '/heroes?tab=stats-over-time', ready: '!!document.querySelector(".recharts-line-curve")', action: `document.querySelectorAll('.recharts-legend-item')[2].click()` },
  leaderboard: { path: '/leaderboard', ready: 'document.querySelectorAll("tbody tr").length > 10', action: `(() => { const input = document.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,input.value ? '' : 'a'); input.dispatchEvent(new Event('input',{bubbles:true})); })()` },

  heroes: { path: '/heroes', ready: 'document.querySelectorAll("tbody tr").length > 10', action: `[...document.querySelectorAll('thead button')].find(b=>b.textContent==='Win Rate').click()` },
  items: { path: '/items', ready: 'document.querySelectorAll("tbody tr").length > 10', action: `[...document.querySelectorAll('th')].find(b=>b.textContent.includes('Win Rate')).click()` },
};
const config = scenarios[scenario];
if (!config) throw Error(`Unknown scenario: ${scenario}`);
const targets = await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9226}/json/list`).then(r => r.json());
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
};
async function send(method, params = {}) {
  const message = await new Promise(resolve => {
    pending.set(++nextId, resolve);
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });
  if (message.error) throw Error(JSON.stringify(message.error));
  return message.result;
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const bundle = await build({
  stdin: { contents: `import {instrument, traverseRenderedFibers, isCompositeFiber, getDisplayName, getTimings} from 'bippy';
    window.__perf = { events: [], status: null, draws: 0 };
    const putImageData = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function(...args) {window.__perf.draws++; return putImageData.apply(this,args);};
    instrument({ onCommitFiberRoot(id, root) {
      window.__perf.status = {available: root.current.actualDuration !== undefined};
      traverseRenderedFibers(root, (fiber, phase) => {
        if (!isCompositeFiber(fiber) || phase === 'unmount') return;
        const changed = Object.keys(fiber.memoizedProps || {}).filter(k=>!Object.is(fiber.memoizedProps[k],fiber.alternate?.memoizedProps?.[k]));
        window.__perf.events.push({name:fiber.type?.dlName || getDisplayName(fiber.type), phase, ...getTimings(fiber), changed});
      });
    }});`, resolveDir: import.meta.dirname },
  bundle: true, format: 'iife', write: false,
});
try {
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: bundle.outputFiles[0].text });
  await send('Performance.enable');
  await send('Page.navigate', { url: (process.env.BASE_URL || 'http://127.0.0.1:3000') + config.path });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await wait(1000);
    if (await evaluate(`!!window.__perf?.status && (${config.ready})`)) { ready = true; break; }
  }
  if (!ready) throw Error('Page did not become ready');
  const status = await evaluate('window.__perf.status');
  if (!status.available && process.env.CPU_ONLY !== '1') throw Error(`React profiling unavailable: ${JSON.stringify(status)}`);
  if (config.setup) await evaluate(config.setup);
  await wait(2000);
  const environment = await evaluate("({userAgent:navigator.userAgent,width:innerWidth,height:innerHeight,dpr:devicePixelRatio})");
  const samples = [];
  for (let i = 0; i < 8; i++) {
    await evaluate('window.__perf.events=[];window.__perf.draws=0;performance.clearResourceTimings()');
    const before = await send('Performance.getMetrics');
    const action = await evaluate(config.action);
    if (config.mouse) await send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...action});
    await wait(config.settle || 700); // Include nuqs' 300 ms URL debounce and subsequent React commits.
    const after = await send('Performance.getMetrics');
    const sample = await evaluate(`({events:window.__perf.events, draws:window.__perf.draws, rows:document.querySelectorAll('tbody tr').length,
      text:[...document.querySelectorAll('tbody tr')].map(r=>r.textContent), url:location.href,
      chart:[...document.querySelectorAll('.recharts-line-curve')].map(p=>p.getAttribute('d')),
      legend:[...document.querySelectorAll('.recharts-legend-item')].map(e=>({text:e.textContent,className:e.className})),
      flow: [...document.querySelectorAll('button.absolute[data-slot=tooltip-trigger]')].map(e=>({text:e.textContent,opacity:getComputedStyle(e).opacity,left:e.style.left,top:e.style.top})),
      requests:performance.getEntriesByType('resource').filter(r=>['fetch','xmlhttprequest'].includes(r.initiatorType)).map(r=>r.name)})`);
    sample.cpu = Object.fromEntries(after.metrics.filter(m => ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].includes(m.name))
      .map(m => [m.name, 1000 * (m.value - before.metrics.find(b => b.name === m.name).value)]));
    const renders = {};
    for (const event of sample.events) {
      const stat = renders[event.name] ??= { count: 0, ms: 0 };
      stat.count++; stat.ms += event.selfTime;
    }
    if (scenario === 'heatmap') {
      sample.canvasHash = createHash('sha256').update(await evaluate("document.querySelectorAll('canvas')[1].toDataURL()")).digest('hex');
    }
    sample.renders = renders;
    samples.push(sample);
    console.log(JSON.stringify({ sample: i, cpu: sample.cpu, renders: Object.entries(renders).sort((a,b)=>b[1].ms-a[1].ms).slice(0,12), requests: sample.requests.length, draws: sample.draws }));
  }
  await fs.writeFile(output, JSON.stringify({ scenario, environment, status, samples }, null, 2));
} finally { ws.close(); }
