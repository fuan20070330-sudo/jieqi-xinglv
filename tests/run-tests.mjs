import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({ window: {}, console });
vm.runInContext(read('js/data.js'), context, { filename: 'js/data.js' });
const data = context.window.JOURNEY_DATA;
const seasons = ['spring', 'summer', 'autumn', 'winter'];
const types = ['collect', 'sequence', 'rhythm', 'timing', 'assemble', 'sort', 'duel', 'pump', 'plant', 'noodle', 'weather', 'path', 'hang', 'lantern', 'dew', 'moon', 'climb', 'shake', 'fold', 'salt', 'wipe', 'roll', 'pour', 'sweep'];

assert.ok(data, '应导出 JOURNEY_DATA');
assert.equal(Object.keys(data.seasons).length, 4, '应有四季');
assert.equal(data.terms.length, 24, '应有 24 个节气');
assert.equal(new Set(data.terms.map(term => term.id)).size, 24, '节气 ID 必须唯一');
for (const season of seasons) {
  const meta = data.seasons[season];
  assert.equal(meta.terms.length, 6, `${season} 应有 6 个节气`);
  for (const id of meta.terms) {
    const term = data.terms.find(item => item.id === id);
    assert.ok(term, `${season} 的节气 ${id} 必须存在`);
    assert.equal(term.season, season, `${id} 的季节必须正确`);
    assert.ok(types.includes(term.game.type), `${id} 应有合法小游戏类型`);
    assert.ok(term.position.x > 0 && term.position.x < 1900, `${id} 的地图坐标必须有效`);
    assert.ok(term.position.y > 0 && term.position.y < 1200, `${id} 的地图坐标必须有效`);
    assert.ok(term.custom && term.culture, `${id} 应有习俗名称和文化说明`);
    if (term.game.type === 'collect') {
      assert.ok(term.game.targets.length >= 2 && term.game.avoid.length >= 1, `${id} 收集游戏必须配置目标与障碍`);
    } else if (term.game.type === 'sort') {
      assert.ok(term.game.categories.length >= 2 && term.game.items.length >= 6, `${id} 分类游戏数据不足`);
      assert.ok(term.game.items.every(item => item.cat < term.game.categories.length), `${id} 分类索引越界`);
    } else if (term.game.type === 'sequence') {
      assert.ok(term.game.symbols.length >= 4 && term.game.sequence.length >= 4, `${id} 顺序游戏数据不足`);
      assert.ok(term.game.sequence.every(index => index < term.game.symbols.length), `${id} 顺序索引越界`);
    } else if (term.game.type === 'rhythm') {
      assert.ok(term.game.beats >= 3 && term.game.tempo > 0, `${id} 节奏游戏参数无效`);
    } else if (term.game.type === 'timing') {
      assert.ok(term.game.rounds >= 3, `${id} 时机游戏回合不足`);
    } else if (term.game.type === 'path') {
      assert.ok(term.game.targetCount >= 1 && term.game.playerGlyph, `${id} 行进游戏配置不完整`);
    } else if (term.game.type === 'assemble') {
      assert.ok(term.game.pieces.length >= 4, `${id} 拼装游戏部件不足`);
    } else if (term.game.type === 'weather') {
      assert.ok(term.game.rounds >= 4 && term.game.items.length >= 4, `${id} 天气反应游戏数据不足`);
    } else if (['fold', 'roll'].includes(term.game.type)) {
      assert.ok(term.game.rounds >= 3, `${id} 连续动作游戏回合不足`);
    } else if (term.game.type === 'salt') {
      assert.ok(term.game.strips >= 2, `${id} 抹盐游戏条数不足`);
    } else if (term.game.type === 'wipe') {
      assert.ok(term.game.patches >= 4, `${id} 清扫游戏雪堆不足`);
    } else if (term.game.type === 'pour') {
      assert.ok(term.game.ingredients.length >= 4, `${id} 投料游戏材料不足`);
    } else if (term.game.type === 'sweep') {
      assert.ok(term.game.spots >= 5, `${id} 扫尘游戏尘团不足`);
    } else if (term.game.type === 'duel') {
      assert.ok(term.game.rounds >= 3, `${id} 斗蛋回合不足`);
    } else if (term.game.type === 'pump') {
      assert.ok(term.game.strokes >= 6, `${id} 水车踩踏次数不足`);
    } else if (term.game.type === 'plant') {
      assert.ok(term.game.slots >= 6, `${id} 插秧田格不足`);
    } else if (term.game.type === 'noodle') {
      assert.ok(term.game.points >= 10, `${id} 拉面路径节点不足`);
    } else if (term.game.type === 'hang') {
      assert.ok(term.game.items.length >= 6 && term.game.categories.length === 2, `${id} 晒秋挂架数据不足`);
    } else if (term.game.type === 'lantern') {
      assert.ok(term.game.rocks >= 3, `${id} 河灯礁石不足`);
    } else if (term.game.type === 'dew') {
      assert.ok(term.game.drops >= 6, `${id} 收露目标不足`);
    } else if (term.game.type === 'moon') {
      assert.ok(term.game.rings === 3 && term.game.steps >= 6, `${id} 月盘校准数据不足`);
    } else if (term.game.type === 'climb') {
      assert.ok(term.game.stones >= 8, `${id} 登高石阶不足`);
    } else if (term.game.type === 'shake') {
      assert.ok(term.game.fruits >= 4, `${id} 摇树果实不足`);
    }
  }
}
const seenTypes = new Set(data.terms.map(term => term.game.type));
assert.deepEqual([...seenTypes].sort(), types.slice().sort(), '小游戏类型清单不完整');
assert.equal(data.terms.map(term => term.game.type).length, new Set(data.terms.map(term => term.game.type)).size, '24 个关卡必须分别使用 24 种不同玩法');
for (const season of seasons) {
  const seasonTypes = data.seasons[season].terms.map(id => data.terms.find(term => term.id === id).game.type);
  assert.equal(new Set(seasonTypes).size, 6, `${season} 的六关必须使用六种不同玩法`);
}

