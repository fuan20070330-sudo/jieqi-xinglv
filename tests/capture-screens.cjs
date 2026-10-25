const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.resolve(__dirname, '..', 'output', '作品截图');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  let page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const shot = async (filename, name) => {
    const target = path.join(OUT, filename);
    await page.screenshot({ path: target, fullPage: false, animations: 'disabled' });
    return { filename, name, target, size: fs.statSync(target).size };
  };

  const captures = [];
  captures.push(await shot('01_首页.png', '首页：四季黄经仪与赛项主题'));

  await page.click('#startBtn');
  await page.waitForSelector('[data-level="lichun"]');
  await page.waitForTimeout(200);
  captures.push(await shot('02_四季星图.png', '四季星图与章节节点'));

  await page.click('[data-level="lichun"]');
  await page.waitForSelector('#dialRange');
  await page.waitForTimeout(200);
  captures.push(await shot('03_观天黄经仪.png', '观天：太阳黄经仪校准'));

  await page.evaluate(() => {
    const range = document.querySelector('#dialRange');
    range.value = '315';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('[data-action="lock-dial"]');
  await page.click('[data-term-choice="lichun"]');
  await page.click('[data-action="continue-phase"]');
  for (const index of [0, 1, 2]) await page.click(`[data-pentad="lichun::${index}"]`);
  await page.waitForTimeout(200);
  captures.push(await shot('04_识候候牌.png', '识候：混合候牌筛选'));

  await page.click('[data-action="submit-pentads"]');
  for (const index of [0, 1, 2]) await page.click(`[data-order-pick="lichun::${index}"]`);
  await page.click('[data-action="submit-order"]');
  await page.click('[data-action="continue-phase"]');
  const myth = await page.evaluate(() => window.GAME_DATA.terms.find(term => term.id === 'lichun').myth);
  for (const evidence of myth.evidence) {
    await page.locator('[data-evidence]').filter({ hasText: evidence.text.slice(0, 18) }).click();
  }
  await page.waitForTimeout(200);
  captures.push(await shot('05_辨误天平.png', '辨误：科学证据天平'));

  await page.click('[data-action="submit-evidence"]');
  await page.click('[data-action="continue-phase"]');
  await page.click('[data-chain-pick="0"]');
  await page.click('[data-chain-pick="1"]');
  await page.waitForTimeout(200);
  captures.push(await shot('06_因果修复.png', '修复：物候因果链'));

  const data = await page.evaluate(() => window.GAME_DATA);
  const now = new Date().toISOString();
  const levels = {};
  const pentads = {};
  const trials = {};
  data.terms.forEach(term => {
    levels[term.id] = { completed: true, bestScore: 1000, stars: 3, bestCombo: 4, attempts: 1, completedAt: now, lastPlayedAt: now };
    term.pentads.forEach((_, index) => { pentads[`${term.id}::${index}`] = true; });
  });
  data.trials.forEach(trial => {
    trials[trial.id] = { completed: true, bestScore: 1000, stars: 3, bestCombo: 3, attempts: 1, completedAt: now, lastPlayedAt: now };
  });
  const seedSave = { version: 1, startedAt: now, lastPlayed: now, levels, pentads, trials, mistakes: [], lastRun: null, settings: { sound: false } };
  const seedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await seedContext.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: 'jieqi-xinglv-save-v1', save: seedSave });
  page = await seedContext.newPage();
  page.setDefaultTimeout(12000);
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('#startBtn');
  await page.click('#brandHome');
  await page.waitForSelector('[data-travel-card]');
  await page.click('[data-travel-card]');
  await page.waitForSelector('#travelCanvas');
  await page.waitForTimeout(300);
  captures.push(await shot('07_时间行旅成果卡.png', '通关成果卡'));

  const artifactDir = path.resolve(__dirname, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'capture-summary.json'), JSON.stringify({ captures, errors }, null, 2));
  console.log(JSON.stringify({ captures, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
