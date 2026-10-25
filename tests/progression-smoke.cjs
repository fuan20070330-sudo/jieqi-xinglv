const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
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

  const seedSpring = async starsForAll => page.evaluate(starsForAll => {
    const ids = JourneyDebug.getData().seasons.spring.terms;
    ids.forEach(id => { JourneyDebug.state.save.stations[id] = { complete: true, stars: starsForAll, bestScore: 700 }; });
    JourneyDebug.teleportToPortal();
  }, starsForAll);

  await seedSpring(2);
  const twelve = await page.evaluate(() => ({
    stars: ['lichun','yushui','jingzhe','chunfen','qingming','guyu'].reduce((sum, id) => sum + JourneyDebug.state.save.stations[id].stars, 0),
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
    stars: ['lichun','yushui','jingzhe','chunfen','qingming','guyu'].reduce((sum, id) => sum + JourneyDebug.state.save.stations[id].stars, 0),
    canEnter: JourneyDebug.canEnterSeason('summer'),
    promptLabel: document.querySelector('#promptLabel').textContent,
    promptText: document.querySelector('#nearStationName').textContent
  }));
  await page.click('#interactionPrompt');
  await page.waitForTimeout(180);
  const afterThirteenClick = await page.evaluate(() => ({ season: JourneyDebug.state.season, saveSeason: JourneyDebug.state.save.currentSeason }));

  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#continueBtn');
  await page.waitForTimeout(200);
  await page.evaluate(() => { delete JourneyDebug.state.save.stations.lichun; JourneyDebug.enterSeason('spring'); JourneyDebug.teleportToTerm('lichun'); });
  await page.keyboard.press('e');
  await page.waitForSelector('#miniOverlay:not([hidden])');
  await page.click('#miniStartBtn');
  await page.evaluate(() => { JourneyDebug.state.mini.mistakes = 3; JourneyDebug.completeCurrentMini(); });
  const firstRun = await page.evaluate(() => JourneyDebug.state.save.stations.lichun.stars);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#miniOverlay', { state: 'hidden' });
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await page.evaluate(() => JourneyDebug.teleportToTerm('lichun'));
  await page.keyboard.press('e');
  await page.waitForSelector('#miniOverlay:not([hidden])');
  await page.click('#miniStartBtn');
  await page.evaluate(() => { JourneyDebug.state.mini.mistakes = 0; JourneyDebug.completeCurrentMini(); });
  const improvedRun = await page.evaluate(() => JourneyDebug.state.save.stations.lichun.stars);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#miniOverlay', { state: 'hidden' });
  if (await page.locator('#chapterOverlay').isVisible()) await page.click('#staySeasonBtn');

  await page.evaluate(() => JourneyDebug.teleportToTerm('lichun'));
  await page.keyboard.press('e');
  await page.waitForSelector('#miniOverlay:not([hidden])');
  await page.click('#miniStartBtn');
  await page.evaluate(() => { JourneyDebug.state.mini.mistakes = 4; JourneyDebug.completeCurrentMini(); });
  const replayWorse = await page.evaluate(() => JourneyDebug.state.save.stations.lichun.stars);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#miniOverlay', { state: 'hidden' });

  const failures = [];
  if (twelve.stars !== 12 || twelve.canEnter) failures.push('12 星不应解锁下一季');
  if (!twelve.promptVisible || !twelve.promptLabel.includes('还需')) failures.push('星门未显示 12 星不足提示');
  if (afterTwelveClick.season !== 'spring') failures.push('点击“往”后 12 星仍进入了下一季');
  if (thirteen.stars !== 13 || !thirteen.canEnter) failures.push('13 星应解锁下一季');
  if (afterThirteenClick.season !== 'summer') failures.push('点击“往”未进入夏季');
  if (firstRun !== 1) failures.push('低星通关应记录 1 星');
  if (improvedRun !== 3) failures.push('高星重玩应刷新为 3 星');
  if (replayWorse !== 3) failures.push('低星重玩不应覆盖或累加最佳星级');
  if (errors.length) failures.push('控制台存在错误');

  console.log(JSON.stringify({ status: failures.length ? 'failed' : 'ok', twelve, afterTwelveClick, thirteen, afterThirteenClick, starRuns: { firstRun, improvedRun, replayWorse }, errors, failures }, null, 2));
  await browser.close();
  if (failures.length) process.exitCode = 1;
})();