const html = read('index.html');
assert.ok(html.includes('js/data.js') && html.includes('js/game.js'), '目录版应加载数据和游戏脚本');
assert.ok(!/<script[^>]+src=["']https?:/i.test(html), '不得依赖远程脚本');
assert.ok(!/<link[^>]+href=["']https?:/i.test(html), '不得依赖远程样式');
const game = read('js/game.js');
assert.ok(game.includes("'w'") && game.includes("'a'") && game.includes("'s'") && game.includes("'d'"), '应支持 WASD 移动');
assert.ok(game.includes('localStorage'), '应使用 localStorage 存档');
assert.ok(game.includes('Math.max(previous.stars') && game.includes('Math.max(previous.bestScore'), '重玩只能刷新最佳星级与最佳分数，不能累加');
assert.ok(game.includes('seasonStars(season) > 12'), '进入下一季必须超过 2/3 星数');
assert.ok(game.includes('mini.started') && game.includes('startMiniGame'), '小游戏必须先展示教程，确认后才开始');
assert.equal(new Set(data.terms.map(term => term.game.type)).size, 24, '24 个小游戏玩法必须全部不同');
assert.ok(game.includes("weather === 'rain'") && game.includes("weather === 'snow'") && game.includes("weather === 'leaves'") && game.includes("weather === 'sun'"), '应包含四季天气效果');
assert.ok(!game.includes('fetch('), '运行时不应请求网络数据');

console.log(JSON.stringify({
  status: 'ok',
  seasons: seasons.length,
  terms: data.terms.length,
  games: data.terms.length,
  gameTypes: [...seenTypes],
  gamesPerSeason: Object.fromEntries(seasons.map(season => [season, data.seasons[season].terms.length]))
}, null, 2));
