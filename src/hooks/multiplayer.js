import { ref, push, set, onValue, update, get, remove, serverTimestamp, onChildAdded, off } from "firebase/database";
import { database } from "../utils/firebase.js";
import { getOrCreateUUID } from "../utils/gameUtils.js";

// 現在参加しているルームのID
export let currentRoomId = null;
export let isHost = false;
export let multiplayerCallbacks = {
    onRoomJoined: null,
    onRoomUpdated: null,
    onActionReceived: null,
    onRoomClosed: null
};

export function getCurrentRoomId() { return currentRoomId; }
export function getIsHost() { return isHost; }

// リスナー解除用関数
let roomListenerUnsubscribe = null;
export let cachedRoomData = null;

// 定数
export const ROOMS_REF = 'rooms';

/**
 * 待機中のルーム一覧を取得する関数（コールバックでリアルタイム更新）
 */
export function listenToLobbyRooms(onUpdate) {
    if (!database) {
        console.error("Firebase not configured");
        if (onUpdate) onUpdate([]);
        return () => {};
    }
    
    const roomsRef = ref(database, ROOMS_REF);
    const unsubscribe = onValue(roomsRef, (snapshot) => {
        const data = snapshot.val();
        const availableRooms = [];
        if (data) {
            Object.keys(data).forEach(key => {
                const room = data[key];
                // 待機中かつ自分が作った部屋ではないもの（テスト用なら自分の部屋も表示してOKだが、基本は除外か判別可能に）
                if (room.status === 'waiting') {
                    availableRooms.push({
                        id: key,
                        ...room
                    });
                }
            });
        }
        // 作成日時の降順などで並び替えると良い
        availableRooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        onUpdate(availableRooms);
    });

    return unsubscribe;
}

/**
 * ルームを作成する
 */
export async function createRoom(hostName) {
    if (!database) throw new Error("Firebase not initialized");
    
    const roomsRef = ref(database, ROOMS_REF);
    const newRoomRef = push(roomsRef);
    
    const rngSeed = Math.floor(Math.random() * 100000000).toString();
    currentRoomId = newRoomRef.key;
    isHost = true;

    await set(newRoomRef, {
        status: 'waiting',
        createdAt: serverTimestamp(),
        rngSeed: rngSeed,
        host: {
            id: getOrCreateUUID(),
            name: hostName || 'Player 1',
            isReady: false,
            leaderConfig: null
        },
        client: null,
        actionQueue: {}
    });

    listenToRoom(currentRoomId);
    return currentRoomId;
}

/**
 * 既存のルームに参加する
 */
export async function joinRoom(roomId, clientName) {
    if (!database) throw new Error("Firebase not initialized");

    const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
        throw new Error("Room not found");
    }

    const roomData = snapshot.val();
    if (roomData.status !== 'waiting') {
        throw new Error("Room is already playing or finished");
    }

    currentRoomId = roomId;
    isHost = false;

    // クライアント情報を書き込み、ステータスを playing に切り替える
    await update(roomRef, {
        status: 'playing',
        client: {
            id: getOrCreateUUID(),
            name: clientName || 'Player 2',
            isReady: false,
            leaderConfig: null
        },
        battleSeed: Date.now()
    });

    listenToRoom(currentRoomId);
    return currentRoomId;
}

/**
 * ルームの変更（相手の入室、アクション追加、切断など）を監視する
 */
export function listenToRoom(roomId) {
    if (!database) return;
    
    if (roomListenerUnsubscribe) {
        roomListenerUnsubscribe();
    }

    const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
    roomListenerUnsubscribe = onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        cachedRoomData = data;
        
        if (!data) {
            // ルームが削除された（ホストが解散したなど）
            if (multiplayerCallbacks.onRoomClosed) multiplayerCallbacks.onRoomClosed();
            return;
        }

        // ホスト側：クライアントが入室したことを検知
        if (isHost && data.status === 'playing' && data.client && multiplayerCallbacks.onRoomJoined) {
            multiplayerCallbacks.onRoomJoined(data);
            multiplayerCallbacks.onRoomJoined = null; // 1回だけ呼ぶ
        }
        
        // クライアント側：すでにplayingなら即座に開始
        if (!isHost && data.status === 'playing' && multiplayerCallbacks.onRoomJoined) {
            multiplayerCallbacks.onRoomJoined(data);
            multiplayerCallbacks.onRoomJoined = null;
        }

        // 常に最新の状態をUI側に通知
        if (multiplayerCallbacks.onRoomUpdated) {
            multiplayerCallbacks.onRoomUpdated(data);
        }
    });
}

// ------------------------------------------
// バトル中のアクション同期ロジック (Phase 3)
// ------------------------------------------

let onlineActionUnsubscribe = null;

export function listenToRoomActions(onActionReceived) {
    if (!database || !currentRoomId) return;
    
    if (onlineActionUnsubscribe) {
        onlineActionUnsubscribe();
    }
    
    const actionsRef = ref(database, `${ROOMS_REF}/${currentRoomId}/actions`);
    const unsubscribeFn = onChildAdded(actionsRef, (snapshot) => {
        const val = snapshot.val();
        if (onActionReceived && val) {
            onActionReceived(val);
        }
    });
    
    onlineActionUnsubscribe = () => off(actionsRef, 'child_added', unsubscribeFn);
}

export function stopListeningToRoomActions() {
    if (onlineActionUnsubscribe) {
        onlineActionUnsubscribe();
        onlineActionUnsubscribe = null;
    }
}

export async function sendOnlineAction(action) {
    if (!database || !currentRoomId) return;
    const actionsRef = ref(database, `${ROOMS_REF}/${currentRoomId}/actions`);
    await push(actionsRef, {
        actor: isHost ? 'host' : 'client',
        action: action,
        timestamp: serverTimestamp()
    });
}

// ------------------------------------------
// 準備とチャットロジック
// ------------------------------------------

/**
 * 自身の準備状態とデッキ設定を更新する
 */
export async function updatePlayerReady(config, isReadyStatus = true) {
    if (!currentRoomId || !database) return;
    const pRef = ref(database, `${ROOMS_REF}/${currentRoomId}/${isHost ? 'host' : 'client'}`);
    await update(pRef, {
        leaderConfig: config,
        isReady: isReadyStatus
    });
}

/**
 * チャットメッセージを送信
 */
export async function sendChatMessage(text, senderName) {
    if (!currentRoomId || !database) return;
    const chatRef = ref(database, `${ROOMS_REF}/${currentRoomId}/chat`);
    await push(chatRef, {
        sender: senderName,
        text: text,
        timestamp: serverTimestamp()
    });
}

/**
 * ルームから退室（または解散）する
 */
export async function leaveRoom() {
    if (!currentRoomId || !database) return;
    
    if (roomListenerUnsubscribe) {
        roomListenerUnsubscribe();
        roomListenerUnsubscribe = null;
    }

    const roomRef = ref(database, `${ROOMS_REF}/${currentRoomId}`);
    
    if (isHost) {
        // ホストが抜ける場合はルームごと削除
        await remove(roomRef).catch(e => console.error(e));
    } else {
        // クライアントが抜ける場合はステータスを waiting に戻し、自身を消す
        await update(roomRef, {
            status: 'waiting',
            client: null
        }).catch(e => console.error(e));
    }

    currentRoomId = null;
    isHost = false;
    cachedRoomData = null;
    stopListeningToRoomActions();
}

/**
 * テスト用・強制的にルームを削除する
 */
export async function forceDeleteRoom(roomId) {
    if (!database) return;
    const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
    await remove(roomRef).catch(e => console.error(e));
}
