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
      // labelの隣にあるか、親要素内にある最初のinputを探す
      const input = targetLabel.nextElementSibling?.tagName === 'INPUT' 
        ? targetLabel.nextElementSibling 
        : (targetLabel.parentElement?.querySelector('input') || targetLabel.nextElementSibling);
      if (input) {
        const lastValue = input.value;
        input.value = val;
        // Reactの_valueTrackerを更新して変更を確実に通知する
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
        // Reactの_valueTrackerを更新して変更を確実に通知する
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
  console.log('Starting AI Clone Bug Validation Test...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

  const url = 'http://localhost:5173/';
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
  
  // プレイヤー手札: siren (幻惑の歌姫)
  await fillPresetField(page, 'プレイヤー手札', 'siren');
  // 敵手札: parasite (招かれざる来訪者)
  await fillPresetField(page, '敵手札', 'parasite');
  // プレイヤーの場: empty, empty, siren
  await fillPresetField(page, 'プレイヤーの場', 'empty,empty,siren');
  // 敵の場: jellyfish, ghostship, empty
  await fillPresetField(page, '敵の場', 'jellyfish,ghostship,empty');

  // AIレベルを 2 (Normal) に設定
  await selectPresetField(page, 'AI難易度', '2');

  await sleep(500);

  // バトル開始
  console.log('Starting battle...');
  await page.click('#btn-start-debug-battle');
  await sleep(4000);

  // マリガンの「選択終了」をクリックして対戦開始
  console.log('Finishing Mulligan (selecting hand)...');
  await page.waitForSelector('#btn-end-turn', { timeout: 10000 });
  await page.click('#btn-end-turn');
  await sleep(3000);

  // プレイヤーのターンなので、単にターン終了（パス）する
  console.log('Player passes turn...');
  await page.waitForSelector('#btn-end-turn', { timeout: 10000 });
  await page.click('#btn-end-turn');

  // AIのターンが実行されるのを待つ (AI思考 + プレイ処理アニメーション等で長めに待機)
  console.log('Waiting for AI turn and decision logs...');
  await sleep(8000);

  console.log('--- All Browser Logs ---');
  allLogs.forEach(log => console.log(log));
  console.log('------------------------');

  console.log('--- AI Debug Logs Collected ---');
  aiDebugLogs.forEach(log => console.log(`  ${log}`));
  console.log('--------------------------------');

  // スクリーンショット撮影
  const resultScreenshotPath = path.join(__dirname, 'test_clone_bug_result.png');
  await page.screenshot({ path: resultScreenshotPath });
  console.log(`Saved result screenshot to: ${resultScreenshotPath}`);

  await browser.close();

  // 検証
  console.log('Validating results...');
  const afterLog = aiDebugLogs.find(log => log.includes('[AI DEBUG] After:'));
  const actualEndLog = aiDebugLogs.find(log => log.includes('[Player Turn End] Board:'));

  if (afterLog && actualEndLog) {
    console.log('\n--- Match Check ---');
    console.log(`Simulation After: ${afterLog}`);
    console.log(`Actual Result:    ${actualEndLog}`);
    
    // シミュレーション内の盤面状態と実際の盤面状態を照合
    // シミュレーション: vs [AI] 発光するクラゲ(5) | 分身(5) | EMPTY (HP:19) みたいな形式
    // 実際: vs [AI] 発光するクラゲ(5) | 分身(5) | EMPTY
    // 分身の二重配置バグが直っていれば、両者ともレーン2は「EMPTY」で、分身はレーン1に「分身(5)」1体のみとなるはず！
    const simAiBoard = afterLog.split('vs [AI]')[1].split('(HP:')[0].trim();
    const actualAiBoard = actualEndLog.split('vs [AI]')[1].trim();

    console.log(`Simulated Board: [${simAiBoard}]`);
    console.log(`Actual Board:    [${actualAiBoard}]`);

    if (simAiBoard === actualAiBoard) {
      console.log('\n🎉 SUCCESS: AI Simulation Board and Actual Board MATCH PERFECTLY!');
    } else {
      console.error('\n❌ FAILURE: Mismatch detected between AI simulation and actual board!');
      process.exit(1);
    }
  } else {
    console.error('❌ FAILURE: Required debug logs were not found!');
    process.exit(1);
  }

  console.log('AI Clone Bug Validation Test finished successfully!');
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
