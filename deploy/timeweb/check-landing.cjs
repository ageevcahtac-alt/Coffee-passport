const { chromium } = require(process.argv[2]);
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  const results = [];
  fs.mkdirSync(process.argv[4], { recursive: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const response = await page.goto(process.argv[3], { waitUntil: 'networkidle' });
      const img = page.locator('img[src="/images/coffee-passport-four-philosophies.png"]');
      await img.waitFor();
      const info = await img.evaluate(i => {
        const r = i.getBoundingClientRect();
        return { width: r.width, height: r.height, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight,
          background: getComputedStyle(document.querySelector('main')).backgroundColor,
          left: r.left, right: r.right, overflow: document.documentElement.scrollWidth > innerWidth,
          link: i.parentElement.getAttribute('href') };
      });
      if (response.status() !== 200 || info.background !== 'rgb(245, 242, 235)' || info.overflow ||
          info.left < 0 || info.right > width || info.naturalWidth !== 1672 || info.naturalHeight !== 941 ||
          Math.abs(info.height / info.width - 941 / 1672) > .002 || errors.length) throw Error(JSON.stringify({width,info,errors}));
      const popupPromise = page.waitForEvent('popup');
      await img.click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      if (!popup.url().endsWith(info.link)) throw Error('Original link failed');
      await popup.close();
      await page.screenshot({ path: `${process.argv[4]}/${width}.png`, fullPage: true });
      results.push({width, ...info, originalOpens: true, errors});
      await page.close();
    }
    console.log(JSON.stringify(results));
    fs.writeFileSync(`${process.argv[4]}/results.json`, JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
