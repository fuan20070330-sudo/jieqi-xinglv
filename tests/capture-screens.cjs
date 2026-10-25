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

  const shot = async (number, name) => {
    const target = path.join(OUT, `图（${number}）.png`);
    await page.screenshot({ path: target, fullPage: false, animations: 'disabled' });
    const size = fs.statSync(target).size;
    fs.writeFileSync(path.join(OUT, `图（${number}）.txt`), `${name}\n${target}\n`);
    return { number, name, target, size };
  };

  const captures = [];
  captures.push(await shot(1, '首页：四季黄经仪与时间失序设定'));

  await page.click('#startBtn');
  await page.waitForSelector('[data-level="lichun"]');
  await page.waitForTimeout(250);
  captures.push(await shot(2, '春章星图：章节进度、节气节点与章末试炼'));

  await page.click('[data-level="lichun"]');
  await page.waitForSelector('#dialRange');
  await page.waitForTimeout(250);
  captures.push(await shot(3, '观天：太阳黄经仪校准'));

  await page.evaluate(() => {
    const range = document.querySelector('#dialRange');
    range.value = '315';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('[data-action="lock-dial"]');
  await page.click('[data-term-choice="lichun"]');
  await page.click('[data-action="continue-phase"]');
  for (const index of [0, 1, 2]) await page.click(`[data-pentad="lichun::${index}"]`);
  await page.waitForTimeout(250);
  captures.push(await shot(4, '识候：混合候牌筛选'));

  await page.click('[data-action="submit-pentads"]');
  for (const index of [0, 1, 2]) await page.click(`[data-order-pick="lichun::${index}"]`);
  await page.click('[data-action="submit-order"]');
  await page.click('[data-action="continue-phase"]');
  const myth = await page.evaluate(() => window.GAME_DATA.terms.find(term => term.id === 'lichun').myth);
  for (const evidence of myth.evidence) {
    await page.locator('[data-evidence]').filter({ hasText: evidence.text.slice(0, 18) }).click();
  }
  await page.waitForTimeout(250);
  captures.push(await shot(5, '辨误：科学证据天平'));

  await page.click('[data-action="submit-evidence"]');
  await page.click('[data-action="continue-phase"]');
  await page.click('[data-chain-pick="0"]');
  await page.click('[data-chain-pick="1"]');
  await page.waitForTimeout(250);
  captures.push(await shot(6, '修复：物候因果链'));

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
  await seedContext.addInitScript(({ key, save }) => {
    localStorage.setItem(key, JSON.stringify(save));
  }, { key: 'jieqi-xinglv-save-v1', save: seedSave });
  page = await seedContext.newPage();
  page.setDefaultTimeout(12000);
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.click('#startBtn');
  await page.waitForSelector('[data-season="spring"]');
  await page.click('[data-season="spring"]');
  await page.click('[data-trial="spring-trial"]');
  await page.waitForSelector('[data-trial-order]');
  await page.click('[data-trial-order="lichun"]');
  await page.click('[data-trial-order="yushui"]');
  await page.waitForTimeout(250);
  captures.push(await shot(7, '章末试炼：节气星序综合挑战'));

  await page.click('[data-nav="codex"]');
  await page.waitForSelector('.codex-card');
  await page.waitForTimeout(250);
  captures.push(await shot(8, '物候档案：72 候收集图鉴'));

  await page.click('#brandHome');
  await page.waitForSelector('[data-travel-card]');
  await page.click('[data-travel-card]');
  await page.waitForSelector('#travelCanvas');
  await page.waitForTimeout(300);
  captures.push(await shot(9, '时间行旅：通关成果卡'));

  fs.writeFileSync(path.join(OUT, 'capture-summary.json'), JSON.stringify({ captures, errors }, null, 2));
  console.log(JSON.stringify({ captures, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
