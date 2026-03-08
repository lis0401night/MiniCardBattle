// ==========================================
function renderSkillTag(card) {
    if (!card || card.skill === 'none') return '';
    const s = SKILLS[card.skill];
    if (!s) return '';
    const skillName = s.name || card.name || '';
    const value = card.skillValue || '';
    return `<div class="card-skill">${s.icon} ${skillName}${value}</div>`;
}

/**
 * Mini Card Battle - UI Components & Templates
 */
// ==========================================

const UI_COMPONENTS = {
    titleScreen: `
    <!-- 1. タイトル画面 -->
    <div id="screen-title" class="screen active" onclick="goToModeSelect()">
        <img src="assets/title_img.jpg" alt="Key Visual" class="title-visual"
            onerror="this.style.display='none'; document.querySelector('.game-title').style.display='block';">
        <h1 class="game-title">LANE<br>DEFENDERS</h1>
        <div class="start-text">TAP TO START</div>
    </div>
    `,

    modeSelectScreen: `
    <!-- モード選択画面 -->
    <div id="screen-mode-select" class="screen">
        <h1 class="game-title" style="display:block; margin-bottom: 40px;">LANE<br>DEFENDERS</h1>
        <button class="btn" style="width: 250px; margin-bottom: 20px; background: linear-gradient(45deg, #ef4444, #b91c1c);" onclick="startGameMode('story')">STORY</button>
        <button class="btn" style="width: 250px; margin-bottom: 20px; background: linear-gradient(45deg, #3b82f6, #1d4ed8);" onclick="startGameMode('free')">FREE BATTLE</button>
        <button class="btn" style="width: 250px; background: #475569;" onclick="showRules()">遊び方</button>
    </div>
    `,

    rulesScreen: `
    <!-- 2. ルール説明画面 -->
    <div id="screen-rules" class="screen">
        <h2>遊び方</h2>
        <div class="rule-box">
            <ul>
                <li><b>【デッキ編成】デッキに同じカードは5枚まで入れられます。</b></li>
                <li>毎ターン、手札から1枚を空きレーンに<b>配置</b>します。</li>
                <li><b>自分のターン開始時</b>に、場のカードが一斉に正面へ<b>攻撃</b>します。</li>
                <li>正面に敵がいれば激突！空いていれば<b>相手リーダーに直接ダメージ！</b></li>
                <li><b>【リーダー能力】</b>毎ターン「SP」が溜まります。必要なSPが溜まると、「リーダースキル」ボタンから強力な必殺技を発動できます！（発動してもカードの配置は可能です）</li>
                <li>先に相手リーダーのHPを0にすれば勝利です。</li>
            </ul>
        </div>
        <button class="btn" onclick="switchScreen('screen-mode-select')">戻る</button>
    </div>
    `,

    characterSelectScreen: `
    <!-- 3. キャラクター選択画面 -->
    <div id="screen-select" class="screen">
        <h2 id="select-title">キャラクター選択</h2>
        <div class="char-grid" id="char-grid"></div>
        <button class="btn" style="margin-top: 30px; background: #475569;" onclick="goBackFromSelect()">戻る</button>
    </div>
    `,

    characterDetailScreen: `
    <!-- 3.5 キャラクター詳細確認画面 -->
    <div id="screen-char-detail" class="screen" style="background: rgba(0,0,0,0.85); z-index: 50;">
        <div style="background: var(--panel-bg); border: 2px solid #facc15; border-radius: 12px; padding: 20px; width: 90%; max-width: 350px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 0 30px rgba(0,0,0,0.8);">
            <img id="detail-char-img" src="" style="width: 160px; height: 200px; object-fit: cover; border-radius: 8px; border: 2px solid #334155; margin-bottom: 15px;">
            <h2 id="detail-char-name" style="margin-bottom: 5px; color: #facc15; font-size: 1.3rem; text-align: center;">Name</h2>
            <p id="detail-char-desc" style="font-size: 0.9rem; color: #cbd5e1; text-align: center; margin-bottom: 15px; line-height: 1.4;">Description</p>
            <div style="background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; width: 100%; box-sizing: border-box; margin-bottom: 20px; border: 1px solid #475569;">
                <div style="color: #facc15; font-weight: bold; font-size: 0.8rem; margin-bottom: 5px;">【リーダー能力】</div>
                <div id="detail-leader-name" style="font-weight: bold; margin-bottom: 3px; color: #fff;">Skill Name</div>
                <div id="detail-leader-desc" style="font-size: 0.8rem; color: #94a3b8; line-height: 1.3;">Skill Desc</div>
            </div>
            <div style="display: flex; gap: 10px; width: 100%;">
                <button class="btn" style="flex: 1; background: #475569; margin-top: 0;" onclick="closeCharDetail()">戻る</button>
                <button class="btn" style="flex: 1; background: linear-gradient(45deg, #3b82f6, #1d4ed8); margin-top: 0;" onclick="confirmCharSelect()">決定</button>
            </div>
        </div>
    </div>
    `,

    difficultySelectScreen: `
    <!-- 難易度選択画面 (フリーモード用) -->
    <div id="screen-difficulty" class="screen">
        <h2>AI難易度</h2>
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <button class="btn" style="background: #22c55e; width: 200px;" onclick="startFreeBattle(1)">EASY</button>
            <button class="btn" style="background: #eab308; width: 200px;" onclick="startFreeBattle(2)">NORMAL</button>
            <button class="btn" style="background: #ef4444; width: 200px;" onclick="startFreeBattle(3)">HARD</button>
        </div>
        <button class="btn" style="margin-top: 30px; background: #475569;" onclick="goBackFromDifficulty()">戻る</button>
    </div>
    `,

    stageSelectScreen: `
    <!-- ステージ(背景)選択画面 (フリーモード用) -->
    <div id="screen-stage-select" class="screen">
        <h2>ステージ選択</h2>
        <div class="char-grid" id="stage-grid"></div>
        <button class="btn" style="margin-top: 30px; background: #475569;" onclick="goBackFromStage()">戻る</button>
    </div>
    `,

    deckEditScreen: `
    <!-- デッキ編集画面 -->
    <div id="screen-deck-edit" class="screen">
        <h2 style="color: #facc15; margin-bottom: 5px; font-size: 1.2rem;">デッキ構築</h2>
        <div id="deck-count-display" style="font-size: 0.9rem; margin-bottom: 10px;">カード枚数: 0 / 30</div>
        <div class="deck-edit-container">
            <!-- 上段: 現在のデッキ -->
            <div class="deck-section">
                <div class="deck-section-title">現在のデッキ（タップで削除）</div>
                <div id="deck-current-list" class="deck-list-horizontal"></div>
            </div>
            <!-- 下段: カードマスター -->
            <div class="deck-section">
                <div class="deck-section-title">所持カード（タップで追加）</div>
                <div id="deck-master-list" class="deck-list-horizontal"></div>
            </div>
            <div class="deck-controls">
                <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 10px;">
                    <button class="action-btn" onclick="exportDeckXML()" style="font-size: 0.75rem; padding: 5px 10px;">保存(XML)</button>
                    <label class="action-btn" style="font-size: 0.75rem; padding: 5px 10px; cursor: pointer; display: flex; align-items: center;">
                        読込(XML)
                        <input type="file" id="import-xml-input" style="display:none;" accept=".xml" onchange="importDeckXML(event)">
                    </label>
                </div>
                <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 10px;">
                    <button class="action-btn" onclick="resetDeck()" style="background: #1e40af; font-size: 0.75rem; padding: 5px 10px;">初期デッキに戻す</button>
                    <button class="action-btn" onclick="clearDeck()" style="background: #7f1d1d; font-size: 0.75rem; padding: 5px 10px;">全削除</button>
                </div>
            </div>
            <button id="btn-finish-deck" class="btn" onclick="finishDeckEdit()" style="margin-top: 10px; width: 100%; opacity: 0.5;">バトル開始！</button>
        </div>
    </div>
    `,

    loadingScreen: `
    <!-- 4. ローディング画面 -->
    <div id="screen-loading" class="screen">
        <div class="loader"></div>
        <div id="loading-text">Generating Cards... 0%</div>
        <p style="color:#94a3b8; font-size:0.8rem; margin-top:10px; text-align: center;">デッキを構築しています</p>
    </div>
    `,

    dialogueScreen: `
    <!-- 5. 会話シーン画面 -->
    <div id="screen-dialogue" class="screen">
        <div class="portrait-container">
            <img id="portrait-left" class="char-portrait" src="" alt="Player">
            <img id="portrait-right" class="char-portrait" src="" alt="Enemy">
        </div>
        <div class="dialogue-box" onclick="showNextDialogue()">
            <div id="speaker-name">Name</div>
            <div id="dialogue-text">Dialogue text goes here...</div>
        </div>
        <div id="fade-overlay" class="fade-overlay"></div>
    </div>
    `,

    continueScreen: `
    <!-- コンティニュー画面 -->
    <div id="screen-continue" class="screen">
        <h1 style="color: #ef4444; font-size: 3rem; text-shadow: 0 0 10px #ef4444; margin-bottom: 0;">CONTINUE?</h1>
        <div class="continue-img-container">
            <img id="continue-img" class="continue-img" src="">
            <div id="continue-count">9</div>
        </div>
        <div id="continue-buttons" style="display: flex; gap: 20px;">
            <button class="btn" onclick="executeContinue()" style="background: linear-gradient(45deg, #22c55e, #16a34a); padding: 15px 40px; font-size: 1.5rem;">YES</button>
            <button class="btn" onclick="executeGameOver()" style="background: linear-gradient(45deg, #64748b, #475569); padding: 15px 40px; font-size: 1.5rem;">NO</button>
        </div>
    </div>
    `,

    cutinScreen: `
    <!-- スキルカットイン演出 -->
    <div id="screen-cutin">
        <div id="cutin-bg" class="cutin-bg"></div>
        <img id="cutin-char-img" src="" class="cutin-char">
        <div id="cutin-text" class="cutin-text-img">SKILL<br>ACTIVATED!</div>
    </div>
    `,

    skillConfirmScreen: `
    <!-- リーダースキル発動確認モーダル（敵味方兼用） -->
    <div id="screen-skill-confirm" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:60; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
        <div class="skill-modal-box">
            <h2 id="skill-confirm-name" style="color: #facc15; margin-bottom: 10px;">Skill Name</h2>
            <p id="skill-confirm-desc" style="color: #cbd5e1; font-size: 0.9rem; text-align: center; margin-bottom: 15px; line-height: 1.4;">Description</p>
            <div id="skill-confirm-status" style="margin: 10px 0 20px 0; font-weight: bold; font-size: 1.1rem;"></div>
            <div style="display: flex; gap: 10px; width: 100%;">
                <button class="btn" style="flex: 1; background: #475569; margin-top: 0;" onclick="closeSkillConfirm()">閉じる</button>
                <button id="btn-execute-skill" class="btn" style="flex: 1; background: linear-gradient(45deg, #ef4444, #b91c1c); margin-top: 0;" onclick="executeSkillFromConfirm()">使用する</button>
            </div>
        </div>
    </div>
    `,

    battleScreen: `
    <!-- 6. バトル画面 -->
    <div id="screen-battle" class="screen">
        <button class="btn-home" onclick="returnToTitle()">🏠 リタイア</button>
        <!-- 敵ステータス -->
        <div class="hp-area">
            <div class="status-container">
                <div class="icon-wrapper" id="enemy-icon-wrap">
                    <img id="enemy-icon" class="char-icon red" src="">
                    <div id="enemy-sp-orbs" class="sp-orbs"></div>
                </div>
                <div id="enemy-speech" class="speech-bubble">くっ…！</div>
                <div class="player-status">
                    <div class="status-name" id="enemy-name" style="color:var(--color-red)">Enemy</div>
                    <div class="hp-bar-bg">
                        <div class="hp-bar-fill red" id="enemy-hp-fill" style="width: 100%;"></div>
                        <div class="hp-text" id="enemy-hp-text">20 / 20</div>
                    </div>
                </div>
                <!-- 敵スキル確認ボタン -->
                <button class="enemy-skill-btn" onclick="showEnemySkillConfirm()">敵スキル<br>確認</button>
            </div>
        </div>
        <div id="turn-status">ラウンド 1</div>
        <!-- 盤面 (3レーン) -->
        <div class="battle-board">
            <div class="lane-row" id="enemy-lanes">
                <div class="cell" data-lane="0"></div>
                <div class="cell" data-lane="1"></div>
                <div class="cell" data-lane="2"></div>
            </div>
            <div class="lane-row" id="player-lanes">
                <div class="cell" data-lane="0"></div>
                <div class="cell" data-lane="1"></div>
                <div class="cell" data-lane="2"></div>
            </div>
        </div>
        <!-- 自分ステータス -->
        <div class="hp-area">
            <div class="status-container">
                <div class="icon-wrapper" id="player-icon-wrap">
                    <img id="player-icon" class="char-icon blue" src="">
                    <div id="player-sp-orbs" class="sp-orbs"></div>
                </div>
                <div id="player-speech" class="speech-bubble">痛い！</div>
                <div class="player-status">
                    <div class="status-name" id="player-name" style="color:var(--color-blue)">Player</div>
                    <div class="hp-bar-bg">
                        <div class="hp-bar-fill blue" id="player-hp-fill" style="width: 100%;"></div>
                        <div class="hp-text" id="player-hp-text">20 / 20</div>
                    </div>
                </div>
            </div>
        </div>
        <!-- アクションコントロール -->
        <div class="controls">
            <div id="deck-info">山札: 30 / 墓地: 0</div>
            <div style="display: flex; gap: 8px;">
                <button id="btn-leader-skill" class="action-btn leader-skill-btn" onclick="showSkillConfirm()">リーダースキル</button>
                <button class="action-btn" onclick="endPlayerTurn()">終了(待機)</button>
            </div>
        </div>
        <!-- カード効果表示エリア -->
        <div class="card-detail-wrapper">
            <div id="card-detail-view" class="card-detail-box">カードを選択するとここに能力が表示されます</div>
        </div>
        <!-- 手札 -->
        <div id="player-hand" class="hand-area"></div>
    </div>
    `,

    endingScreen: `
    <!-- 7. エンディングイラスト表示画面 -->
    <div id="screen-ending-illust" class="screen" style="background-color: #000; padding: 0;" onclick="finishEnding()">
        <img id="ending-illust-img" src="" style="width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 2s;">
        <div id="ending-text" style="position: absolute; bottom: 10%; font-size: 2.2rem; font-weight: bold; color: #fff; text-shadow: 0 0 20px #facc15, 2px 2px 0 #000; font-style: italic; opacity: 0; transition: opacity 2s; text-align: center; width: 100%; word-wrap: break-word;">
            CONGRATULATIONS!</div>
    </div>
    `,

    resultScreen: `
    <!-- 8. クリア / ゲームオーバー画面 -->
    <div id="screen-result" class="screen">
        <h1 id="result-title" style="font-size: 3rem;">GAME CLEAR!</h1>
        <p id="result-desc">すべてのライバルを撃破しました！</p>
        <button class="btn" onclick="location.reload()">タイトルへ戻る</button>
    </div>
    `,

    cardPreviewModal: `
    <!-- カードプレビューモーダル（長押しで表示） -->
    <div id="card-preview-modal" class="modal-overlay" onclick="closeCardPreview()">
        <div class="preview-content" onclick="event.stopPropagation()">
            <div id="preview-card-container"></div>
            <div class="preview-details">
                <h2 id="preview-card-name">Card Name</h2>
                <div id="preview-card-skill-label" class="preview-skill-badge">Skill</div>
                <p id="preview-card-desc">Description</p>
                <button class="btn" style="margin-top: 15px; width: 100%;" onclick="closeCardPreview()">閉じる</button>
            </div>
        </div>
    </div>
    `,

    confirmModal: `
    <!-- 汎用確認・警告モーダル -->
    <div id="modal-confirm" class="modal-overlay">
        <div class="modal-content confirm-modal-content">
            <h3 id="confirm-modal-title">確認</h3>
            <p id="confirm-modal-message">メッセージがここに入ります</p>
            <div class="confirm-modal-buttons">
                <button id="confirm-modal-cancel" class="btn btn-secondary">キャンセル</button>
                <button id="confirm-modal-ok" class="btn">OK</button>
            </div>
        </div>
    </div>
    `
};
