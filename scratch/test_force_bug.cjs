const puppeteer = require('puppeteer');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Puppeteerのネイティブ操作で確実に値を入力するヘルパー
async function typePresetField(page, labelText, value) {
  console.log(`Typing "${value}" into field "${labelText}"...`);
  const inputHandle = await page.evaluateHandle((label) => {
    const labels = Array.from(document.querySelectorAll('label'));
    const targetLabel = labels.find(el => el.textContent.trim() === label);
    if (targetLabel) {
      return targetLabel.nextElementSibling?.tagName === 'INPUT' 
        ? targetLabel.nextElementSibling 
        : (targetLabel.parentElement?.querySelector('input') || targetLabel.nextElementSibling);
    }
    return null;
  }, labelText);

  const inputEl = inputHandle.asElement();
  if (inputEl) {
    await inputEl.focus();
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(value);
    await sleep(300);
  } else {
    console.error(`Field for label "${labelText}" not found!`);
  }
}

// Puppeteerのネイティブ操作で確実にセレクトボックスを選択するヘルパー
async function selectPresetField(page, labelText, value) {
  console.log(`Selecting "${value}" for field "${labelText}"...`);
  const selectHandle = await page.evaluateHandle((label) => {
    const labels = Array.from(document.querySelectorAll('label'));
    const targetLabel = labels.find(el => el.textContent.trim() === label);
    if (targetLabel) {
      return targetLabel.nextElementSibling?.tagName === 'SELECT' 
        ? targetLabel.nextElementSibling 
        : (targetLabel.parentElement?.querySelector('select') || targetLabel.nextElementSibling);
    }
    return null;
  }, labelText);

  const selectEl = selectHandle.asElement();
  if (selectEl) {
    await selectEl.select(value);
    await sleep(300);
  } else {
    console.error(`Select field for label "${labelText}" not found!`);
  }
}

async function run() {
  console.log('Starting Sphinx Force Skill Validation Test (State Verification)...');
  const allLogs = [];
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1000, height: 1000 }
    });
    const page = await browser.newPage();

    page.on('console', msg => {
      const text = msg.text();
      allLogs.push(`[${msg.type()}] ${text}`);
      console.log(`[BROWSER LOG] ${text}`);
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
    
    // プレイヤー手札: siren
    await typePresetField(page, 'プレイヤー手札', 'siren');
    // 敵手札: sphinx (難題の問い手)
    await typePresetField(page, '敵手札', 'sphinx');
    // 敵SP: 99
    await typePresetField(page, '敵SP', '99');
    // プレイヤーの場: empty, empty, empty
    await typePresetField(page, 'プレイヤーの場', 'empty,empty,empty');
    // 敵の場: empty, empty, empty
    await typePresetField(page, '敵の場', 'empty,empty,empty');

    // AIレベルを 1 (Easy) に設定して強制プレイさせる
    await selectPresetField(page, 'AI難易度', '1');
    // 先攻: プレイヤー (blue)
    await selectPresetField(page, '先攻', 'blue');

    await sleep(500);

    // バトル開始
    console.log('Starting battle...');
    await page.click('#btn-start-debug-battle');
    await sleep(4000);

    // プレイヤーのターンなので、ターン終了（パス）する
    console.log('Player passes turn...');
    await page.waitForSelector('#btn-end-turn', { timeout: 10000 });
    await page.click('#btn-end-turn');
    await sleep(1000);

    // ターン終了確認モーダルの「OK」ボタンをクリック
    console.log('Confirming turn end...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.skill-modal-box .btn'));
      const okBtn = btns.find(btn => btn.textContent.trim() === 'OK');
      if (okBtn) {
        okBtn.click();
      } else {
        throw new Error('Confirm Modal OK button not found!');
      }
    });
    await sleep(3000);

    // AIのターンが実行され、スフィンクスが中央レーンに出された後、選択モーダルが出るのを待つ
    console.log('Waiting for Skill Choice modal...');
    await page.waitForSelector('.preview-skill-item', { timeout: 15000 });
    await sleep(2000); // アニメーションが完全に静止するのを待つ

    // 「分身」を選択する
    console.log('Selecting "分身" choice...');
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.preview-skill-item'));
      const cloneItem = items.find(el => el.textContent.includes('分身'));
      if (cloneItem) {
        cloneItem.click();
      } else {
        throw new Error('"分身" choice option not found in modal!');
      }
    });
    await sleep(1000);

    // 決定ボタンをクリック
    console.log('Clicking Confirm (決定)...');
    await page.click('.btn.ok-button');
    await sleep(3000); // モーダルがフェードアウトし、盤面のハイライトが描画されるのを待つ

    // 分身の配置先レーンとして、プレイヤー側のレーン0（左）を選択する
    console.log('Selecting clone placement lane (Lane 0)...');
    await page.waitForSelector('#player-lanes .cell[data-lane="0"]', { timeout: 10000 });
    await page.click('#player-lanes .cell[data-lane="0"]');

    // 対戦が進行しAIターン終了までのログ待機
    console.log('Waiting for AI turn to end...');
    await sleep(10000);

    // 実際の盤面状態を window.GameState から直接取得する
    console.log('Retrieving actual board state from GameState...');
    const boardState = await page.evaluate(() => {
      const dump = (b) => b.map(c => c ? `${c.name}(${c.currentPower !== undefined ? c.currentPower : c.power})` : 'EMPTY').join(' | ');
      return {
        playerBoard: dump(window.GameState.playerBoard),
        enemyBoard: dump(window.GameState.enemyBoard),
        playerBoardRaw: window.GameState.playerBoard
      };
    });

    console.log('Actual Player Board (from State):', boardState.playerBoard);
    console.log('Actual Enemy Board (from State):', boardState.enemyBoard);

    // スクリーンショット撮影
    const resultScreenshotPath = path.join(__dirname, 'test_force_bug_result.png');
    await page.screenshot({ path: resultScreenshotPath });
    console.log(`Saved result screenshot to: ${resultScreenshotPath}`);

    await browser.close();

    // 検証
    console.log('Validating results...');
    console.log('\n--- Result Check ---');
    console.log(`Actual Result (State): [Player] ${boardState.playerBoard} vs [AI] ${boardState.enemyBoard}`);
    
    // スフィンクスの「命令（force）」スキルで相手が分身（clone）を選んだため、
    // 実際の盤面（State）のプレイヤー側レーン0には「分身」のトークンが存在しているはず。
    const cloneCard = boardState.playerBoardRaw[0];
    if (cloneCard && (cloneCard.id === 'token_clone' || cloneCard.baseId === 'token_clone')) {
      console.log('分身トークンがプレイヤー側レーン0に正常に配置されていることを確認しました。');
      console.log('\n🎉 SUCCESS: AI Force Skill Validation Test passed successfully!');
    } else {
      console.error('\n❌ FAILURE: Clone token was NOT found on player board lane 0!');
      console.error('Actual Player Board Data:', JSON.stringify(boardState.playerBoardRaw, null, 2));
      process.exit(1);
    }

    console.log('Sphinx Force Skill Validation Test finished successfully!');
  } catch (err) {
    console.log('--- All Browser Logs on Error ---');
    allLogs.forEach(log => console.log(log));
    console.log('---------------------------------');
    throw err;
  }
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
