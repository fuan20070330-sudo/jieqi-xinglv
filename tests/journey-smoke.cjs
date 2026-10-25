const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() => ({
    title: document.title,
    menuVisible: !document.querySelector('#menu').hidden,
    seasonCards: document.querySelectorAll('[data-menu-season]').length,
    canvas: [document.querySelector('#gameCanvas').width, document.querySelector('#gameCanvas').height]
  }));
  await page.screenshot({ path: path.join(__dirname, 'artifacts', '01-menu.png'), fullPage: false });
  await page.click('#startBtn');
  await page.waitForTimeout(350);
  const beforeMove = await page.evaluate(() => ({ x: JourneyDebug.state.player.x, y: JourneyDebug.state.player.y, mode: JourneyDebug.state.mode }));
  await page.keyboard.down('d');
  await page.waitForTimeout(350);
  await page.keyboard.up('d');
  const afterMove = await page.evaluate(() => ({ x: JourneyDebug.state.player.x, y: JourneyDebug.state.player.y }));
  await page.screenshot({ path: path.join(__dirname, 'artifacts', '02-world.png'), fullPage: false });

  const seenTypes = new Set();
  const termResults = [];
  for (const season of SEASONS) {
    await page.evaluate(s => JourneyDebug.enterSeason(s), season);
    await page.waitForTimeout(250);
    const terms = await page.evaluate(s => JourneyDebug.getData().terms.filter(t => t.season === s).map(t => t.id), season);
    for (const id of terms) {
      await page.evaluate(termId => JourneyDebug.teleportToTerm(termId), id);
      await page.waitForTimeout(80);
      await page.keyboard.press('e');
      await page.waitForSelector('#miniOverlay:not([hidden])');
      await page.waitForTimeout(180);
      const info = await page.evaluate(() => ({ id: JourneyDebug.state.mini.term.id, type: JourneyDebug.state.mini.type, title: document.querySelector('#miniTitle').textContent }));
      seenTypes.add(info.type);
      if (id === 'lichun') await page.screenshot({ path: path.join(__dirname, 'artifacts', '03-mini.png'), fullPage: false });
      await page.evaluate(() => JourneyDebug.completeCurrentMini());
      await page.waitForSelector('#miniOverlay', { state: 'hidden', timeout: 5000 });
      await page.waitForTimeout(420);
      const isFinalTerm = season === 'winter' && id === terms[terms.length - 1];
      if (await page.locator('#chapterOverlay').isVisible() && !isFinalTerm) await page.click('#staySeasonBtn');
      const stored = await page.evaluate(termId => JourneyDebug.state.save.stations[termId], id);
      termResults.push({ id, type: info.type, complete: Boolean(stored?.complete) });
    }
  }

  // Final season completion overlay.
  await page.waitForSelector('#chapterOverlay:not([hidden])', { timeout: 4000 });
  await page.click('#nextSeasonBtn');
  await page.waitForSelector('#finalOverlay:not([hidden])');
  const final = await page.evaluate(() => ({
    stations: Object.values(JourneyDebug.state.save.stations).filter(s => s.complete).length,
    stars: Object.values(JourneyDebug.state.save.stations).reduce((n, s) => n + s.stars, 0),
    text: document.querySelector('#finalScore').textContent,
    mode: JourneyDebug.state.mode
  }));
  await page.screenshot({ path: path.join(__dirname, 'artifacts', '04-final.png'), fullPage: false });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  const mobileErrors = [];
  mobile.on('pageerror', e => mobileErrors.push(e.message));
  mobile.on('console', m => { if (m.type() === 'error') mobileErrors.push(m.text()); });
  await mobile.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.click('#startBtn');
  await mobile.waitForTimeout(300);
  const mobileBefore = await mobile.evaluate(() => ({ x: JourneyDebug.state.player.x, y: JourneyDebug.state.player.y }));
  const joy = await mobile.locator('#joystick').boundingBox();
  await mobile.mouse.move(joy.x + joy.width / 2, joy.y + joy.height / 2);
  await mobile.mouse.down();
  await mobile.mouse.move(joy.x + joy.width * .8, joy.y + joy.height / 2, { steps: 6 });
  await mobile.waitForTimeout(450);
  await mobile.mouse.up();
  const mobileState = await mobile.evaluate(() => ({
    touchVisible: !document.querySelector('#touchControls').hidden,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    actionSize: (() => { const r = document.querySelector('#actionBtn').getBoundingClientRect(); return [r.width, r.height]; })(),
    player: { x: JourneyDebug.state.player.x, y: JourneyDebug.state.player.y }
  }));
  mobileState.joystickMoved = mobileState.player.x > mobileBefore.x + 5;
  await mobile.screenshot({ path: path.join(__dirname, 'artifacts', '05-mobile-world.png'), fullPage: false });

  const summary = {
    menu,
    movement: { before: beforeMove, after: afterMove, moved: afterMove.x > beforeMove.x },
    typesSeen: [...seenTypes].sort(),
    termsCompleted: termResults.filter(item => item.complete).length,
    final,
    mobile: mobileState,
    errors,
    mobileErrors
  };
  fs.mkdirSync(path.join(__dirname, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'artifacts', 'journey-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await mobileContext.close();
  await context.close();
  await browser.close();
  if (errors.length || mobileErrors.length || termResults.some(item => !item.complete)) process.exitCode = 1;
})();
