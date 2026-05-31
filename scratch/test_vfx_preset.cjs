const puppeteer = require('puppeteer');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// インプット要素をクリアして文字をタイプするヘルパー
async function clearAndType(page, selector, text) {
  await page.focus(selector);
  // 全選択 (Control + A)
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  // 削除
  await page.keyboard.press('Backspace');
  // タイプ
  await page.type(selector, text);
}

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 800, height: 900 }
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

  const url = 'http://localhost:5174/';
  console.log(`Navigating to ${url} ...`);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
  } catch (err) {
    console.error('Failed to load page:', err);
    await browser.close();
    process.exit(1);
  }

  // ロード完了待機
  await sleep(4000);

  // タイトル画面をクリックしてスタート
  console.log('Clicking to start game from Title...');
  await page.click('#screen-title');
  await sleep(1500);

  // モード選択画面で「遊び方」ボタンをクリック
  console.log('Clicking "遊び方" button...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.menu-btn-label')).find(el => el.textContent.includes('遊び方'));
    if (btn) btn.click();
    else throw new Error('遊び方 button not found');
  });
  await sleep(1000);

  // 遊び方画面で「ルール」ボタンをクリック
  console.log('Clicking "ルール" button...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.menu-btn-label')).find(el => el.textContent.includes('ルール'));
    if (btn) btn.click();
    else throw new Error('ルール button not found');
  });
  await sleep(1000);

  // ルール画面のタイトル（h2）を10回クリックしてデバッグバトルを起動
  console.log('Clicking Rules Title 10 times to activate easter egg...');
  for (let i = 0; i < 10; i++) {
    await page.click('#screen-rules h2');
    await sleep(100);
  }
  await sleep(1500);

  // プリセットの設定
  console.log('Setting up battle preset...');
  
  // プレイヤー手札: snake (有毒), yukionna (凍結), sniper (狙撃), spider (拘束), falcon (拡散)
  console.log('Typing player hand...');
  await clearAndType(page, '#input-player-hand', 'snake,yukionna,sniper,spider,falcon');

  // 敵の場: golem, golem, golem
  console.log('Typing enemy board...');
  await clearAndType(page, '#input-enemy-board', 'golem,golem,golem');

  // プレイヤーSPを99にしてスキルがいつでも発動可能に
  console.log('Typing player SP...');
  await clearAndType(page, '#input-player-sp', '99');

  await sleep(500);

  // バトル開始ボタンをクリック
  console.log('Starting battle...');
  await page.click('#btn-start-debug-battle');
  await sleep(4000);

  // バトル画面がロードされたかスクリーンショットを撮って確認
  const battleLoadedPath = path.join(__dirname, 'battle_loaded.png');
  await page.screenshot({ path: battleLoadedPath });
  console.log(`Saved battle loaded screenshot to: ${battleLoadedPath}`);

  // 各種VFXをトリガーし、その瞬間のスクリーンショットを撮影する
  const vfxs = [
    { type: 'anm_skill_toxic', name: 'toxic', desc: '有毒VFX (対象: プレイヤー側レーン0、中央寄せ確認)' },
    { type: 'anm_skill_freeze', name: 'freeze', desc: '凍結VFX (対象: プレイヤー側レーン1、中央寄せ確認)' },
    { type: 'anm_skill_bind', name: 'bind_self_to_enemy', desc: '拘束VFX 自分発動 (対象: 敵側レーン2、下から上への反転・中央寄せ確認)', side: 'blue', lane: 2 },
    { type: 'anm_skill_bind', name: 'bind_enemy_to_self', desc: '拘束VFX 相手発動 (対象: 自分側レーン2、上から下への正方向・中央寄せ確認)', side: 'red', lane: 2 },
    { type: 'anm_skill_snipe', name: 'snipe_self_to_enemy', desc: '狙撃VFX 自分発動 (対象: 敵側レーン1、下から上への反転・中央寄せ確認)', side: 'blue', lane: 1 },
    { type: 'anm_skill_snipe', name: 'snipe_enemy_to_self', desc: '狙撃VFX 相手発動 (対象: 自分側レーン1、上から下への正方向・中央寄せ確認)', side: 'red', lane: 1 },
  ];

  for (const vfx of vfxs) {
    console.log(`Triggering VFX: ${vfx.desc} ...`);
    
    // VFXのトリガー
    await page.evaluate((type, side, lane) => {
      if (window.triggerVfx) {
        window.triggerVfx(type, side || 'blue', lane !== undefined ? lane : 0);
      } else {
        console.error('window.triggerVfx is not defined!');
      }
    }, vfx.type, vfx.side, vfx.lane);

    // アニメーションの中盤（爆発・効果発生時）にスクリーンショットを撮るため、少しだけ待つ
    await sleep(350);

    const vfxScreenshotPath = path.join(__dirname, `vfx_${vfx.name}.png`);
    await page.screenshot({ path: vfxScreenshotPath });
    console.log(`Saved screenshot for ${vfx.name} to: ${vfxScreenshotPath}`);

    // 再生完了まで待つ
    await sleep(1000);
  }

  console.log('--- Browser Logs ---');
  allLogs.forEach(log => console.log(log));
  console.log('--------------------');

  if (consoleErrors.length > 0) {
    console.error('Console errors detected:', consoleErrors);
  }

  await browser.close();
  console.log('Test completed successfully!');
}

run().catch(err => {
  console.error('Unexpected error during test execution:', err);
  process.exit(1);
});
