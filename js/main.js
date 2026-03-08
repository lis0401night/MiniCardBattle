// ==========================================
// イベントリスナーのセットアップと初期化
// ==========================================

// 1. UIコンポーネントの構築と挿入
const appContainer = document.getElementById('app-container');
if (appContainer) {
    appContainer.innerHTML = Object.values(UI_COMPONENTS).join('\n');
}

// 2. 盤面のセルクリックイベントのバインド
document.querySelectorAll('#player-lanes .cell').forEach(cell => {
    cell.onclick = async () => {
        if (typeof isProcessing === 'undefined') return;
        if (isProcessing || selectedCardIndex === null) return;
        const l = parseInt(cell.getAttribute('data-lane'));

        // 既にカードがあるレーンの場合は確認モーダルを表示
        if (playerBoard[l] !== null) {
            const existingCard = playerBoard[l];
            const newCard = playerHand[selectedCardIndex];
            const confirmed = await new Promise(resolve => {
                showConfirmModal(
                    `「${existingCard.name}」を破棄して「${newCard.name}」を配置しますか？`,
                    () => resolve(true),
                    () => resolve(false)
                );
            });
            if (!confirmed) return;
            // 既存カードを破棄
            playerBoard[l] = null;
            renderBoard();
        }

        isProcessing = true; document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight'));
        await playCard('blue', selectedCardIndex, l); if (checkWinCondition()) return;
        selectedCardIndex = null; updateCardDetail(null); await sleep(500); endTurnLogic('blue');
    };
});

// 3. 初期タイトル画面の表示を強制
setTimeout(() => {
    if (typeof switchScreen === 'function') {
        switchScreen('screen-title');
    }
}, 100);
