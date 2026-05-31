const puppeteer = require('puppeteer');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fillPresetField(page, labelText, value) {
  await page.evaluate((label, val) => {
    const labels = Array.from(document.querySelectorAll('label'));
    const targetLabel = labels.find(el => el.textContent.trim() === label);
    if (targetLabel) {
      const input = targetLabel.nextElementSibling?.tagName === 'INPUT' 
        ? targetLabel.nextElementSibling 
        : (targetLabel.parentElement?.querySelector('input') || targetLabel.nextElementSibling);
      if (input) {
        const lastValue = input.value;
        input.value = val;
        const tracker = input._valueTracker;
        if (tracker) {
          tracker.setValue(lastValue);
        }
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
      } else {
        console.error(`Input element not found for label: ${label}`);
      }
    } else {
      console.error(`Label element not found for text: ${label}`);
    }
  }, labelText, value);
}

async function selectPresetField(page, labelText, value) {
  await page.evaluate((label, val) => {
    const labels = Array.from(document.querySelectorAll('label'));
    const targetLabel = labels.find(el => el.textContent.trim() === label);
    if (targetLabel) {
      const select = targetLabel.nextElementSibling?.tagName === 'SELECT' 
        ? targetLabel.nextElementSibling 
        : (targetLabel.parentElement?.querySelector('select') || targetLabel.nextElementSibling);
      if (select) {
        const lastValue = select.value;
        select.value = val;
        const tracker = select._valueTracker;
        if (tracker) {
          tracker.setValue(lastValue);
        }
        const event = new Event('change', { bubbles: true });
        select.dispatchEvent(event);
      } else {
        console.error(`Select element not found for label: ${label}`);
      }
    } else {
      console.error(`Label element not found for text: ${label}`);
    }
  }, labelText, value);
}

async function run() {
  console.log('Starting AI Invincible Bug Validation Test...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1000, height: 1000 }
  });
  const page = await browser.newPage();

  const allLogs = [];
  const aiDebugLogs = [];

  page.on('console', msg => {
    const text = msg.text();
    allLogs.push(`[${msg.type()}] ${text}`);
    if (text.includes('[AI Decision]') || text.includes('[AI Reasoning]') || text.includes('[AI DEBUG]') || text.includes('Player Turn End] Board:')) {
      aiDebugLogs.push(text);
      console.log(`[BROWSER LOG] ${text}`);
    }
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

  await sleep(4000);

  // タイトル画面をクリックしてスタート
  console.log('Clicking to start...');
  await page.click('#screen-title');
  await sleep(1500);

  // 遊び方 -> ルール -> タイトル10回クリック
  console.log('Entering debug mode...');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.menu-btn-label')).find(el => el.textContent.includes('遊び方'));
    if (btn) btn.click();
  });
  await sleep(1000);

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.menu-btn-label')).find(el => el.textContent.includes('ルール'));
    if (btn) btn.click();
  });
  await sleep(1000);

  for (let i = 0; i < 10; i++) {
    await page.click('#screen-rules h2');
    await sleep(100);
  }
  await sleep(1500);

  // プリセットの設定
  console.log('Configuring test preset...');
  
  // プレイヤー手札: ghostship (ファントムポートの幽霊船)
  await fillPresetField(page, 'プレイヤー手札', 'ghostship');
  // 敵手札: horseshoecrab (太古のカブトガニ)
  await fillPresetField(page, '敵手札', 'horseshoecrab');
  // プレイヤーの場: empty, empty, empty
  await fillPresetField(page, 'プレイヤーの場', 'empty,empty,empty');
  // 敵の場: empty, empty, empty
  await fillPresetField(page, '敵の場', 'empty,empty,empty');

  // AIレベルを 2 (Normal) に設定
  await selectPresetField(page, 'AI難易度', '2');

  await sleep(500);

  // バトル開始
  console.log('Starting battle...');
  await page.click('#btn-start-debug-battle');
  await sleep(4000);

  // プリセット適用時はマリガン画面がスキップされ、直接対戦が開始されます。
  await sleep(1000);

  // プレイヤーの手札から「幽霊船」を選択して、レーン1（中央）にプレイ
  console.log('Selecting ghostship from hand...');
  await page.click('#player-hand .hand-card');
  await sleep(1000);

  console.log('Playing ghostship to Lane 1 (Center)...');
  await page.click('#player-lanes .cell[data-lane="1"]');
  await sleep(2000);

  // ターン終了
  console.log('Player ends turn...');
  await page.click('#btn-end-turn');

  // AIのターンが実行されるのを待つ
  console.log('Waiting for AI turn and decision logs...');
  await sleep(12000);

  console.log('--- AI Debug Logs Collected ---');
  aiDebugLogs.forEach(log => console.log(`  ${log}`));
  console.log('--------------------------------');

  await browser.close();

  // 検証
  console.log('Validating results...');
  const afterLog = aiDebugLogs.find(log => log.includes('[AI DEBUG] After:'));
  const actualEndLog = aiDebugLogs.find(log => log.includes('[Player Turn End] Board:'));

  if (afterLog && actualEndLog) {
    console.log('\n--- Match Check ---');
    console.log(`Simulation After: ${afterLog}`);
    console.log(`Actual Result:    ${actualEndLog}`);
    
    // プレイヤー側のボード状態を抽出して比較
    // シミュレーション: [AI DEBUG] After:  [Player] EMPTY | EMPTY | EMPTY (HP:20) vs ...
    // 実際: [Player Turn End] Board: [Player] EMPTY | EMPTY | EMPTY vs [AI] ...
    const simPlayerBoard = afterLog.split('[Player]')[1].split('(HP:')[0].trim();
    const actualPlayerBoard = actualEndLog.split('[Player]')[1].split('vs [AI]')[0].trim();

    console.log(`Simulated Board: [${simPlayerBoard}]`);
    console.log(`Actual Board:    [${actualPlayerBoard}]`);

    if (simPlayerBoard === actualPlayerBoard) {
      console.log('\n🎉 SUCCESS: AI Simulation Board and Actual Board MATCH PERFECTLY!');
    } else {
      console.error('\n❌ FAILURE: Mismatch detected between AI simulation and actual board!');
      process.exit(1);
    }
  } else {
    console.error('❌ FAILURE: Required debug logs were not found!');
    process.exit(1);
  }

  console.log('AI Invincible Bug Validation Test finished successfully!');
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
