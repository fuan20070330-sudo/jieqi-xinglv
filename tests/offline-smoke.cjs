const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const network = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) network.push(request.url()); });
  const file = path.resolve(__dirname, '..', 'output', '节气行旅_离线版.html');
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const menu = await page.evaluate(() => ({ title: document.title, visible: !document.querySelector('#menu').hidden, data: Boolean(window.JOURNEY_DATA), debug: Boolean(window.JourneyDebug) }));
  await page.click('#startBtn');
  await page.waitForTimeout(300);
  const world = await page.evaluate(() => ({
    hud: !document.querySelector('#gameHud').hidden,
    mode: window.JourneyDebug.state.mode,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    resourceUrls: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /^https?:/i.test(name))
  }));
  console.log(JSON.stringify({ menu, world, network, errors }, null, 2));
  await browser.close();
  if (errors.length || network.length || !world.hud) process.exitCode = 1;
})();
