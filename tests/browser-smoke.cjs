const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:8770/';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS = path.join(__dirname, 'artifacts');
fs.mkdirSync(ARTIFACTS, { recursive: true });

async function setDial(page, longitude) {
  await page.waitForSelector('#dialRange');
  await page.evaluate(value => {
    const range = document.querySelector('#dialRange');
    range.value = String(value);
    range.dispatchEvent(new Event('input', { bubbles: true }));
  }, Number(longitude));
}

async function continuePhase(page) {
  await page.click('[data-action="continue-phase"]');
}

async function completeLevel(page, term) {
  await page.click(`[data-season="${term.season}"]`);
  await page.waitForSelector(`[data-level="${term.id}"]`);
  await page.click(`[data-level="${term.id}"]`);
  await setDial(page, term.longitude);
  await page.click('[data-action="lock-dial"]');
  await page.waitForSelector(`[data-term-choice="${term.id}"]`);
  await page.click(`[data-term-choice="${term.id}"]`);
  await page.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(page);

  await page.waitForSelector(`[data-pentad="${term.id}::0"]`);
  for (let index = 0; index < 3; index += 1) {
    await page.click(`[data-pentad="${term.id}::${index}"]`);
  }
  await page.click('[data-action="submit-pentads"]');
  await page.waitForSelector(`[data-order-pick="${term.id}::0"]`);
  for (let index = 0; index < 3; index += 1) {
    await page.click(`[data-order-pick="${term.id}::${index}"]`);
  }
  await page.click('[data-action="submit-order"]');
  await page.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(page);

  await page.waitForSelector('[data-evidence]');
  for (const evidence of term.myth.evidence) {
    await page.locator('[data-evidence]').filter({ hasText: evidence.text.slice(0, 18) }).click();
  }
  await page.click('[data-action="submit-evidence"]');
  await page.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(page);

  await page.waitForSelector('[data-chain-pick="0"]');
  for (let index = 0; index < 4; index += 1) {
    await page.click(`[data-chain-pick="${index}"]`);
  }
  await page.click('[data-action="submit-chain"]');
  await page.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(page);
  await page.waitForSelector('#resultOverlay.is-open');
  await page.click('[data-result-action="map"]');
}

async function completeTrial(page, trial) {
  await page.click(`[data-trial="${trial.id}"]`);
  await page.waitForSelector('[data-trial-order]');
  for (const id of trial.order) {
    await page.click(`[data-trial-order="${id}"]`);
  }
  await page.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(page);

  await page.waitForSelector('[data-trial-pentad]');
  for (const pair of trial.match) {
    await page.locator('[data-trial-pentad]').filter({ hasText: pair.pentad }).click();
  }
  await page.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(page);

  await page.waitForSelector('[data-trial-statement]');
  for (let index = 0; index < trial.statements.length; index += 1) {
    if (trial.statements[index].ok) {
      await page.click(`[data-trial-statement="${index}"]`);
    }
  }
  await page.click('[data-action="submit-trial-truth"]');
  await page.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(page);
  await page.waitForSelector('#resultOverlay.is-open');
  await page.click('[data-result-action="map"]');
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const data = await page.evaluate(() => window.GAME_DATA);
  const desktopHome = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    title: document.title,
    active: document.querySelector('.screen.is-active')?.id
  }));
  await page.screenshot({ path: path.join(ARTIFACTS, '01-home-desktop.png'), fullPage: true });
  await page.click('#startBtn');
  await page.waitForSelector('[data-level="lichun"]');
  const mapNodes = await page.locator('.level-node').count();
  await page.screenshot({ path: path.join(ARTIFACTS, '02-map-desktop.png'), fullPage: true });

  for (const term of data.terms) {
    await completeLevel(page, term);
  }

  const afterTerms = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('jieqi-xinglv-save-v1'));
    return {
      levels: Object.values(save.levels).filter(level => level.completed).length,
      pentads: Object.keys(save.pentads).length,
      stars: Object.values(save.levels).reduce((sum, level) => sum + level.stars, 0),
      lastRun: save.lastRun
    };
  });

  for (const trial of data.trials) {
    await page.click(`[data-season="${trial.season}"]`);
    await page.waitForSelector(`[data-trial="${trial.id}"]`);
    await completeTrial(page, trial);
  }

  const afterTrials = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('jieqi-xinglv-save-v1'));
    return {
      trials: Object.values(save.trials).filter(item => item.completed).length,
      trialStars: Object.values(save.trials).reduce((sum, item) => sum + item.stars, 0),
      mistakes: save.mistakes.length
    };
  });

  await page.evaluate(() => document.querySelector('#brandHome').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACTS, '03-home-complete.png'), fullPage: true });
  await page.click('[data-travel-card]');
  await page.waitForSelector('#travelCanvas');
  await page.waitForTimeout(300);
  const downloadPromise = page.waitForEvent('download');
  await page.click('#downloadCardBtn');
  const download = await downloadPromise;
  const downloadPath = path.join(ARTIFACTS, 'travel-card.png');
  await download.saveAs(downloadPath);
  await page.screenshot({ path: path.join(ARTIFACTS, '04-travel-card.png'), fullPage: true });

  const resumeContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await resumeContext.newPage();
  mobile.setDefaultTimeout(12000);
  mobile.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(BASE_URL, { waitUntil: 'networkidle' });
  await mobile.evaluate(() => localStorage.clear());
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.click('#startBtn');
  await mobile.waitForSelector('[data-level="lichun"]');
  const mobileMap = await mobile.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  await mobile.screenshot({ path: path.join(ARTIFACTS, '05-map-mobile.png'), fullPage: true });
  await mobile.click('[data-level="lichun"]');
  await setDial(mobile, 315);
  await mobile.click('[data-action="lock-dial"]');
  await mobile.waitForSelector('[data-term-choice="lichun"]');
  await mobile.click('[data-term-choice="lichun"]');
  await mobile.waitForSelector('[data-action="continue-phase"]');
  await continuePhase(mobile);
  await mobile.waitForSelector('[data-pentad="lichun::0"]');
  await mobile.reload({ waitUntil: 'networkidle' });
  await mobile.waitForTimeout(300);
  const resumeButton = (await mobile.locator('#startBtn').textContent()).trim();
  await mobile.click('#startBtn');
  await mobile.waitForSelector('.stage-kicker');
  const resumePhase = (await mobile.locator('.stage-kicker').textContent()).trim();
  const mobileGame = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    minVisibleButton: Math.min(...Array.from(document.querySelectorAll('button')).filter(button => button.offsetParent !== null).map(button => button.getBoundingClientRect().height)),
    viewport: [innerWidth, innerHeight]
  }));
  await mobile.screenshot({ path: path.join(ARTIFACTS, '06-game-mobile.png'), fullPage: true });

  const summary = {
    desktopHome,
    mapNodes,
    afterTerms,
    afterTrials,
    download: path.basename(downloadPath),
    resumeButton,
    resumePhase,
    mobileMap,
    mobileGame,
    errors
  };
  fs.writeFileSync(path.join(ARTIFACTS, 'browser-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  await resumeContext.close();
  await context.close();
  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
