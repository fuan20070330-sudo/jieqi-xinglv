const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('jieqi-journey-save-v2', JSON.stringify({
      version: 2,
      stations: { lichun: { complete: true, stars: 15, bestScore: 9999 } },
      currentSeason: 'summer'
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(220);
  const legacyIsolation = await page.evaluate(() => ({
    saveKey: JourneyDebug.getSaveKey(),
    springStars: JourneyDebug.getSeasonStars('spring'),
    stationCount: Object.keys(JourneyDebug.state.save.stations).length,
    startLabel: document.querySelector('#startBtn').textContent,
    resetHidden: document.querySelector('#resetBtn').hidden
  }));
  await page.click('#startBtn');
  await page.waitForTimeout(220);

  const seedSpring = async starsForAll => page.evaluate(starsForAll => {
    const ids = JourneyDebug.getData().seasons.spring.terms;
    ids.forEach(id => { JourneyDebug.state.save.stations[id] = { complete: true, stars: starsForAll, bestScore: 700 }; });
    JourneyDebug.teleportToPortal();
  }, starsForAll);

  await seedSpring(2);
  const twelve = await page.evaluate(() => ({
    stars: JourneyDebug.getSeasonStars('spring'),
    canEnter: JourneyDebug.canEnterSeason('summer'),
    promptLabel: document.querySelector('#promptLabel').textContent,
    promptText: document.querySelector('#nearStationName').textContent,
    promptVisible: !document.querySelector('#interactionPrompt').hidden
  }));
  await page.click('#interactionPrompt');
  await page.waitForTimeout(120);
  const afterTwelveClick = await page.evaluate(() => ({ season: JourneyDebug.state.season, toast: document.querySelector('#toast').textContent }));

  await page.evaluate(() => { JourneyDebug.state.save.stations.lichun.stars = 3; JourneyDebug.teleportToPortal(); });
  await page.waitForTimeout(60);
  const thirteen = await page.evaluate(() => ({
    stars: JourneyDebug.getSeasonStars('spring'),
    canEnter: JourneyDebug.canEnterSeason('summer'),
    promptLabel: document.querySelector('#promptLabel').textContent,
    promptText: document.querySelector('#nearStationName').textContent
  }));
  await page.click('#interactionPrompt');
  await page.waitForTimeout(180);
  const afterThirteenClick = await page.evaluate(() => ({ season: JourneyDebug.state.season, saveSeason: JourneyDebug.state.save.currentSeason }));

  await page.reload({ waitUntil: 'networkidle' });
  const continueMenu = await page.evaluate(() => ({
    startLabel: document.querySelector('#startBtn').textContent,
    resetVisible: !document.querySelector('#resetBtn').hidden
  }));
  await page.click('#startBtn');
  await page.waitForTimeout(180);
  await page.evaluate(() => {
    JourneyDebug.state.save.stations = {};
    JourneyDebug.enterSeason('spring');
    JourneyDebug.teleportToTerm('lichun');
  });

  async function playLichun(mistakes) {
    await page.keyboard.press('e');
    await page.waitForSelector('#miniOverlay:not([hidden])');
    await page.click('#miniStartBtn');
    await page.evaluate(mistakes => {
      JourneyDebug.state.mini.mistakes = mistakes;
      JourneyDebug.completeCurrentMini();
    }, mistakes);
    const result = await page.evaluate(() => ({
      levelStars: JourneyDebug.state.save.stations.lichun.stars,
      lastStars: JourneyDebug.state.save.stations.lichun.lastStars,
      attempts: JourneyDebug.state.save.stations.lichun.attempts,
      springStars: JourneyDebug.getSeasonStars('spring'),
      totalStars: JourneyDebug.getTotalStars()
    }));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#miniOverlay', { state: 'hidden' });
    if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');
    await page.evaluate(() => JourneyDebug.teleportToTerm('lichun'));
    return result;
  }

  const run1 = await playLichun(4);
  const run2 = await playLichun(4);
  const run3 = await playLichun(1);
  const run4 = await playLichun(4);

  await page.keyboard.press('Escape');
  await page.waitForSelector('#menu:not([hidden])');
  page.once('dialog', dialog => dialog.accept());
  await page.click('#resetBtn');
  await page.waitForTimeout(120);
  const resetResult = await page.evaluate(() => ({
    totalStars: JourneyDebug.getTotalStars(),
    springStars: JourneyDebug.getSeasonStars('spring'),
    stationCount: Object.keys(JourneyDebug.state.save.stations).length,
    startLabel: document.querySelector('#startBtn').textContent,
    resetHidden: document.querySelector('#resetBtn').hidden
  }));

  const clampContext = await browser.newContext();
  await clampContext.addInitScript(() => {
    localStorage.setItem('jieqi-journey-save-v3', JSON.stringify({
      schemaVersion: 3,
      stations: { lichun: { complete: true, stars: 99, bestScore: 1000 } },
      currentSeason: 'spring'
    }));
  });
  const clampPage = await clampContext.newPage();
  await clampPage.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await clampPage.waitForTimeout(160);
  const clamped = await clampPage.evaluate(() => ({
    levelStars: JourneyDebug.state.save.stations.lichun.stars,
    springStars: JourneyDebug.getSeasonStars('spring'),
    totalStars: JourneyDebug.getTotalStars()
  }));
  await clampContext.close();

  const failures = [];
  if (legacyIsolation.saveKey !== 'jieqi-journey-save-v3') failures.push('应启用新的 v3 存档键');
  if (legacyIsolation.springStars !== 0 || legacyIsolation.stationCount !== 0) failures.push('旧版高星存档不应污染新版进度');
  if (legacyIsolation.startLabel !== '开始行旅' || !legacyIsolation.resetHidden) failures.push('首次进入不应显示已有进度');
  if (twelve.stars !== 12 || twelve.canEnter) failures.push('12 星不应解锁下一季');
  if (!twelve.promptVisible || !twelve.promptLabel.includes('还需')) failures.push('星门未显示 12 星不足提示');
  if (afterTwelveClick.season !== 'spring') failures.push('点击“往”后 12 星仍进入了下一季');
  if (thirteen.stars !== 13 || !thirteen.canEnter) failures.push('13 星应解锁下一季');
  if (afterThirteenClick.season !== 'summer') failures.push('点击“往”未进入夏季');
  if (continueMenu.startLabel !== '继续行旅' || !continueMenu.resetVisible) failures.push('已有进度时菜单应提供继续与清空进度');
  if (run1.levelStars !== 1 || run1.springStars !== 1 || run1.totalStars !== 1) failures.push('第一次 1 星后总数应为 1');
  if (run2.levelStars !== 1 || run2.springStars !== 1 || run2.totalStars !== 1) failures.push('第二次仍得 1 星时总数应保持 1');
  if (run3.levelStars !== 2 || run3.springStars !== 2 || run3.totalStars !== 2) failures.push('第三次得 2 星时总数应更新为 2');
  if (run4.levelStars !== 2 || run4.springStars !== 2 || run4.totalStars !== 2) failures.push('之后重玩 1 星时最佳总数应保持 2');
  if (run3.lastStars !== 2 || run4.lastStars !== 1) failures.push('应分别记录本局星级与历史最佳星级');
  if (run4.attempts !== 4) failures.push('应正确累计游玩次数');
  if (resetResult.totalStars !== 0 || resetResult.springStars !== 0 || resetResult.stationCount !== 0) failures.push('清空进度后星数应归零');
  if (resetResult.startLabel !== '开始行旅' || !resetResult.resetHidden) failures.push('清空后菜单应恢复首次进入状态');
  if (clamped.levelStars !== 3 || clamped.springStars !== 3 || clamped.totalStars !== 3) failures.push('异常旧数据中的单关星级应被限制在 0—3');
  if (errors.length) failures.push('控制台存在错误');

  console.log(JSON.stringify({
    status: failures.length ? 'failed' : 'ok',
    legacyIsolation,
    twelve,
    afterTwelveClick,
    thirteen,
    afterThirteenClick,
    continueMenu,
    starRuns: [run1, run2, run3, run4],
    resetResult,
    clamped,
    errors,
    failures
  }, null, 2));
  await browser.close();
  if (failures.length) process.exitCode = 1;
})();
