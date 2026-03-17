// ==========================================
// Modal UI Components (Overlays & Dialogs)
// ==========================================

Object.assign(UI_COMPONENTS, {
    cardPreviewModal: `
    <!-- カードプレビューモーダル（長押しで表示） -->
    <div id="card-preview-modal" class="modal-overlay" onclick="closeCardPreview()" style="z-index: 2100;">
        <div class="preview-content" onclick="event.stopPropagation()">
            <div id="preview-card-container"></div>
            <div class="preview-details">
                <h2 id="preview-card-name">Card Name</h2>
                <div class="preview-scroll-area">
                    <div id="preview-skills-list" class="preview-skills-list"></div>
                <p id="preview-card-flavor" class="preview-flavor-text"></p>
                </div> <!-- .preview-scroll-area -->
                <button id="preview-premium-toggle" class="btn" style="display:none; margin-top: 10px; width: 100%; flex-shrink: 0; background: linear-gradient(45deg, #d946ef, #9333ea); font-size: 0.9rem; padding: 10px 5px;">✨ プレミアムイラスト</button>
                <button class="btn" style="margin-top: 15px; width: 100%; flex-shrink: 0;" onclick="closeCardPreview()">閉じる</button>
            </div> <!-- .preview-details -->
        </div> <!-- .preview-content -->
    </div> <!-- #card-preview-modal -->
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

    rulesModal: `
    <!-- 遊び方モーダル（戦闘中用） -->
    <div id="modal-rules" class="rules-modal-overlay" onclick="closeRulesModal()">
        <div class="skill-modal-box modal-pop-animation" style="width: 90%; max-width: 400px; padding: 25px;" onclick="event.stopPropagation()">
            <h2 style="color: #facc15; margin-bottom: 20px;">遊び方</h2>
            <div class="rule-box" style="max-height: 350px;">
                <div class="rule-section">
                    <div class="rule-category">【デッキ編成】</div>
                    <ul>
                        <li>デッキに同じカードは4枚まで入れられます。</li>
                    </ul>
                </div>
                <div class="rule-section">
                    <div class="rule-category">【バトル】</div>
                    <ul>
                        <li>毎ターン、手札から1枚を自分のレーンに召喚します。<span style="color:#94a3b8">（先攻1ターン目は中央のみ）</span></li>
                        <li>置き直しの場合、下のカードは破棄されます。</li>
                        <li><b>ターン開始時</b>に、場のカードが一斉に正面へ<b>攻撃</b>します。</li>
                        <li>正面に敵がいれば戦闘となり、お互いにパワー分ダメージを与えます。</li>
                        <li>正面が空いていれば敵リーダーに直接ダメージ！</li>
                        <li>相手リーダーのHPを0にすれば勝利です。</li>
                    </ul>
                </div>
                <div class="rule-section">
                    <div class="rule-category">【リーダー能力】</div>
                    <ul>
                        <li>毎ターン「SP」が溜まります。<span style="color:#94a3b8">（先攻1ターン目は溜まりません）</span></li>
                        <li>SPがMAXで「リーダースキル」を発動可能！</li>
                    </ul>
                </div>
            </div>
            <button class="btn" style="margin-top: 20px; width: 100%;" onclick="closeRulesModal()">閉じる</button>
        </div>
    </div>
    `,

    errorModal: `
    <!-- 致命的エラーモーダル -->
    <div id="modal-error" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:9999; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;">
        <div class="skill-modal-box modal-pop-animation" style="border-color: #ef4444; max-width: 400px;">
            <h2 style="color: #ef4444; margin-bottom: 15px;">エラーが発生しました</h2>
            <p id="error-modal-message" style="color: #cbd5e1; font-size: 0.9rem; text-align: left; margin-bottom: 25px; line-height: 1.6; width: 100%; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
                予期しないエラーが発生しました。
            </p>
            <p style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 20px; text-align: center;">
                ブラウザのキャッシュにより問題が継続する場合があります。<br>下のボタンから最新状態で再読み込みしてください。
            </p>
            <button class="btn" style="width: 100%; background: linear-gradient(135deg, #3b82f6, #8b5cf6);" onclick="reloadGame()">更新してタイトルへ</button>
        </div>
    </div>
    `,
    enemyDeckModal: `
    <!-- 敵デッキ確認モーダル -->
    <div id="modal-enemy-deck" class="modal-overlay" onclick="closeEnemyDeckModal()">
        <div class="skill-modal-box modal-pop-animation" style="width: 95%; max-width: 440px; padding: 20px;" onclick="event.stopPropagation()">
            <h2 id="enemy-deck-title" style="color: #facc15; margin-bottom: 15px;">敵デッキ確認</h2>
            <div class="card-list-container">
                <div id="enemy-deck-grid" class="card-list-grid-3col" style="padding: 10px;"></div>
            </div>
            <button class="btn" style="margin-top: 20px; width: 100%;" onclick="closeEnemyDeckModal()">閉じる</button>
        </div>
    </div>
    `
});
