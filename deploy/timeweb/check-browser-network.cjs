const { chromium } = require(process.argv[2]);
const fs = require('node:fs');
(async () => {
  const origin = process.argv[3];
  const expectedApi = process.argv[4];
  const output = process.argv[5];
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH});
  const requests = new Set();
  const localhost = new Set();
  const errors = [];
  const pages = [];
  let sdkVerificationUrl;
  const context = await browser.newContext();
  context.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return;
    // Do not log query strings, fragments, headers, tokens or request bodies.
    const safeUrl = `${url.protocol}//${url.host}${url.pathname}`;
    requests.add(safeUrl);
    if (/^(localhost|.*\.localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) localhost.add(safeUrl);
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const path of ['/', '/auth/login', '/auth/reset-password', '/dashboard/cafe', '/dashboard/roaster']) {
      const response = await page.goto(origin + path, {waitUntil: 'networkidle', timeout: 60000});
      if (response.status() !== 200) throw Error(`${path}: ${response.status()}`);
      pages.push({path, finalPath: new URL(page.url()).pathname, status: response.status()});
    }
    // Exercise the real compiled browser SDK. Intercept the invalid recovery
    // request so this probe cannot change any account or database state.
    await page.route('**/auth/v1/verify', async route => {
      sdkVerificationUrl = route.request().url();
      await route.fulfill({status: 403, contentType: 'application/json', body: JSON.stringify({code: 'otp_expired', msg: 'Network probe: invalid recovery token'})});
    });
    await page.goto(origin + '/auth/reset-password#token_hash=codex-network-probe-invalid', {waitUntil: 'networkidle', timeout: 60000});
    if (sdkVerificationUrl !== expectedApi + '/auth/v1/verify') throw Error('Compiled SDK API URL mismatch: ' + sdkVerificationUrl);
    if (localhost.size || errors.length) throw Error(JSON.stringify({localhost: [...localhost], errors}));
    const result = {origin, expectedApi, pages, requests: [...requests].sort(), localhostRequests: [...localhost], pageErrors: errors, compiledSdkUrl: sdkVerificationUrl, recoveryProbeIntercepted: true};
    fs.mkdirSync(require('node:path').dirname(output), {recursive: true});
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(error => {console.error(error.message); process.exitCode = 1;});
