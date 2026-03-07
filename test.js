const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('LOG:', msg.text()));
    page.on('pageerror', err => console.log('ERROR:', err.message));
    await page.goto('file:///E:/project/MiniCardBattle/index.html', { waitUntil: 'load' });

    // DOMの状態確認
    const html = await page.content();
    console.log('DOM LENGTH:', html.length);

    const containerStr = await page.evaluate(() => {
        const c = document.getElementById('app-container');
        return c ? c.innerHTML.substring(0, 200) : 'NULL';
    });
    console.log('Container innerHTML snippet:', containerStr);

    const displayStyle = await page.evaluate(() => {
        const el = document.getElementById('screen-title');
        return el ? window.getComputedStyle(el).display : 'Not Found';
    });
    console.log('screen-title display:', displayStyle);

    await browser.close();
})();
