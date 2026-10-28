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
      // Блок «Один лот. Четыре философии»: текст — HTML, фото загружены, без горизонтальной прокрутки страницы.
      const block = page.locator('[data-four-philosophies]');
      await block.waitFor();
      const info = await block.evaluate(s => {
        const r = s.getBoundingClientRect();
        const imgs = [...s.querySelectorAll('img')];
        return { width: r.width, height: r.height, left: r.left, right: r.right,
          title: s.querySelector('h2')?.textContent, columns: s.querySelectorAll('article').length,
          imagesLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, images: imgs.length,
          background: getComputedStyle(s).backgroundColor,
          pageBackground: getComputedStyle(document.querySelector('main')).backgroundColor,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      if (response.status() !== 200 || info.background !== 'rgb(245, 242, 235)' ||
          info.pageBackground !== 'rgb(245, 242, 235)' || info.overflow || info.left < 0 || info.right > width ||
          info.title !== 'ОДИН LOT. ЧЕТЫРЕ ФИЛОСОФИИ.' || info.columns !== 4 || info.imagesLoaded !== info.images ||
          errors.length) throw Error(JSON.stringify({width,info,errors}));
      await page.screenshot({ path: `${process.argv[4]}/${width}.png`, fullPage: true });
      results.push({width, ...info, errors});
      await page.close();
    }
    console.log(JSON.stringify(results));
    fs.writeFileSync(`${process.argv[4]}/results.json`, JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
