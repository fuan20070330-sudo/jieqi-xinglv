import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadScript(file, extra = {}) {
  const context = vm.createContext({ window: {}, console, ...extra });
  vm.runInContext(read(file), context, { filename: file });
  return context;
}

const dataContext = loadScript('js/data.js');
const data = dataContext.window.GAME_DATA;
assert.equal(data.terms.length, 24, '应有 24 个节气');
assert.equal(data.trials.length, 4, '应有 4 个章末试炼');

const expectedLongitudes = Array.from({ length: 24 }, (_, index) => (315 + index * 15) % 360);
assert.deepEqual(Array.from(data.terms, term => term.longitude), expectedLongitudes, '太阳视黄经必须每节气增加 15°');
assert.deepEqual(Array.from(data.terms, term => term.order), Array.from({ length: 24 }, (_, index) => index), '节气顺序必须完整');
assert.deepEqual([...new Set(data.terms.map(term => term.season))].sort(), ['autumn', 'spring', 'summer', 'winter'], '四季数据必须齐全');
for (const season of ['spring', 'summer', 'autumn', 'winter']) {
  assert.equal(data.terms.filter(term => term.season === season).length, 6, `${season} 应有 6 个节气`);
}

const pentadRecords = data.terms.flatMap(term => term.pentads.map((pentad, index) => ({ ...pentad, termId: term.id, index })));
assert.equal(pentadRecords.length, 72, '必须有 72 候');
assert.equal(new Set(pentadRecords.map(item => item.name)).size, 72, '72 候名称必须唯一');
for (const term of data.terms) {
  assert.equal(term.pentads.length, 3, `${term.name} 应有三候`);
  assert.equal(term.myth.evidence.length, 2, `${term.name} 应提供两条正确证据`);
  assert.equal(term.myth.traps.length, 2, `${term.name} 应提供两条干扰证据`);
  assert.equal(term.chain.length, 4, `${term.name} 应有四段因果链`);
  assert.ok(term.watch.cue.includes('视黄经'), `${term.name} 应有黄经观测线索`);
}

for (const trial of data.trials) {
  assert.equal(trial.order.length, 6, `${trial.name} 应覆盖本章六节气`);
  assert.equal(trial.match.length, 3, `${trial.name} 应有三组候证配对`);
  assert.equal(trial.statements.filter(statement => statement.ok).length, 3, `${trial.name} 应有三条可靠陈述`);
}

const astroContext = loadScript('js/astro.js', { Date });
const SolarClock = astroContext.window.SolarClock;
const dates = [
  ['2026-03-20T14:46:00Z', 0],
  ['2026-06-21T08:24:00Z', 90],
  ['2026-09-23T00:05:00Z', 180],
  ['2026-12-21T20:50:00Z', 270]
];
for (const [iso, expected] of dates) {
  const longitude = SolarClock.solarApparentLongitude(new Date(iso));
  const distance = Math.min(Math.abs(longitude - expected), 360 - Math.abs(longitude - expected));
  assert.ok(distance < 2, `${iso} 的太阳视黄经应接近 ${expected}°，实际 ${longitude.toFixed(3)}°`);
}
const current = SolarClock.currentTerm(new Date('2026-10-25T12:00:00+08:00'), data.terms);
assert.equal(current.name, '霜降', '2026-10-25 应接近霜降节点');

const html = read('index.html');
assert.ok(html.includes('js/data.js') && html.includes('js/astro.js') && html.includes('js/game.js'), '目录版应加载三份本地脚本');
assert.ok(!/<script[^>]+src=["']https?:/i.test(html), '运行时不得依赖外部脚本');
assert.ok(!/<link[^>]+href=["']https?:/i.test(html), '运行时不得依赖外部样式');
assert.ok(!/src=["']https?:/i.test(html), '运行时不得依赖外部媒体');

const game = read('js/game.js');
assert.ok(game.includes('localStorage'), '应使用 localStorage 保存进度');
assert.ok(game.includes('toBlob'), '成果卡应可导出 PNG');
assert.ok(game.includes('checkpointRun'), '应有关卡检查点存档');
assert.ok(game.includes('recordMistake'), '应记录错题');

console.log(JSON.stringify({
  status: 'ok',
  terms: data.terms.length,
  pentads: pentadRecords.length,
  uniquePentads: new Set(pentadRecords.map(item => item.name)).size,
  trials: data.trials.length,
  solarChecks: dates.length,
  currentTerm: current.name
}, null, 2));
