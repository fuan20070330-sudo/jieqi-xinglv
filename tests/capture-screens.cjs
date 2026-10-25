const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '..', 'output', '作品截图');
const ARTIFACTS = path.join(__dirname, 'artifacts');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ARTIFACTS, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8770/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const shots = [];
  const shot = async (filename, name) => {
    const target = path.join(OUT, filename);
    await page.screenshot({ path: target, fullPage: false, animations: 'disabled' });
    shots.push({ filename, name, size: fs.statSync(target).size });
  };

  await shot('01_四季主菜单.png', '四季主菜单与四色节气盘');
  await page.click('#startBtn');
  await page.waitForTimeout(500);
  await page.evaluate(() => JourneyDebug.teleportToTerm('lichun'));
  await page.waitForTimeout(800);
  await shot('02_春之章_细雨.png', '春之章地图、细雨与立春节气碑');

  await page.keyboard.press('e');
  await page.waitForSelector('#miniOverlay:not([hidden])');
  await page.waitForTimeout(1400);
  await shot('03_立春咬春小游戏.png', '立春习俗小游戏：接住咬春食材');
  await page.click('#miniClose');

  await page.evaluate(() => {
    const save = JourneyDebug.state.save.stations;
    ['lichun','yushui','jingzhe','chunfen','qingming','guyu'].forEach(id => { save[id] = { complete: true, stars: 3 }; });
    JourneyDebug.enterSeason('summer');
    JourneyDebug.teleportToTerm('xiazhi');
  });
  await page.waitForTimeout(900);
  await shot('04_夏之章_烈日.png', '夏之章地图、烈日与夏季节气碑');

  await page.evaluate(() => JourneyDebug.enterSeason('spring'));
  await page.waitForTimeout(200);
  await page.evaluate(() => JourneyDebug.teleportToTerm('chunfen'));
  await page.keyboard.press('e');
  await page.waitForSelector('#miniOverlay:not([hidden])');
  await page.waitForTimeout(600);
  await shot('05_春分立蛋小游戏.png', '春分习俗小游戏：立蛋时机挑战');
  await page.click('#miniClose');

  await page.evaluate(() => {
    const save = JourneyDebug.state.save.stations;
    ['lixia','xiaoman','mangzhong','xiazhi','xiaoshu','dashu'].forEach(id => { save[id] = { complete: true, stars: 3 }; });
    JourneyDebug.enterSeason('autumn');
    JourneyDebug.teleportToTerm('qiufen');
  });
  await page.waitForTimeout(900);
  await shot('06_秋之章_落叶.png', '秋之章地图、落叶与秋季节气碑');

  await page.evaluate(() => {
    const save = JourneyDebug.state.save.stations;
    ['liqiu','chushu','bailu','qiufen','hanlu','shuangjiang'].forEach(id => { save[id] = { complete: true, stars: 3 }; });
    JourneyDebug.enterSeason('winter');
    JourneyDebug.teleportToTerm('dongzhi');
  });
  await page.waitForTimeout(900);
  await shot('07_冬之章_瑞雪.png', '冬之章地图、下雪特效与冬季节气碑');

  await page.evaluate(() => {
    const data = JourneyDebug.getData();
    data.terms.forEach(term => { JourneyDebug.state.save.stations[term.id] = { complete: true, stars: 3, bestScore: 1000 }; });
    JourneyDebug.showFinalOverlay();
  });
  await page.waitForTimeout(300);
  await shot('08_四季通关.png', '四季通关心愿卷');

  fs.writeFileSync(path.join(ARTIFACTS, 'screens-summary.json'), JSON.stringify({ shots, errors }, null, 2));
  console.log(JSON.stringify({ shots, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})();
