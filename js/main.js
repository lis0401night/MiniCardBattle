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
        const l = parseInt(cell.getAttribute('data-lane')); if (playerBoard[l] !== null) return;
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
