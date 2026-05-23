const puppeteer = require('puppeteer');
const path = require('path');

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const consoleErrors = [];
  const allLogs = [];

  page.on('console', msg => {
    allLogs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.toString());
  });

  console.log('Navigating to http://localhost:5174/ ...');
  try {
    await page.goto('http://localhost:5174/', { waitUntil: 'networkidle2', timeout: 10000 });
  } catch (err) {
    console.error('Failed to load page:', err);
    await browser.close();
    process.exit(1);
  }

  // しばらく待つ
  await new Promise(resolve => setTimeout(resolve, 3000));

  // スクリーンショット保存
  const screenshotPath = path.join(__dirname, 'app_loaded_screenshot.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to: ${screenshotPath}`);

  console.log('--- Browser Logs ---');
  allLogs.forEach(log => console.log(log));
  console.log('--------------------');

  if (consoleErrors.length > 0) {
    console.error('FAIL: Console errors detected:', consoleErrors);
    await browser.close();
    process.exit(1);
  }

  // タイトル等を確認
  const title = await page.title();
  console.log('Page Title:', title);

  console.log('SUCCESS: Application loaded without any console errors!');
  await browser.close();
  process.exit(0);
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
