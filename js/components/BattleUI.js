// ==========================================
// Battle UI Components (Battle, Reward, Ending, etc.)
// ==========================================

Object.assign(UI_COMPONENTS, {
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

    rewardScreen: `
    <!-- 10. カード獲得画面 -->
    <div id="screen-reward" class="screen">
        <div class="preview-content" id="reward-preview-content" style="position:relative;">
            <div id="reward-card-container"></div>
            <div class="preview-details">
                <h2 id="reward-card-name">? ? ?</h2>
                <div class="preview-scroll-area">
                    <div id="reward-skills-list" class="preview-skills-list"></div>
                    <p id="reward-card-flavor" class="preview-flavor-text"></p>
                    <button id="reward-premium-toggle" class="btn" style="display:none; margin-top: 10px; width: 100%; flex-shrink: 0; background: linear-gradient(45deg, #d946ef, #9333ea); font-size: 0.9rem; padding: 10px 5px;">✨ プレミアムイラスト</button>
                </div>
                <button id="btn-reward-next" class="btn" style="display:none; margin-top: 15px; width: 100%; flex-shrink: 0; background: linear-gradient(45deg, #22c55e, #16a34a);" onclick="event.stopPropagation(); closeRewardScreen()">次へ</button>
            </div>
            <!-- 目隠し用レイヤー -->
            <div id="reward-mask" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.95); border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:20; backdrop-filter: blur(4px); cursor:pointer;" onclick="revealRewardCard()">
                <h2 class="reward-title" style="margin-bottom: 20px; color: #facc15; text-shadow: 0 0 10px rgba(250, 204, 21, 0.5);">カードを獲得！</h2>
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

    skillChoiceScreen: `
    <!-- スキル選択モーダル -->
    <div id="screen-skill-choice" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:100; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
        <div class="skill-modal-box modal-pop-animation">
            <h2 style="color: #facc15; margin-bottom: 20px; text-align: center;">スキルを選択</h2>
            <div id="skill-choice-container" style="display: flex; flex-direction: column; gap: 15px; width: 100%;">
                <!-- ここに選択肢が動的に挿入されます -->
            </div>
        </div>
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
    `
});
