const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [];
  const network = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/i.test(request.url())) network.push(request.url());
  });
  const file = path.resolve(__dirname, '..', 'output', '节气行旅_离线版.html');
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#startBtn');
  await page.waitForSelector('[data-level="lichun"]');
  await page.click('[data-level="lichun"]');
  await page.waitForSelector('#dialRange');
  const mounted = await page.evaluate(() => ({
    active: document.querySelector('.screen.is-active')?.id,
    phase: document.querySelector('.stage-kicker')?.textContent?.trim(),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    resourceUrls: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /^https?:/i.test(name))
  }));
  console.log(JSON.stringify({ mounted, network, errors }, null, 2));
  await browser.close();
  if (errors.length || network.length) process.exitCode = 1;
})();
