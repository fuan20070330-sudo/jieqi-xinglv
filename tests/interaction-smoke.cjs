const { chromium } = require('playwright');

const W = 960;
const H = 560;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#startBtn');
  await page.waitForTimeout(250);

  const unlockBefore = { spring: [], summer: ['spring'], autumn: ['spring', 'summer'], winter: ['spring', 'summer', 'autumn'] };
  async function open(termId, season) {
    await page.evaluate(({ termId, season, unlockBefore }) => {
      for (const id of unlockBefore) {
        if (!JourneyDebug.state.save.stations[id]) {
          const data = JourneyDebug.getData();
          data.seasons[id].terms.forEach(term => {
            JourneyDebug.state.save.stations[term] = { complete: true, stars: 3, bestScore: 1000 };
          });
        }
      }
      JourneyDebug.enterSeason(season);
      JourneyDebug.teleportToTerm(termId);
    }, { termId, season, unlockBefore: unlockBefore[season] || [] });
    await page.keyboard.press('e');
    await page.waitForSelector('#miniOverlay:not([hidden])');
    const blocked = await page.evaluate(() => !JourneyDebug.state.mini.started);
    await page.click('#miniStartBtn');
    await page.waitForTimeout(100);
    return blocked;
  }

  async function cancelAndContinue() {
    await page.keyboard.press('Escape');
    await page.waitForSelector('#miniOverlay', { state: 'hidden' });
    if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');
  }

  async function miniBox() {
    return page.locator('#miniCanvas').boundingBox();
  }
  function xy(box, x, y) {
    return { x: box.x + x / W * box.width, y: box.y + y / H * box.height };
  }
  async function drag(box, from, to, steps = 8) {
    const a = xy(box, from.x, from.y);
    const b = xy(box, to.x, to.y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps });
    await page.mouse.up();
  }
  async function click(box, x, y) {
    const p = xy(box, x, y);
    await page.mouse.click(p.x, p.y);
  }

  const results = {};

  results.assembleTutorialBlocked = await open('qingming', 'spring');
  let box = await miniBox();
  const kiteParts = await page.evaluate(() => JourneyDebug.state.mini.pieces.map(piece => ({ ...piece })));
  const kiteTargets = await page.evaluate(() => JourneyDebug.state.mini.targets.map(target => ({ ...target })));
  for (const piece of kiteParts) {
    const target = kiteTargets.find(item => item.kind === piece.kind);
    await drag(box, { x: piece.x, y: piece.y }, target);
    await page.waitForTimeout(40);
  }
  results.assemble = await page.evaluate(() => ({
    placed: JourneyDebug.state.mini ? JourneyDebug.state.mini.pieces.filter(piece => piece.placed).length : 6,
    nextPiece: JourneyDebug.state.mini ? JourneyDebug.state.mini.nextPiece : 6,
    mistakes: JourneyDebug.state.mini ? JourneyDebug.state.mini.mistakes : 0
  }));
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  await page.waitForTimeout(380);
  results.assembleExit = await page.evaluate(() => ({
    mode: JourneyDebug.state.mode,
    complete: Boolean(JourneyDebug.state.save.stations.qingming?.complete),
    overlayHidden: document.querySelector('#miniOverlay').hidden
  }));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('guyu', 'spring');
  await page.evaluate(() => { JourneyDebug.state.mini.elapsed = JourneyDebug.state.mini.timeLimit + 1; });
  await page.waitForTimeout(100);
  results.sortTimeout = await page.evaluate(() => ({ failed: JourneyDebug.state.mini.failed, elapsed: JourneyDebug.state.mini.elapsed }));
  await cancelAndContinue();

  results.duelTutorialBlocked = await open('lixia', 'summer');
  box = await miniBox();
  await page.evaluate(() => { JourneyDebug.state.mini.opponentX = 480; JourneyDebug.state.mini.opponentDir = 0; JourneyDebug.state.mini.lockTimer = 0; });
  await click(box, 480, 305);
  results.duel = await page.evaluate(() => ({ successes: JourneyDebug.state.mini.successes, mistakes: JourneyDebug.state.mini.mistakes }));
  await cancelAndContinue();

  await open('xiaoman', 'summer');
  box = await miniBox();
  for (let i = 0; i < 6; i += 1) {
    const button = await page.evaluate(i => JourneyDebug.state.mini.buttons[i % 2], i);
    await click(box, button.x + button.w / 2, button.y + button.h / 2);
    await page.waitForTimeout(80);
  }
  results.pump = await page.evaluate(() => ({ strokes: JourneyDebug.state.mini.strokes, waterLevel: JourneyDebug.state.mini.waterLevel, holdTime: JourneyDebug.state.mini.holdTime }));
  await page.evaluate(() => { JourneyDebug.state.mini.waterLevel = .55; JourneyDebug.state.mini.holdTime = JourneyDebug.state.mini.targetSeconds; });
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.pumpExit = await page.evaluate(() => ({ mode: JourneyDebug.state.mode, complete: Boolean(JourneyDebug.state.save.stations.xiaoman?.complete) }));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('mangzhong', 'summer');
  box = await miniBox();
  for (let i = 0; i < 9; i += 1) {
    const plot = await page.evaluate(i => JourneyDebug.state.mini.plots[i], i);
    await drag(box, { x: 220 + plot.crop * 260, y: 470 }, plot);
    await page.waitForTimeout(35);
  }
  results.plant = await page.evaluate(() => ({ planted: JourneyDebug.state.mini.planted, mistakes: JourneyDebug.state.mini.mistakes }));
  await cancelAndContinue();

  await open('xiazhi', 'summer');
  box = await miniBox();
  const points = await page.evaluate(() => JourneyDebug.state.mini.tracePoints);
  const first = xy(box, points[0].x, points[0].y);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const point of points) {
    const p = xy(box, point.x, point.y);
    await page.mouse.move(p.x, p.y, { steps: 2 });
  }
  await page.mouse.up();
  results.noodle = await page.evaluate(() => ({ traced: JourneyDebug.state.mini.traceIndex, total: JourneyDebug.state.mini.tracePoints.length }));
  await cancelAndContinue();

  await open('xiaoshu', 'summer');
  const weatherBefore = await page.evaluate(() => ({ index: JourneyDebug.state.mini.weatherIndex, mistakes: JourneyDebug.state.mini.mistakes }));
  await page.evaluate(() => { JourneyDebug.state.mini.roundClock = JourneyDebug.state.mini.roundLimit + .1; });
  await page.waitForTimeout(120);
  results.weatherTimeout = await page.evaluate((before) => ({
    advanced: JourneyDebug.state.mini.weatherIndex > before.index,
    mistakes: JourneyDebug.state.mini.mistakes,
    beforeMistakes: before.mistakes
  }), weatherBefore);
  await cancelAndContinue();

  await open('liqiu', 'autumn');
  box = await miniBox();
  for (let i = 0; i < 9; i += 1) {
    const item = await page.evaluate(i => JourneyDebug.state.mini.items[i], i);
    await drag(box, { x: item.x, y: item.y }, { x: item.cat === 0 ? 250 : 680, y: 260 });
    await page.waitForTimeout(35);
  }
  results.hang = await page.evaluate(() => ({ hung: JourneyDebug.state.mini.hung, mistakes: JourneyDebug.state.mini.mistakes }));
  await cancelAndContinue();

  await open('chushu', 'autumn');
  box = await miniBox();
  await click(box, 170, 360);
  await page.waitForTimeout(120);
  await click(box, 790, 360);
  results.lantern = await page.evaluate(() => ({ progress: JourneyDebug.state.mini.progress, velocity: JourneyDebug.state.mini.velocity, flash: JourneyDebug.state.mini.flash }));
  await page.evaluate(() => { JourneyDebug.state.mini.progress = .999; JourneyDebug.state.mini.finishAt = null; });
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  await page.waitForTimeout(420);
  results.lanternExit = await page.evaluate(() => ({
    mode: JourneyDebug.state.mode,
    overlayHidden: document.querySelector('#miniOverlay').hidden,
    complete: Boolean(JourneyDebug.state.save.stations.chushu?.complete),
    stars: JourneyDebug.state.save.stations.chushu?.stars || 0
  }));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('bailu', 'autumn');
  box = await miniBox();
  const drops = await page.evaluate(() => JourneyDebug.state.mini.drops.map(({ x, y }) => ({ x, y })));
  for (const drop of drops) await click(box, drop.x, drop.y);
  results.dew = await page.evaluate(() => ({ caught: JourneyDebug.state.mini.caught, total: JourneyDebug.state.mini.drops.length }));
  await cancelAndContinue();

  await open('qiufen', 'autumn');
  box = await miniBox();
  await click(box, 480, 231); await click(box, 480, 231);
  await click(box, 480, 181);
  await click(box, 480, 126); await click(box, 480, 126); await click(box, 480, 126);
  results.moon = await page.evaluate(() => ({ offsets: JourneyDebug.state.mini.offsets.slice(), finishAt: JourneyDebug.state.mini.finishAt }));
  await cancelAndContinue();

  await open('hanlu', 'autumn');
  box = await miniBox();
  const stones = await page.evaluate(() => JourneyDebug.state.mini.stones.map(({ x, y }) => ({ x, y })));
  for (const stone of stones) await click(box, stone.x, stone.y);
  results.climb = await page.evaluate(() => ({ cleared: JourneyDebug.state.mini.nextStone, total: JourneyDebug.state.mini.stones.length }));
  await cancelAndContinue();

  await open('shuangjiang', 'autumn');
  box = await miniBox();
  const start = xy(box, 350, 300);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.move(xy(box, 650, 300).x, xy(box, 650, 300).y, { steps: 10 });
    await page.mouse.move(xy(box, 350, 300).x, xy(box, 350, 300).y, { steps: 10 });
  }
  await page.mouse.up();
  results.shake = await page.evaluate(() => ({ fruits: JourneyDebug.state.mini.fruits, shaken: JourneyDebug.state.mini.shakeCount, falling: JourneyDebug.state.mini.falling.length }));
  for (let i = 0; i < 5; i += 1) {
    const needsFruit = await page.evaluate(() => !JourneyDebug.state.mini.falling.length && JourneyDebug.state.mini.fruits > 0);
    if (needsFruit) { await page.keyboard.press('Space'); await page.waitForTimeout(40); }
    await page.evaluate(() => {
      const mini = JourneyDebug.state.mini;
      const fruit = mini.falling[0];
      if (fruit) { mini.basketX = fruit.x; fruit.y = 438; }
    });
    await page.waitForTimeout(120);
  }
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.shakeCaught = await page.evaluate(() => ({ caught: JourneyDebug.state.save.stations.shuangjiang ? 1 : 0, mode: JourneyDebug.state.mode, complete: Boolean(JourneyDebug.state.save.stations.shuangjiang?.complete) }));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('lidong', 'winter');
  box = await miniBox();
  for (let i = 0; i < 3; i += 1) {
    await click(box, 480, 270);
    await drag(box, { x: 400, y: 270 }, { x: 560, y: 270 }, 8);
    await click(box, 480, 270);
    await page.waitForTimeout(70);
  }
  results.fold = await page.evaluate(() => ({ round: JourneyDebug.state.mini ? JourneyDebug.state.mini.round : 3, stage: JourneyDebug.state.mini ? JourneyDebug.state.mini.stage : 0 }));
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.fold.complete = await page.evaluate(() => Boolean(JourneyDebug.state.save.stations.lidong?.complete));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('xiaoxue', 'winter');
  box = await miniBox();
  const saltStart = xy(box, 420, 190);
  await page.mouse.move(saltStart.x, saltStart.y);
  await page.mouse.down();
  for (let i = 0; i < 3; i += 1) {
    const p = xy(box, 420, 190 + i * 115);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(700);
  }
  await page.mouse.up();
  results.salt = await page.evaluate(() => ({ coverage: JourneyDebug.state.mini ? JourneyDebug.state.mini.coverage.slice() : [1, 1, 1], overSalted: JourneyDebug.state.mini ? JourneyDebug.state.mini.overSalted.slice() : [] }));
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.salt.complete = await page.evaluate(() => Boolean(JourneyDebug.state.save.stations.xiaoxue?.complete));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('daxue', 'winter');
  box = await miniBox();
  const patches = await page.evaluate(() => JourneyDebug.state.mini.patches.map(({ x, y }) => ({ x, y })));
  for (const patch of patches) {
    await page.mouse.move(xy(box, patch.x - 20, patch.y).x, xy(box, patch.x - 20, patch.y).y);
    await page.mouse.down();
    await page.mouse.move(xy(box, patch.x + 20, patch.y).x, xy(box, patch.x + 20, patch.y).y, { steps: 3 });
    await page.mouse.up();
  }
  results.wipe = await page.evaluate(() => ({ cleared: JourneyDebug.state.mini ? JourneyDebug.state.mini.patches.filter(p => p.cleared).length : 8 }));
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.wipe.complete = await page.evaluate(() => Boolean(JourneyDebug.state.save.stations.daxue?.complete));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('dongzhi', 'winter');
  box = await miniBox();
  for (let i = 0; i < 3; i += 1) {
    const center = await page.evaluate(i => JourneyDebug.state.mini.centers[i], i);
    const p = xy(box, center.x + 70, center.y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.evaluate(() => { JourneyDebug.state.mini.rollTotal = Math.PI * 2 * JourneyDebug.state.mini.game.targetTurns - .02; });
    await page.mouse.move(xy(box, center.x, center.y - 70).x, xy(box, center.x, center.y - 70).y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(90);
  }
  results.roll = await page.evaluate(() => ({ round: JourneyDebug.state.mini ? JourneyDebug.state.mini.round : 3 }));
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.roll.complete = await page.evaluate(() => Boolean(JourneyDebug.state.save.stations.dongzhi?.complete));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('xiaohan', 'winter');
  box = await miniBox();
  for (let ingredientIndex = 0; ingredientIndex < 4; ingredientIndex += 1) {
    const slot = await page.evaluate(index => JourneyDebug.state.mini.trayOrder.indexOf(index), ingredientIndex);
    await drag(box, { x: 210 + slot * 220, y: 455 }, { x: 480, y: 335 });
    await page.waitForTimeout(70);
  }
  results.pour = await page.evaluate(() => ({ index: JourneyDebug.state.mini ? JourneyDebug.state.mini.index : 4 }));
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.pour.complete = await page.evaluate(() => Boolean(JourneyDebug.state.save.stations.xiaohan?.complete));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await open('dahan', 'winter');
  box = await miniBox();
  const dust = await page.evaluate(() => JourneyDebug.state.mini.spots.map(({ x, y }) => ({ x, y })));
  for (const spot of dust) {
    for (let pass = 0; pass < 2; pass += 1) {
      await page.mouse.move(xy(box, spot.x - 32, spot.y).x, xy(box, spot.x - 32, spot.y).y);
      await page.mouse.down();
      await page.mouse.move(xy(box, spot.x + 32, spot.y).x, xy(box, spot.x + 32, spot.y).y, { steps: 4 });
      await page.mouse.up();
    }
  }
  results.sweep = await page.evaluate(() => ({ cleared: JourneyDebug.state.mini ? JourneyDebug.state.mini.spots.filter(s => s.cleared).length : 9, mistakes: JourneyDebug.state.mini ? JourneyDebug.state.mini.mistakes : 0 }));
  await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 6000 });
  results.sweep.complete = await page.evaluate(() => Boolean(JourneyDebug.state.save.stations.dahan?.complete));
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  const failures = [];
  if (!results.assembleTutorialBlocked) failures.push('纸鸢拼装教程开始前互动未被阻止');
  if (results.assemble.placed !== 6 || results.assemble.nextPiece !== 6) failures.push('纸鸢六个视觉部件未全部拼上');
  if (results.assembleExit.mode !== 'world' || !results.assembleExit.complete || !results.assembleExit.overlayHidden) failures.push('纸鸢完成后未退出或未记录完成');
  if (!results.sortTimeout.failed) failures.push('谷雨分拣超时未触发重试');
  if (!results.weatherTimeout.advanced || results.weatherTimeout.mistakes <= results.weatherTimeout.beforeMistakes) failures.push('小暑天气反应超时未判错推进');
  if (!results.duelTutorialBlocked) failures.push('教程开始前互动未被阻止');
  if (results.duel.successes < 1) failures.push('斗蛋未命中');
  if (results.pump.strokes < 6 || results.pump.waterLevel <= 0) failures.push('水车未进入持续水位挑战');
  if (results.pumpExit.mode !== 'world' || !results.pumpExit.complete) failures.push('水车稳定供水后未完成');
  if (results.plant.planted < 9) failures.push('插秧未填满九格');
  if (results.noodle.traced < results.noodle.total) failures.push('拉面未描完整条路径');
  if (results.hang.hung < 9) failures.push('晒秋未挂满九件');
  if (results.lantern.progress <= 0 || !results.lantern.flash.includes('推流')) failures.push('河灯未被水流推动');
  if (results.lanternExit.mode !== 'world' || !results.lanternExit.overlayHidden || !results.lanternExit.complete) failures.push('处暑河灯完成后未退出小游戏');
  if (results.dew.caught < results.dew.total) failures.push('清露未收满');
  if (!results.moon.offsets.every(offset => offset === 0)) failures.push('月盘未校准');
  if (results.climb.cleared < results.climb.total) failures.push('登高未走完石阶');
  if (results.shake.shaken < 1 || !results.shakeCaught.complete) failures.push('霜降摇树接果未完成');
  if (results.fold.round < 3 || !results.fold.complete) failures.push('立冬三阶段包饺子未完成');
  if (!results.salt.complete || !results.salt.coverage.every(value => value >= .82)) failures.push('小雪抹盐未完成');
  if (results.wipe.cleared < 8 || !results.wipe.complete) failures.push('大雪扫雪未完成');
  if (results.roll.round < 3 || !results.roll.complete) failures.push('冬至汤圆旋转圈数未达标');
  if (results.pour.index < 4 || !results.pour.complete) failures.push('小寒乱序食材投料未完成');
  if (results.sweep.cleared < 9 || !results.sweep.complete) failures.push('大寒扫尘未完成');
  if (errors.length) failures.push('控制台存在错误');

  const summary = { status: failures.length ? 'failed' : 'ok', results, errors, failures };
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  if (failures.length) process.exitCode = 1;
})();
