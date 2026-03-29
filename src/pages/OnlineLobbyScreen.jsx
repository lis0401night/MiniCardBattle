import React, { useState, useEffect, useRef } from 'react';
import { playSound, switchScreen } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
    multiplayerCallbacks,
    leaveRoom,
    getIsHost,
    updatePlayerReady,
    sendChatMessage,
    cachedRoomData
} from '../hooks/multiplayer.js';
import { showAlertModal } from '../hooks/uiModals.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { GameState } from '../hooks/gameState.js';
import { prepareBattle } from '../hooks/battle.js';
import { showOnlineMenu } from '../hooks/uiMainCore.js';

export default function OnlineLobbyScreen() {
    const [roomData, setRoomData] = useState(cachedRoomData || null);
    const [localReadyConfig, setLocalReadyConfig] = useState(null);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);

    // Initial config extraction
    useEffect(() => {
        window.reloadOnlineLobbyConfig = () => {
            const storedName = localStorage.getItem('mini_card_battle_player_name') || 'Player';
            const settingsJson = localStorage.getItem('mini_card_battle_online_last_settings');
            let selLeaderId = 'android';
            let selStage = 'plain';
            if (settingsJson) {
                try {
                    const parsed = JSON.parse(settingsJson);
                    if (parsed.leaderId) selLeaderId = parsed.leaderId;
                    if (parsed.stage) selStage = parsed.stage;
                } catch (e) { }
            }
            const chara = CHARACTERS[selLeaderId] || CHARACTERS.android;

            const deckKey = `mini_card_battle_deck_${selLeaderId}`;
            const deckSaved = localStorage.getItem(deckKey);
            let deckArray = [];
            if (deckSaved) {
                try { deckArray = JSON.parse(deckSaved); } catch (e) { }
            }

            const unPremium = JSON.parse(localStorage.getItem('mini_card_battle_unlocked_premium')) || [];
            const deckCards = deckArray.map(item => {
                const cardId = typeof item === 'object' ? item.id : item;
                const isPremium = unPremium.includes(cardId);
                const template = CARD_MASTER.find(c => c.id === cardId);
                return template ? { ...template, isPremium } : null;
            }).filter(Boolean);

            const skinsDict = JSON.parse(localStorage.getItem('mini_card_battle_player_skins')) || {};
            const selSkin = skinsDict[selLeaderId] || null;

            const playmatKey = `mini_card_battle_playmat_${selLeaderId}`;
            const selPlaymat = localStorage.getItem(playmatKey) || null;

            setLocalReadyConfig({
                name: storedName,
                leaderConfig: chara,
                deck: deckCards,
                playmat: selPlaymat,
                skin: selSkin,
                stage: selStage
            });
        };

        window.reloadOnlineLobbyConfig();

        multiplayerCallbacks.onRoomUpdated = (data) => {
            setRoomData(data);

            // 両方がReadyならバトル開始
            if (data && data.host?.isReady && data.client?.isReady) {
                setTimeout(() => {
                    const isHost = getIsHost();
                    const meData = isHost ? data.host : data.client;
                    const opData = isHost ? data.client : data.host;

                    const bSeed = data.battleSeed || Date.now();
                    GameState.battleSeed = bSeed; // 最新のシードをGameStateに記録
                    const hostStage = data.host.leaderConfig?.stage || 'plain';
                    const clientStage = data.client.leaderConfig?.stage || 'plain';
                    GameState.selectedStageId = (bSeed % 2 === 0) ? hostStage : clientStage;

                    GameState.playerConfig = { ...meData.leaderConfig.leaderConfig, deck: meData.leaderConfig.deck };
                    GameState.enemyConfig = { ...opData.leaderConfig.leaderConfig, deck: opData.leaderConfig.deck };

                    GameState.playerConfig.playmat = meData.leaderConfig.playmat || null;
                    GameState.enemyConfig.playmat = opData.leaderConfig.playmat || null;
                    GameState.selectedPlaymatId = meData.leaderConfig.playmat || null;

                    if (!GameState.playerSkins) GameState.playerSkins = {};
                    if (!GameState.enemySkins) GameState.enemySkins = {};

                    if (meData.leaderConfig.skin) {
                        GameState.playerSkins[GameState.playerConfig.id] = meData.leaderConfig.skin;
                    }
                    if (opData.leaderConfig.skin) {
                        GameState.enemySkins[GameState.enemyConfig.id] = opData.leaderConfig.skin;
                    }

                    GameState.playerConfig.image = getSkinImage(GameState.playerConfig, meData.leaderConfig.skin || 'default', 'image');
                    GameState.playerConfig.imageLose = getSkinImage(GameState.playerConfig, meData.leaderConfig.skin || 'default', 'imageLose');
                    GameState.playerConfig.icon = getSkinImage(GameState.playerConfig, meData.leaderConfig.skin || 'default', 'icon');

                    GameState.enemyConfig.image = getSkinImage(GameState.enemyConfig, opData.leaderConfig.skin || 'default', 'image');
                    GameState.enemyConfig.imageLose = getSkinImage(GameState.enemyConfig, opData.leaderConfig.skin || 'default', 'imageLose');
                    GameState.enemyConfig.icon = getSkinImage(GameState.enemyConfig, opData.leaderConfig.skin || 'default', 'icon');

                    if (!GameState.enemySkins) GameState.enemySkins = {};
                    GameState.enemySkins[GameState.enemyConfig.id] = opData.leaderConfig.skin || 'default';

                    GameState.gameMode = 'online';
                    GameState.appState = 'battle';

                    window.dispatchEvent(new Event('startOnlineBattle'));
                    if (typeof prepareBattle === 'function') prepareBattle();
                }, 1000);
            }
        };

        multiplayerCallbacks.onRoomClosed = () => {
            setRoomData(null);
            showAlertModal("ルームが解散されました。", () => {
                showOnlineMenu?.();
            });
        };

        return () => {
            multiplayerCallbacks.onRoomUpdated = null;
            multiplayerCallbacks.onRoomClosed = null;
        };
    }, []);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [roomData?.chat]);

    const handleLeaveRoom = async () => {
        playSound(SOUNDS.seClick);
        await leaveRoom();
        setRoomData(null);
        showOnlineMenu?.();
    };

    const handleDeckEdit = () => {
        playSound(SOUNDS.seClick);
        GameState.gameMode = 'online_deck_edit';
        GameState.appState = 'select_player';
        if (window.initSelectScreenReact) window.initSelectScreenReact(false);
        switchScreen('screen-select');
    };

    const handleSetReady = async () => {
        if (!localReadyConfig || !localReadyConfig.deck || localReadyConfig.deck.length < 20) {
            showAlertModal("デッキが未編成です。「編成」ボタンからキャラクターを選び、デッキを準備してください。");
            return;
        }
        playSound(SOUNDS.seClick);
        try {
            await updatePlayerReady(localReadyConfig, true);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCancelReady = async () => {
        playSound(SOUNDS.seClick);
        try {
            await updatePlayerReady(localReadyConfig, false);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSendChat = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        try {
            const storedName = localStorage.getItem('mini_card_battle_player_name') || 'Player';
            await sendChatMessage(chatInput, storedName);
            setChatInput('');
        } catch (e) {
            console.error(e);
        }
    };

    const host = roomData?.host;
    const client = roomData?.client;
    const isHost = getIsHost();
    const myData = isHost ? host : client;
    const opData = isHost ? client : host;

    const chats = roomData?.chat ? Object.values(roomData.chat).sort((a, b) => a.timestamp - b.timestamp) : [];

    const myIcon = myData?.leaderConfig?.leaderConfig ? getSkinImage(myData.leaderConfig.leaderConfig, myData.leaderConfig.skin, 'icon') : '';
    const opIcon = opData?.leaderConfig?.leaderConfig ? getSkinImage(opData.leaderConfig.leaderConfig, opData.leaderConfig.skin, 'icon') : '';
    const myName = localStorage.getItem('mini_card_battle_player_name') || '自分';

    return (
        <div id="screen-online-lobby" className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', padding: '20px', boxSizing: 'border-box' }}>
            <h2 style={{ color: '#38bdf8', margin: '0 0 20px 0', textAlign: 'center', flexShrink: 0, textShadow: '0 0 10px rgba(56, 189, 248, 0.5)' }}>ルーム待機中</h2>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
                {/* 自分 */}
                <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '15px', borderRadius: '12px', border: '1px solid #38bdf8', display: 'flex', alignItems: 'center', gap: '15px', width: '100%', boxSizing: 'border-box', alignSelf: 'stretch' }}>
                    <div style={{
                        width: '48px', height: '48px', flexShrink: 0,
                        borderRadius: '50%', border: '2px solid #38bdf8',
                        background: myIcon ? `url('${myIcon}') center/cover` : 'rgba(0,0,0,0.5)'
                    }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ color: '#38bdf8', fontSize: '0.9rem', marginBottom: '5px' }}>{myName}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                            <div style={{ color: myData?.isReady ? '#10b981' : '#facc15', fontWeight: 'bold' }}>
                                {myData?.isReady ? '準備完了！' : '準備中...'}
                            </div>
                            <div>
                                {myData?.isReady ? (
                                    <button className="btn" style={{ margin: 0, padding: '5px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap', background: '#64748b', flexShrink: 0 }} onClick={handleCancelReady}>準備解除</button>
                                ) : (
                                    <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                                        <button className="btn" style={{ margin: 0, padding: '5px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap', background: '#3b82f6', width: 'auto' }} onClick={handleDeckEdit}>編成</button>
                                        <button className="btn" style={{ margin: 0, padding: '5px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap', background: '#10b981', width: 'auto' }} onClick={handleSetReady}>準備完了</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 相手 */}
                <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '15px', borderRadius: '12px', border: '1px solid #ef4444', display: 'flex', alignItems: 'center', gap: '15px', width: '100%', boxSizing: 'border-box', alignSelf: 'stretch' }}>
                    <div style={{
                        width: '48px', height: '48px', flexShrink: 0,
                        borderRadius: '50%', border: '2px solid #ef4444',
                        background: opIcon ? `url('${opIcon}') center/cover` : 'rgba(0,0,0,0.5)'
                    }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '5px' }}>
                            {opData ? `${opData.name}` : ''}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
                            {!opData ? (
                                <div style={{ color: '#94a3b8' }}>対戦相手を待っています...</div>
                            ) : (
                                <div style={{ color: opData.isReady ? '#10b981' : '#facc15', fontWeight: 'bold' }}>
                                    {opData.isReady ? '準備完了！' : '準備中...'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* チャット */}
                <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '15px', borderRadius: '12px', border: '1px solid #475569', flex: 1, display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', alignSelf: 'stretch', minHeight: 0 }}>
                    <div style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '5px' }}>チャット</div>
                    <div style={{ flex: 1, minHeight: '120px', overflowY: 'auto', background: '#0f172a', padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.9rem', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ marginTop: 'auto' }}>
                            {chats.map((msg, i) => (
                                <div key={i} style={{ marginBottom: '5px', wordBreak: 'break-all' }}>
                                    <span style={{ color: msg.sender === myName ? '#38bdf8' : '#ef4444', fontWeight: 'bold' }}>{msg.sender}:</span>
                                    <span style={{ color: '#fff', marginLeft: '5px' }}>{msg.text}</span>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                    </div>
                    <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            style={{ flex: 1, background: '#1e293b', color: '#fff', border: '1px solid #475569', borderRadius: '4px', padding: '8px' }}
                            placeholder="メッセージ..."
                            maxLength="50"
                        />
                        <button type="submit" className="btn" style={{ margin: 0, padding: '5px 15px', width: 'auto', background: '#3b82f6' }}>送信</button>
                    </form>
                </div>

            </div>

            <div style={{ marginTop: '15px', textAlign: 'center', flexShrink: 0 }}>
                <button className="btn" style={{ margin: '0', background: '#ef4444' }} onClick={handleLeaveRoom}>退出・解散する</button>
            </div>
        </div>
    );
}
