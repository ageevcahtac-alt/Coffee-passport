// Цвета главной на проде — по пикселям скриншота, как видит человек.
// 1) Картинка «Один лот. Четыре философии» на 390 и 1280 px: RGB фона страницы рядом с картинкой
//    и RGB фона внутри картинки (верхняя полоса, полоса над карточкой между колонками, нижняя панель).
//    Точки — в координатах файла 1672×941, взяты в глубине маски фона (≥12 px до текста и фото).
//    Плюс как отдаётся файл: content-type, размер, цветовые блоки PNG (iCCP / sRGB / gAMA / cHRM).
// 2) Форма входа на 390 px: email заполняется настоящим автозаполнением Chrome (CDP Autofill.trigger),
//    поле в состоянии :autofill; RGB фона заполненного поля сравнивается с пустым полем пароля
//    и с этим же полем до заполнения. Скриншоты до/после заполнения.
// Запуск (из workflow verify-home-colors): node verify-home-colors.cjs <путь к playwright> <путь к pngjs>
// env: PROD_URL, OUT_DIR (скриншоты и report.md), EXPECT=match — красный, если разница > 2 или поля различаются.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.argv[2]);
const { PNG } = require(process.argv[3]);

const base = process.env.PROD_URL.replace(/\/$/, '');
const out = process.env.OUT_DIR;
const strict = process.env.EXPECT === 'match';
const IMAGE = '/images/coffee-passport-four-philosophies.png';
const NATURAL = { w: 1672, h: 941 };
const POINTS = [
  ['верхняя полоса, слева', 120, 36],
  ['верхняя полоса, справа', 1550, 36],
  ['между колонками над карточкой, слева', 760, 193],
  ['между колонками над карточкой, справа', 900, 193],
  ['нижняя панель', 895, 908],
];
const TOLERANCE = 2;
const lines = [];
let failed = 0;

function log(line = '') {
  console.log(line);
  lines.push(line);
}

function pixel(png, x, y) {
  const i = (png.width * Math.round(y) + Math.round(x)) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

const fmt = (rgb) => `(${rgb.join(', ')})`;
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

function pngChunks(buf) {
  const found = [];
  for (let at = 8; at + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    if (['iCCP', 'sRGB', 'gAMA', 'cHRM'].includes(type)) found.push(type);
    if (type === 'IHDR') {
      const colorType = buf[at + 8 + 9];
      found.push(`IHDR ${buf.readUInt32BE(at + 8)}×${buf.readUInt32BE(at + 12)} colorType=${colorType}`);
    }
    if (type === 'IEND') break;
    at += 12 + len;
  }
  return found;
}

async function shot(page, name) {
  const file = path.join(out, name);
  const buf = await page.screenshot({ path: file, fullPage: true });
  return PNG.sync.read(buf);
}

async function imageSection(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  try {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const img = page.locator(`img[src="${IMAGE}"]`);
    await img.evaluate((el) => (el.complete ? null : new Promise((r) => el.addEventListener('load', r))));
    const box = await img.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, src: el.currentSrc };
    });
    const png = await shot(page, `home-${width}.png`);
    const page1 = pixel(png, box.x / 2, box.y + box.h / 2);
    const page2 = pixel(png, box.x + box.w + (width - box.x - box.w) / 2, box.y + box.h / 2);
    log(`### ${width} px — картинка ${Math.round(box.w)}×${Math.round(box.h)} CSS px, src ${box.src.replace(base, '')}`);
    log('');
    log(`Фон страницы слева от картинки ${fmt(page1)}, справа ${fmt(page2)}`);
    log('');
    log('| Точка | Фон страницы | Фон картинки | Макс. разница |');
    log('|---|---|---|---|');
    for (const [label, ix, iy] of POINTS) {
      const sx = box.x + ((ix + 0.5) * box.w) / NATURAL.w - 0.5;
      const sy = box.y + ((iy + 0.5) * box.h) / NATURAL.h - 0.5;
      const rgb = pixel(png, sx, sy);
      const diff = maxDiff(rgb, page1);
      if (strict && diff > TOLERANCE) failed += 1;
      log(`| ${label} (${ix}, ${iy}) | ${fmt(page1)} | ${fmt(rgb)} | ${diff} |`);
    }
    log('');
  } finally {
    await page.close();
  }
}

async function served(context) {
  const res = await context.request.get(base + IMAGE);
  const buf = await res.body();
  log(`Файл ${IMAGE}: HTTP ${res.status()}, ${res.headers()['content-type']}, ${buf.length} байт, ` +
    `блоки PNG: ${pngChunks(buf).join(', ')}`);
  log('');
}

async function fieldStyle(page, selector) {
  return page.locator(selector).evaluate((el) => {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      autofill: el.matches(':autofill'),
      bg: c.backgroundColor,
      color: c.color,
      border: c.borderTopColor,
      x: r.right + scrollX - 8,
      y: r.top + scrollY + r.height / 2,
    };
  });
}

async function autofillSection(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 });
  try {
    await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
    const before = await fieldStyle(page, '#enthusiast-email');
    const emptyPng = await shot(page, 'login-390-empty.png');
    const emptyEmail = pixel(emptyPng, before.x, before.y);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('Autofill.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#enthusiast-email' });
    const { node } = await cdp.send('DOM.describeNode', { nodeId });
    await cdp.send('Autofill.trigger', {
      fieldId: node.backendNodeId,
      address: { fields: [{ name: 'EMAIL_ADDRESS', value: 'autofill-check@example.com' }] },
    });
    await page.waitForFunction(() => document.querySelector('#enthusiast-email').matches(':autofill'), null, {
      timeout: 10000,
    });
    await page.waitForTimeout(1000);

    const filled = await fieldStyle(page, '#enthusiast-email');
    const empty = await fieldStyle(page, '#enthusiast-password');
    const png = await shot(page, 'login-390-autofilled.png');
    const filledPx = pixel(png, filled.x, filled.y);
    const emptyPx = pixel(png, empty.x, empty.y);

    log('### Форма входа, 390 px, автозаполнение Chrome');
    log('');
    log('| Поле | :autofill | Пиксель фона | background-color | color | border-color |');
    log('|---|---|---|---|---|---|');
    log(`| email до заполнения | ${before.autofill} | ${fmt(emptyEmail)} | ${before.bg} | ${before.color} | ${before.border} |`);
    log(`| email заполнен браузером | ${filled.autofill} | ${fmt(filledPx)} | ${filled.bg} | ${filled.color} | ${filled.border} |`);
    log(`| пароль пустой | ${empty.autofill} | ${fmt(emptyPx)} | ${empty.bg} | ${empty.color} | ${empty.border} |`);
    log('');
    const same =
      filled.autofill &&
      maxDiff(filledPx, emptyPx) === 0 &&
      maxDiff(filledPx, emptyEmail) === 0 &&
      filled.bg === empty.bg &&
      filled.color === empty.color &&
      filled.border === empty.border;
    log(`Заполненное поле совпадает с пустым: ${same ? 'да' : 'нет'}`);
    if (strict && !same) failed += 1;
  } finally {
    await page.close();
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    log(`## Цвета главной — ${base}`);
    log('');
    const context = await browser.newContext();
    await served(context);
    await context.close();
    await imageSection(browser, 390);
    await imageSection(browser, 1280);
    await autofillSection(browser);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'report.md'), lines.join('\n') + '\n');
  }
  log('');
  log(strict ? `Расхождений: ${failed}` : 'Режим замера без порога (EXPECT не задан).');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
