const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#startBtn');
  await page.click('[data-level="lichun"]');
  await page.click('[data-action="dial-hint"]');
  const precisionAfterHint = (await page.locator('#precisionValue').textContent()).trim();
  await page.evaluate(() => {
    const range = document.querySelector('#dialRange');
    range.value = '315';
    range.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('[data-action="lock-dial"]');
  await page.click('[data-term-choice="lichun"]');
  await page.click('[data-action="continue-phase"]');
  for (const index of [0,1,2]) await page.click(`[data-pentad="lichun::${index}"]`);
  await page.click('[data-action="submit-pentads"]');
  for (const index of [0,1,2]) await page.click(`[data-order-pick="lichun::${index}"]`);
  await page.click('[data-action="submit-order"]');
  await page.click('[data-action="continue-phase"]');
  const myth = await page.evaluate(() => window.GAME_DATA.terms.find(term => term.id === 'lichun').myth);
  await page.locator('[data-evidence]').filter({ hasText: myth.evidence[0].text.slice(0, 18) }).click();
  await page.locator('[data-evidence]').filter({ hasText: myth.traps[0].text.slice(0, 18) }).click();
  await page.click('[data-action="submit-evidence"]');
  const wrongFeedback = (await page.locator('.feedback-box.is-wrong').textContent()).trim();
  const afterWrong = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('jieqi-xinglv-save-v1'));
    return { mistakes: save.mistakes.length, resolved: save.mistakes[0]?.resolved, precision: document.querySelector('#precisionValue')?.textContent };
  });
  await page.locator('[data-evidence]').filter({ hasText: myth.traps[0].text.slice(0, 18) }).click();
  await page.locator('[data-evidence]').filter({ hasText: myth.evidence[1].text.slice(0, 18) }).click();
  await page.click('[data-action="submit-evidence"]');
  await page.click('[data-nav="review"]');
  await page.waitForSelector('.review-card');
  const review = await page.evaluate(() => ({
    cards: document.querySelectorAll('.review-card').length,
    status: document.querySelector('.review-card__status')?.textContent?.trim(),
    resolved: JSON.parse(localStorage.getItem('jieqi-xinglv-save-v1')).mistakes[0]?.resolved
  }));
  console.log(JSON.stringify({ precisionAfterHint, wrongFeedback, afterWrong, review, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
