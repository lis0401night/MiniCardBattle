// ==========================================
function renderSkillTag(card, isBoard = false) {
    if (!card) return '';
    let skillCandidates = [];

    // 1. 表示対象のスキルを全てリストアップ
    const addCandidate = (id, val) => {
        const s = SKILLS[id];
        if (s && id !== 'none' && s.name !== '通常') {
            const showBadge = !isBoard || !card.skillTriggered || !ACTIVE_SKILLS.includes(id);
            if (showBadge) {
                skillCandidates.push({ id, name: s.name, icon: s.icon, value: val || '' });
            }
        }
    };

    if (card.skill) addCandidate(card.skill, card.skillValue);
    if (Array.isArray(card.skills)) {
        card.skills.forEach(sk => addCandidate(sk.id, sk.value));
    }

    // 2. IDと値が一致するものを集計
    let grouped = [];
    skillCandidates.forEach(c => {
        const existing = grouped.find(g => g.id === c.id && g.value === c.value);
        if (existing) {
            existing.count++;
        } else {
            grouped.push({ ...c, count: 1 });
        }
    });

    // 3. バッジの生成
    let badges = [];
    grouped.forEach(g => {
        const countSuffix = g.count > 1 ? ` * ${g.count}` : '';
        badges.push(`<div class="card-skill">${g.icon} ${g.name}${g.value}${countSuffix}</div>`);
    });

    // 拘束（スタン）状態による「防御」バッジ（集約対象外）
    if (card.stunTurns > 0) {
        const def = SKILLS['defender'];
        badges.push(`<div class="card-skill" style="border-color: #ef4444; color: #fca5a5;">${def.icon} 防御${card.stunTurns}</div>`);
    }

    if (badges.length === 0) return '';
    return `<div class="card-skill-container">${badges.join('')}</div>`;
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
        <button class="btn-circle btn-gear" onclick="showOptions()">⚙</button>
        <h1 class="game-title" style="display:block; margin-bottom: 40px;">LANE<br>DEFENDERS</h1>
        <button class="btn btn-yellow" style="width: 250px; margin-bottom: 20px;" onclick="showRules()">遊び方</button>
        <button class="btn" style="width: 250px; margin-bottom: 20px; background: linear-gradient(45deg, #ef4444, #b91c1c);" onclick="startGameMode('story')">ストーリー</button>
        <button class="btn" style="width: 250px; margin-bottom: 20px; background: linear-gradient(45deg, #3b82f6, #1d4ed8);" onclick="startGameMode('free')">フリーバトル</button>
        <button class="btn" style="width: 250px; margin-bottom: 20px; background: linear-gradient(45deg, #8b5cf6, #6d28d9);" onclick="showGallery()">ギャラリー</button>
    </div>
    `,

    galleryMenuScreen: `
    <!-- ギャラリーメニュー画面 -->
    <div id="screen-gallery-menu" class="screen">
        <h2 style="color: #facc15; margin-bottom: 40px;">ギャラリー</h2>
        <button class="btn" style="width: 250px; margin-bottom: 20px; background: linear-gradient(45deg, #10b981, #059669);" onclick="showCardList()">カード一覧</button>
        <div style="margin-top: 20px; border-top: 1px solid #334155; width: 250px; padding-top: 20px;">
            <button class="btn" style="width: 250px; background: #475569;" onclick="switchScreen('screen-mode-select')">戻る</button>
        </div>
    </div>
    `,

    cardListScreen: `
    <!-- カード一覧画面 -->
    <div id="screen-card-list" class="screen">
        <h2 style="color: #facc15; margin-bottom: 5px; font-size: 1.2rem;">カード一覧</h2>
        <div id="card-list-count" style="font-size: 0.9rem; margin-bottom: 10px; color: #cbd5e1;">カード枚数: 0 / 0</div>
        
        <div class="card-list-container">
            <div id="gallery-card-grid" class="card-list-grid-3col"></div>
        </div>

        <button class="btn" style="margin-top: 15px; width: 100%; background: #475569;" onclick="switchScreen('screen-gallery-menu')">戻る</button>
    </div>
    `,

    rulesScreen: `
    <!-- 2. ルール説明画面 -->
    <div id="screen-rules" class="screen">
        <h2 onclick="debugUnlockCards()">遊び方</h2>
        <div class="rule-box">
            <ul>
                <li><b>【デッキ編成】デッキに同じカードは4枚まで入れられます。</b></li>
                <li>毎ターン、手札から1枚を自分のレーンに<b>配置</b>します。（置き直しの場合、下のカードは破棄されます）</li>
                <li><b>自分のターン開始時</b>に、場のカードが一斉に正面へ<b>攻撃</b>します。</li>
                <li>正面に敵がいれば戦闘となり、お互いのパワーが引かれます。</li>
                <li>正面が空いていれば<b>相手リーダーに直接ダメージ！</b></li>
                <li><b>【リーダー能力】</b>毎ターン「SP」が溜まります。SPがMAXになると、カードの配置前に「リーダースキル」ボタンから必殺技を発動できます！</li>
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
        <div class="select-scroll-area">
            <div class="char-grid" id="char-grid"></div>
        </div>
        <button class="btn" style="margin-top: 20px; background: #475569;" onclick="goBackFromSelect()">戻る</button>
    </div>
    `,

    characterDetailScreen: `
    <!-- 3.5 キャラクター詳細確認画面 -->
    <div id="screen-char-detail" class="screen" style="background: rgba(0,0,0,0.85); z-index: 50;">
        <div style="background: var(--panel-bg); border: 2px solid #facc15; border-radius: 12px; padding: 20px; width: 90%; max-width: 350px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 0 30px rgba(0,0,0,0.8);">
            <img id="detail-char-img" src="" style="width: 160px; height: 200px; object-fit: cover; border-radius: 8px; border: 2px solid #334155; margin-bottom: 15px;">
            <h2 id="detail-char-name" style="margin-bottom: 5px; color: #facc15; font-size: 1.3rem; text-align: center;">Name</h2>
            <div id="detail-char-ease" style="color: #fbd38d; font-size: 0.95rem; margin-bottom: 5px; text-shadow: 1px 1px 2px #000;">使いやすさ: ★★★</div>
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
    <!-- 難易度選択画面 -->
    <div id="screen-difficulty" class="screen">
        <h2 style="font-weight: 900;">難易度</h2>
        <div style="display: flex; flex-direction: column; gap: 15px;">
            <button class="btn" style="background: #22c55e; width: 200px;" onclick="confirmDifficulty(1)">イージー</button>
            <button class="btn" style="background: #eab308; width: 200px;" onclick="confirmDifficulty(2)">ノーマル</button>
            <button class="btn" style="background: #ef4444; width: 200px;" onclick="confirmDifficulty(3)">ハード</button>
        </div>
        <button class="btn" style="margin-top: 30px; background: #475569;" onclick="goBackFromDifficulty()">戻る</button>
    </div>
    `,

    stageSelectScreen: `
    <!-- ステージ(背景)選択画面 (フリーモード用) -->
    <div id="screen-stage-select" class="screen">
        <h2>ステージ選択</h2>
        <div class="select-scroll-area">
            <div class="char-grid" id="stage-grid"></div>
        </div>
        <button class="btn" style="margin-top: 20px; background: #475569;" onclick="goBackFromStage()">戻る</button>
    </div>
    `,

    optionsScreen: `
    <!-- オプション画面 -->
    <div id="screen-options" class="screen">
        <h2 style="color: #facc15; margin-bottom: 30px;">オプション</h2>
        
        <div style="width: 280px; background: rgba(0,0,0,0.4); padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 30px;">
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 10px; color: #cbd5e1; font-size: 0.9rem;">音量調整</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.2rem;">🔈</span>
                    <input type="range" id="volume-slider" min="0" max="1" step="0.05" value="0.5" 
                        style="flex-grow: 1; cursor: pointer;" oninput="updateVolume(this.value)">
                    <span style="font-size: 1.2rem;">🔊</span>
                </div>
            </div>
            
            <div style="border-top: 1px solid #334155; padding-top: 20px;">
                <label style="display: block; margin-bottom: 10px; color: #cbd5e1; font-size: 0.9rem;">データ管理</label>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn" style="background: #475569; width: 100%; margin-top: 0; font-size: 0.9rem;" onclick="showSyncDataModal()">データ連携</button>
                    <button class="btn" style="background: #7f1d1d; width: 100%; margin-top: 0; font-size: 0.9rem;" onclick="resetGameData()">データ削除</button>
                </div>
                <p style="color: #64748b; font-size: 0.7rem; margin-top: 8px; text-align: center;">※デッキと所持カードが初期化されます</p>
            </div>

            <div style="border-top: 1px solid #334155; padding-top: 20px; margin-top: 20px;">
                <label style="display: block; margin-bottom: 10px; color: #cbd5e1; font-size: 0.9rem;">更新</label>
                <button class="btn" style="background: linear-gradient(45deg, #3b82f6, #1d4ed8); width: 100%; margin-top: 0; font-size: 0.9rem;" onclick="reloadGame()">更新してタイトルへ</button>
            </div>
        </div>

        <button class="btn" style="background: #475569;" onclick="switchScreen('screen-mode-select')">戻る</button>
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

    rewardScreen: `
    <!-- 10. カード獲得画面 -->
    <div id="screen-reward" class="screen">
        <h2 class="reward-title">カードを獲得！</h2>
        <div class="preview-content" id="reward-preview-content" style="position:relative; cursor:pointer;" onclick="revealRewardCard()">
            <div id="reward-card-container"></div>
            <div class="preview-details">
                <h2 id="reward-card-name">? ? ?</h2>
                <div class="preview-scroll-area">
                    <div id="reward-skills-list" class="preview-skills-list"></div>
                    <p id="reward-card-flavor" class="preview-flavor-text"></p>
                </div>
                <button id="btn-reward-next" class="btn" style="display:none; margin-top: 15px; width: 100%; flex-shrink: 0; background: linear-gradient(45deg, #22c55e, #16a34a);" onclick="event.stopPropagation(); closeRewardScreen()">次へ</button>
            </div>
            <!-- 目隠し用レイヤー -->
            <div id="reward-mask" style="position:absolute; top:0; left:0; width:100%; height:100%; background:#0f172a; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:20;">
                <div style="font-size:5rem; color:#334155;">?</div>
                <div style="font-size:1rem; color:#cbd5e1; margin-top:15px; animation: pulse 1.5s infinite;">タップして表を開く</div>
            </div>
        </div>
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
        <div class="skill-modal-box modal-pop-animation">
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
        <button class="btn-circle btn-battle-help" onclick="showRulesModal()">？</button>
        <button class="btn-circle btn-battle-retire" onclick="returnToTitle()">🏳</button>
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
                    <div id="enemy-deck-info" class="deck-info">Deck: 30 / Drop: 0</div>
                </div>
            </div>
        </div>
        <div class="turn-area">
            <div id="turn-status">ラウンド 1</div>
            <button class="action-btn enemy-skill-btn" onclick="showEnemySkillConfirm()">敵スキル</button>
        </div>
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
                    <div id="deck-info" class="deck-info">Deck: 30 / Drop: 0</div>
                </div>
            </div>
        </div>
        <!-- カード効果表示エリア -->
        <div class="card-detail-wrapper">
            <div id="card-detail-view" class="card-detail-box"></div>
        </div>
        <!-- アクションコントロール -->
        <div class="controls">
            <div style="display: flex; gap: 8px;">
                <button id="btn-leader-skill" class="action-btn leader-skill-btn" onclick="showSkillConfirm()">リーダースキル</button>
                <button id="btn-end-turn" class="action-btn" onclick="endPlayerTurn()">ターン終了</button>
            </div>
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
                <div class="preview-scroll-area">
                    <div id="preview-skills-list" class="preview-skills-list"></div>
                    <p id="preview-card-flavor" class="preview-flavor-text"></p>
                </div>
                <button class="btn" style="margin-top: 15px; width: 100%; flex-shrink: 0;" onclick="closeCardPreview()">閉じる</button>
            </div>
        </div>
    </div>
    `,

    confirmModal: `
    <!-- 汎用確認・警告モーダル（スキル確認と同じデザイン） -->
    <div id="modal-confirm" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:200; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
        <div class="skill-modal-box modal-pop-animation">
            <h2 id="confirm-modal-title" style="color: #facc15; margin-bottom: 10px;">確認</h2>
            <p id="confirm-modal-message" style="color: #cbd5e1; font-size: 0.9rem; text-align: center; margin-bottom: 15px; line-height: 1.6; white-space: pre-line;">メッセージがここに入ります</p>
            <div class="confirm-modal-buttons" style="display: flex; gap: 10px; width: 100%;">
                <button id="confirm-modal-cancel" class="btn" style="flex: 1; background: #475569; margin-top: 0;">キャンセル</button>
                <button id="confirm-modal-ok" class="btn" style="flex: 1; background: linear-gradient(45deg, #0ea5e9, #0284c7); margin-top: 0;">OK</button>
            </div>
        </div>
    </div>
    `,

    syncDataModal: `
    <!-- データ連携モーダル -->
    <div id="screen-sync-data" class="screen" style="background: rgba(0,0,0,0.85); z-index: 70;">
        <div style="background: var(--panel-bg); border: 2px solid #94a3b8; border-radius: 12px; padding: 30px; width: 90%; max-width: 350px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 0 30px rgba(0,0,0,0.8);">
            <h2 style="color: #f8fafc; margin-bottom: 20px;">データ連携</h2>
            <div style="display: flex; flex-direction: column; gap: 15px; width: 100%;">
                <button class="btn" style="background: linear-gradient(45deg, #0ea5e9, #2563eb); margin-top: 0;" onclick="backupDataToXML()">バックアップ</button>
                <button class="btn" style="background: linear-gradient(45deg, #10b981, #059669); margin-top: 0;" onclick="importDataFromXML()">データ取込</button>
                <button class="btn" style="background: #475569; margin-top: 5px;" onclick="closeSyncDataModal()">戻る</button>
            </div>
            <p style="color: #94a3b8; font-size: 0.75rem; margin-top: 20px; text-align: center; line-height: 1.4;">
                バックアップしたXMLファイルを保存するか、保存したファイルからデータを復元できます。
            </p>
        </div>
    </div>
    `,

    rulesModal: `
    <!-- 遊び方モーダル（戦闘中用） -->
    <div id="modal-rules" class="rules-modal-overlay" onclick="closeRulesModal()">
        <div class="skill-modal-box modal-pop-animation" style="width: 90%; max-width: 400px; padding: 25px;" onclick="event.stopPropagation()">
            <h2 style="color: #facc15; margin-bottom: 20px;">遊び方</h2>
            <div class="rule-box" style="background: rgba(0,0,0,0.5); border: 1px solid #334155; padding: 15px; border-radius: 8px; max-height: 300px; overflow-y: auto; text-align: left;">
                <ul style="padding-left: 20px; color: #cbd5e1; font-size: 0.9rem; line-height: 1.6;">
                    <li><b>【デッキ編成】</b>デッキには同じカードは4枚まで入れられます。</li>
                    <li>毎ターン、手札から1枚を自分のレーンに<b>配置</b>します。（置き直しの場合、下のカードは破棄されます）</li>
                    <li><b>自分のターン開始時</b>に、場のカードが一斉に正面へ<b>攻撃</b>します。</li>
                    <li>正面に敵がいれば戦闘となり、お互いのパワーが引かれます。</li>
                    <li>正面が空いていれば<b>相手リーダーに直接ダメージ！</b></li>
                    <li><b>【リーダー能力】</b>毎ターン「SP」が溜まります。SPがMAXになると、カードの配置前に「リーダースキル」ボタンから必殺技を発動できます！</li>
                    <li>先に相手リーダーのHPを0にすれば勝利です。</li>
                </ul>
            </div>
            <button class="btn" style="margin-top: 20px; width: 100%;" onclick="closeRulesModal()">閉じる</button>
        </div>
    </div>
    `
};
