import React, { useState, useEffect } from 'react';
import { playSound, stopAllBGM } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { 
    showOnlineRules, 
    showOnlineSearch, 
    showOnlineLobby,
    goToModeSelect,
    closePlayerNameModal
} from '../hooks/uiMainCore.js';
import { createRoom } from '../hooks/multiplayer.js';
import { showAlertModal } from '../hooks/uiModals.js';

export default function OnlineMenuScreen() {
    const [isMatching, setIsMatching] = useState(false);

    // マウント時BGM処理はuiMainCore.js側で管理するため削除

    const handleCreateRoomClick = () => {
        playSound?.(SOUNDS.seClick);
        if (window.showPlayerNameModalState) {
            window.showPlayerNameModalState(async (name) => {
                if (!name.trim()) {
                    showAlertModal?.("プレイヤー名を入力してください！");
                    return;
                }
                closePlayerNameModal?.();
                localStorage.setItem('mini_card_battle_player_name', name);
                setIsMatching(true);
                try {
                    await createRoom(name);
                    setIsMatching(false);
                    showOnlineLobby?.();
                } catch (e) {
                    console.error(e);
                    setIsMatching(false);
                    const msg = e?.message || '';
                    if (e?.code === 'PERMISSION_DENIED' || msg.includes('Permission denied')) {
                        showAlertModal?.("【通信エラー】サーバーの接続上限（または無料枠）に達しているため、現在オンライン機能が利用できません。");
                    } else {
                        showAlertModal?.("ルーム作成に失敗しました。");
                    }
                }
            });
        }
    };

    return (
        <div id="screen-online-menu" className="screen active">
            <h2 style={{ color: '#38bdf8', marginBottom: '30px', textShadow: '0 0 10px rgba(56, 189, 248, 0.5)' }}>オンライン対戦</h2>
            
            {isMatching ? (
                <div style={{ textAlign: 'center', margin: '40px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
                    <h3 style={{ color: '#fff' }}>ルームを作成しています...</h3>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '250px' }}>
                    <button className="btn btn-yellow" onClick={() => showOnlineRules?.()}>ルール</button>
                    <button 
                        className="btn" 
                        style={{ background: 'linear-gradient(45deg, #0284c7, #0369a1)' }} 
                        onClick={handleCreateRoomClick}
                    >
                        ルーム作成
                    </button>
                    <button 
                        className="btn" 
                        style={{ background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)' }} 
                        onClick={() => showOnlineSearch?.()}
                    >
                        ルーム検索
                    </button>
                </div>
            )}

            <button 
                className="btn" 
                style={{ marginTop: '40px', background: '#475569' }} 
                onClick={() => goToModeSelect?.()}
                disabled={isMatching}
            >
                戻る
            </button>
        </div>
    );
}
