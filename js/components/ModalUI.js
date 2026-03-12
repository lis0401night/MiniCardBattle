// ==========================================
// Modal UI Components (Overlays & Dialogs)
// ==========================================

Object.assign(UI_COMPONENTS, {
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
    `
});
