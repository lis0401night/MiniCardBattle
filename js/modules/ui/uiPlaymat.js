/**
 * Mini Card Battle - Playmat UI Logic
 */

function showPlaymatModal() {
    playSound(SOUNDS.seClick);
    const modal = document.getElementById('modal-playmat-selection');
    if (modal) {
        renderPlaymatList();
        modal.style.display = 'flex';
    }
}

function closePlaymatModal() {
    playSound(SOUNDS.seClick);
    const modal = document.getElementById('modal-playmat-selection');
    if (modal) {
        modal.style.display = 'none';
        // セーブ
        saveDeck();
    }
}

function renderPlaymatList() {
    const container = document.getElementById('playmat-list-container');
    if (!container) return;
    container.innerHTML = '';

    // "未選択"（なし）を最初に追加
    const noneItem = document.createElement('div');
    const isNoneSelected = (selectedPlaymatId === null || selectedPlaymatId === 'null' || selectedPlaymatId === '');
    
    noneItem.style.cssText = `
        padding: 12px;
        background: ${isNoneSelected ? 'rgba(242, 201, 76, 0.2)' : 'rgba(0, 0, 0, 0.3)'};
        border: 2px solid ${isNoneSelected ? '#facc15' : '#475569'};
        border-radius: 8px;
        color: #fff;
        cursor: pointer;
        text-align: center;
        font-weight: bold;
        transition: all 0.2s;
    `;
    noneItem.innerText = '未選択';
    noneItem.onclick = () => selectPlaymat(null);
    container.appendChild(noneItem);

    // 所持しているプレイマットをID順にソートして表示
    const available = PLAYMAT_MASTER
        .filter(p => ownedPlaymats.includes(p.id))
        .sort((a, b) => a.id.localeCompare(b.id));

    available.forEach(p => {
        const item = document.createElement('div');
        const isSelected = selectedPlaymatId === p.id;
        
        item.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px;
            background: ${isSelected ? 'rgba(242, 201, 76, 0.2)' : 'rgba(0, 0, 0, 0.3)'};
            border: 2px solid ${isSelected ? '#facc15' : '#475569'};
            border-radius: 8px;
            color: #fff;
            cursor: pointer;
            transition: all 0.2s;
        `;
        
        item.innerHTML = `
            <div style="width: 80px; height: 40px; border-radius: 4px; overflow: hidden; border: 1px solid #475569; flex-shrink: 0;">
                <img src="${p.image}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            <div style="flex: 1; font-weight: bold; font-size: 0.9rem;">${p.name}</div>
        `;
        
        item.onclick = () => selectPlaymat(p.id);
        container.appendChild(item);
    });

    if (available.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'color: #94a3b8; font-size: 0.8rem; text-align: center; margin-top: 20px;';
        emptyMsg.innerText = '解放済みのプレイマットがありません。\n実績を達成して入手しましょう！';
        container.appendChild(emptyMsg);
    }
}

function selectPlaymat(id) {
    playSound(SOUNDS.seClick);
    selectedPlaymatId = id;
    renderPlaymatList();
}
