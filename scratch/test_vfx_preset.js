const puppeteer = require('puppeteer');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  // モード選択画面にデバッグボタンがあるか確認してクリック
  console.log('Navigating to Debug Battle Screen...');
  await page.evaluate(() => {
    if (window.switchScreen) {
      window.switchScreen('screen-debug-battle');
    } else {
      throw new Error('window.switchScreen is not defined!');
    }
  });
  await sleep(1500);

  // プリセットの設定
  console.log('Setting up battle preset...');
  await page.evaluate(() => {
    // プレイヤー手札: snake (有毒), yukionna (凍結), sniper (狙撃), spider (拘束), falcon (拡散)
    // 敵の場: golem, golem, golem
    const handInput = document.querySelector('input[placeholder*="beginner_magic,golem"]'); // プレイヤー手札
    const enemyBoardInput = document.querySelector('input[placeholder*="dragon"]'); // 敵の場
    
    // 他の入力欄も特定できるように調整
    const inputs = document.querySelectorAll('input');
    let handEl = null;
    let boardEl = null;
    let spEl = null;
    let hpEl = null;

    inputs.forEach(input => {
      const placeholder = input.placeholder || '';
      const value = input.value || '';
      
      // 手札のプレースホルダー
      if (placeholder.includes('beginner_magic,golem')) {
        handEl = input;
      }
      // 敵の場のプレースホルダー
      if (placeholder.includes('dragon')) {
        boardEl = input;
      }
    });

    // プレイヤー手札の設定
    if (handEl) {
      handEl.value = 'snake,yukionna,sniper,spider,falcon';
      handEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // 敵の場の設定 (golem,golem,golem)
    if (boardEl) {
      boardEl.value = 'golem,golem,golem';
      boardEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // バトル開始ボタンをクリック
  console.log('Starting battle...');
  await page.click('button[style*="linear-gradient(135deg, #6366f1, #8b5cf6)"]');
  await sleep(4000);

  // バトル画面がロードされたかスクリーンショットを撮って確認
  const battleLoadedPath = path.join(__dirname, 'battle_loaded.png');
  await page.screenshot({ path: battleLoadedPath });
  console.log(`Saved battle loaded screenshot to: ${battleLoadedPath}`);

  // 各種VFXをトリガーし、その瞬間のスクリーンショットを撮影する
  const vfxs = [
    { type: 'anm_skill_toxic', name: 'toxic', desc: '有毒VFX (対象: プレイヤー側レーン0、中央寄せ確認)' },
    { type: 'anm_skill_freeze', name: 'freeze', desc: '凍結VFX (対象: プレイヤー側レーン1、中央寄せ確認)' },
    { type: 'anm_skill_bind', name: 'bind', desc: '拘束VFX (対象: プレイヤー側レーン2、中央寄せ確認)' },
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
    // 各アニメーションの再生時間(duration)は約1000ms〜1200ms。200ms〜400ms待つと丁度良いコマになる。
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
