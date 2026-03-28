import React, { useState, useEffect, useRef } from 'react';
import { stopAllBGM, playSound, switchScreen, getCardImgUrl } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { listenToLobbyRooms, createRoom, joinRoom, multiplayerCallbacks, leaveRoom, getCurrentRoomId, getIsHost, updatePlayerReady, sendChatMessage, cachedRoomData, forceDeleteRoom } from '../hooks/multiplayer.js';
import { showAlertModal, showConfirmModal } from '../hooks/uiModals.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { GameState } from '../hooks/gameState.js';
import { prepareBattle } from '../hooks/battle.js';

export default function OnlineMenuScreen() {
    const [rooms, setRooms] = useState([]);
    const [playerName, setPlayerName] = useState('');
    const [isMatching, setIsMatching] = useState(false);
    
    // In-Room State
    const [inRoom, setInRoom] = useState(false);
    const [roomData, setRoomData] = useState(null);
    const [localReadyConfig, setLocalReadyConfig] = useState(null);
    
    // Chat State
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);

    useEffect(() => {
        if (SOUNDS?.bgmDefense?.paused) {
            stopAllBGM?.();
            playSound?.(SOUNDS.bgmDefense);
        }

        const storedName = localStorage.getItem('mini_card_battle_player_name') || 'Player';
        setPlayerName(storedName);

        // ローカルに保存されたオンライン用デッキを読み込む
        const deckJson = localStorage.getItem('mini_card_battle_online_deck');
        if (deckJson) {
            try {
                const parsed = JSON.parse(deckJson);
                const chara = CHARACTERS[parsed.leaderId] || CHARACTERS.android;
                const deckCards = parsed.deck.map(id => {
                    const template = CARD_MASTER.find(c => c.id === id);
                    return template ? { ...template } : null;
                }).filter(Boolean);

                setLocalReadyConfig({
                    name: storedName,
                    leaderConfig: chara,
                    deck: deckCards
                });
            } catch (e) {
                console.error(e);
            }
        }

        // 既にルームに入っているかチェック（デッキ編集から戻ってきた場合など）
        const activeRoomId = getCurrentRoomId();
        if (activeRoomId) {
            setInRoom(true);
            if (cachedRoomData) {
                setRoomData(cachedRoomData);
            }
        }

        const unsubscribe = listenToLobbyRooms((availableRooms) => {
            setRooms(availableRooms);
        });

        multiplayerCallbacks.onRoomUpdated = (data) => {
            setRoomData(data);
            
            // 両方がReadyならバトル開始
            if (data && data.host?.isReady && data.client?.isReady) {
                setTimeout(() => {
                    const isHost = getIsHost();
                    const meData = isHost ? data.host : data.client;
                    const opData = isHost ? data.client : data.host;
                    
                    GameState.playerConfig = { ...meData.leaderConfig.leaderConfig, deck: meData.leaderConfig.deck };
                    GameState.enemyConfig = { ...opData.leaderConfig.leaderConfig, deck: opData.leaderConfig.deck };
                    GameState.gameMode = 'online';
                    GameState.appState = 'battle';
                    
                    window.dispatchEvent(new Event('startOnlineBattle'));
                    if (typeof prepareBattle === 'function') prepareBattle();
                }, 1000);
            }
        };

        multiplayerCallbacks.onRoomClosed = () => {
            setInRoom(false);
            setRoomData(null);
            showAlertModal("ルームが解散されました。");
        };

        return () => {
            unsubscribe();
            multiplayerCallbacks.onRoomUpdated = null;
            multiplayerCallbacks.onRoomClosed = null;
        };
    }, []);

    // Scroll to bottom of chat when new message arrives
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [roomData?.chat]);

    const handleNameChange = (e) => {
        const val = e.target.value.substring(0, 10);
        setPlayerName(val);
        localStorage.setItem('mini_card_battle_player_name', val);
        if (localReadyConfig) {
            setLocalReadyConfig({ ...localReadyConfig, name: val });
        }
    };

    const handleCreateRoom = async () => {
        if (!playerName.trim()) {
            showAlertModal("プレイヤー名を入力してください！");
            return;
        }

        playSound(SOUNDS.seClick);
        setIsMatching(true);
        try {
            await createRoom(playerName);
            setInRoom(true);
            setIsMatching(false);
        } catch (e) {
            console.error(e);
            showAlertModal("ルーム作成に失敗しました。Firebaseの設定を確認してください。");
            setIsMatching(false);
        }
    };

    const handleJoinRoom = async (roomId) => {
        if (!playerName.trim()) {
            showAlertModal("プレイヤー名を入力してください！");
            return;
        }

        playSound(SOUNDS.seClick);
        try {
            await joinRoom(roomId, playerName);
            setInRoom(true);
        } catch (e) {
            console.error(e);
            showAlertModal("ルームへの入室に失敗しました（既に満員か解散された可能性があります）。");
        }
    };

    const handleLeaveRoom = async () => {
        playSound(SOUNDS.seClick);
        await leaveRoom();
        setInRoom(false);
        setRoomData(null);
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
        } catch(e) {
            console.error(e);
        }
    };

    const handleCancelReady = async () => {
        playSound(SOUNDS.seClick);
        try {
            await updatePlayerReady(localReadyConfig, false);
        } catch(e) {
            console.error(e);
        }
    };

    const handleBack = () => {
        playSound(SOUNDS.seClick);
        switchScreen('screen-mode-select');
        stopAllBGM();
        if (SOUNDS.bgmTitle && SOUNDS.bgmTitle.paused) {
            playSound(SOUNDS.bgmTitle);
        }
    };

    const handleSendChat = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        try {
            await sendChatMessage(chatInput, playerName);
            setChatInput('');
        } catch(e) {
            console.error(e);
        }
    };

    const handleForceDeleteRoom = (roomId) => {
        playSound(SOUNDS.seClick);
        showConfirmModal?.("このルームを強制解散しますか？", async () => {
            await forceDeleteRoom(roomId);
        });
    };

    if (inRoom) {
        const host = roomData?.host;
        const client = roomData?.client;
        const myData = getIsHost() ? host : client;
        const opData = getIsHost() ? client : host;
        
        const chats = roomData?.chat ? Object.values(roomData.chat).sort((a,b) => a.timestamp - b.timestamp) : [];

        const myIcon = myData?.leaderConfig?.leaderConfig?.icon;
        const opIcon = opData?.leaderConfig?.leaderConfig?.icon;

        return (
            <div id="screen-online-room" className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: '#0f172a', padding: '20px', boxSizing: 'border-box' }}>
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
                            <div style={{ color: '#38bdf8', fontSize: '0.9rem', marginBottom: '5px' }}>あなた ({playerName})</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ color: myData?.isReady ? '#10b981' : '#facc15', fontWeight: 'bold' }}>
                                    {myData?.isReady ? '準備完了！' : '準備中...'}
                                </div>
                                <div>
                                    {myData?.isReady ? (
                                        <button className="btn" style={{ margin: 0, padding: '5px 15px', background: '#64748b', flexShrink: 0 }} onClick={handleCancelReady}>準備解除</button>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                                            <button className="btn" style={{ margin: 0, padding: '5px 15px', background: '#3b82f6', width: 'auto' }} onClick={handleDeckEdit}>編成</button>
                                            <button className="btn" style={{ margin: 0, padding: '5px 15px', background: '#10b981', width: 'auto' }} onClick={handleSetReady}>準備完了</button>
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
                            <div style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '5px' }}>対戦相手</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                {!opData ? (
                                    <div style={{ color: '#94a3b8' }}>対戦相手を待っています...</div>
                                ) : (
                                    <>
                                        <div style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{opData.name} {opData.leaderConfig ? '✔️' : ''}</div>
                                        <div style={{ color: opData.isReady ? '#10b981' : '#facc15', fontWeight: 'bold' }}>
                                            {opData.isReady ? '準備完了！' : '準備中...'}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* チャット */}
                    <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '15px', borderRadius: '12px', border: '1px solid #475569', flex: 1, display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', alignSelf: 'stretch', minHeight: 0 }}>
                        <div style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '5px' }}>チャット (テスト用)</div>
                        <div style={{ flex: 1, minHeight: '120px', overflowY: 'auto', background: '#0f172a', padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.9rem', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ marginTop: 'auto' }}>
                                {chats.map((msg, i) => (
                                    <div key={i} style={{ marginBottom: '5px', wordBreak: 'break-all' }}>
                                        <span style={{ color: msg.sender === playerName ? '#38bdf8' : '#ef4444', fontWeight: 'bold' }}>{msg.sender}:</span> 
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

    return (
        <div id="screen-online-menu" className="screen active" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', background: '#0f172a', boxSizing: 'border-box' }}>
            <h2 style={{ color: '#38bdf8', margin: '20px 0', textAlign: 'center', textShadow: '0 0 10px rgba(56, 189, 248, 0.5)' }}>オンライン対戦 (Lobby)</h2>
            
            <div style={{ padding: '0 20px', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '15px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center', border: '1px solid #334155' }}>
                    <div style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '5px' }}>プレイヤー名</div>
                    <input 
                        type="text" 
                        value={playerName} 
                        onChange={handleNameChange}
                        style={{ background: '#0f172a', color: '#fff', border: '1px solid #38bdf8', borderRadius: '4px', padding: '5px 10px', fontSize: '1.2rem', textAlign: 'center', width: '200px' }}
                        maxLength="10"
                    />
                </div>

                {isMatching ? (
                    <div style={{ textAlign: 'center', margin: '40px 0' }}>
                        <div className="spinner" style={{ margin: '0 auto 20px' }}></div>
                        <h3 style={{ color: '#fff' }}>ルームを作成しています...</h3>
                    </div>
                ) : (
                    <>
                        <button 
                            className="btn" 
                            style={{ background: 'linear-gradient(45deg, #0284c7, #0369a1)', marginBottom: '30px' }} 
                            onClick={handleCreateRoom}
                        >
                            ルームを作成して待機する
                        </button>

                        <h3 style={{ color: '#94a3b8', fontSize: '1rem', borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '15px' }}>募集中のルーム</h3>
                        
                        {rooms.length === 0 ? (
                            <div style={{ color: '#64748b', textAlign: 'center', padding: '20px 0' }}>現在募集中のルームはありません。</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {rooms.map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', padding: '15px', borderRadius: '8px', border: '1px solid #475569' }}>
                                        <div>
                                            <div style={{ color: '#38bdf8', fontWeight: 'bold' }}>{r.host.name} のルーム</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                className="btn" 
                                                style={{ margin: 0, padding: '8px 15px', width: 'auto', background: '#10b981' }} 
                                                onClick={() => handleJoinRoom(r.id)}
                                            >
                                                入室する
                                            </button>
                                            <button 
                                                className="btn" 
                                                style={{ margin: 0, padding: '8px 15px', width: 'auto', background: '#ef4444' }} 
                                                onClick={() => handleForceDeleteRoom(r.id)}
                                            >
                                                解散
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div style={{ padding: '20px', textAlign: 'center' }}>
                <button className="btn" style={{ background: '#475569' }} onClick={handleBack} disabled={isMatching}>
                    戻る
                </button>
            </div>
        </div>
    );
}
