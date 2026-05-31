const puppeteer = require('puppeteer');
const path = require('path');

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const imgPath = path.join(__dirname, '../public/assets/vfx/vfx_skill_dominate.png');
  const fileUrl = `file://${imgPath}`;

  console.log(`Loading image from: ${fileUrl}`);
  await page.goto(fileUrl);

  const dimensions = await page.evaluate(() => {
    const img = document.querySelector('img');
    return {
      width: img ? img.naturalWidth : null,
      height: img ? img.naturalHeight : null
    };
  });

  console.log('Image Dimensions:', dimensions);
  await browser.close();
}

run().catch(console.error);
