// Phone screenshots of the live site for the Play Store listing (1080 x 2340, portrait).
const { chromium } = require('playwright');
const fs = require('fs');

const PAGES = [
  ['01-mwanzo', 'https://kentexa.com/'],
  ['02-uza-tena', 'https://kentexa.com/uza-tena'],
  ['03-tafuta', 'https://kentexa.com/?page=Search'],
  ['04-jiunge', 'https://kentexa.com/?page=Register'],
];

(async () => {
  fs.mkdirSync(`${__dirname}/out`, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'sw-TZ' });
  for (const [name, url] of PAGES) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${__dirname}/out/${name}.png` });
      console.log('ok', name, page.url());
    } catch (e) { console.log('failed', name, e.message); }
  }
  await browser.close();
})();
