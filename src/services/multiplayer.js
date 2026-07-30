import {
  ref,
  push,
  set,
  onValue,
  update,
  get,
  remove,
  serverTimestamp,
  onChildAdded,
  onDisconnect,
  runTransaction,
} from 'firebase/database';
import { database } from '../utils/firebase.js';
import { getOrCreateUUID } from '../utils/gameUtils.js';
import { showAlertModal } from './uiModals.js';
import { PROFILE_ICON_KEY } from '../utils/constants/config.js';
import { resolveValidIconId } from '../utils/constants/avatars.js';

// 現在参加しているルームのID
export let currentRoomId = null;
export let isHost = false;
export let multiplayerCallbacks = {
  onRoomJoined: null,
  onRoomUpdated: null,
  onActionReceived: null,
  onRoomClosed: null,
};

export function getCurrentRoomId() {
  return currentRoomId;
}
export function getIsHost() {
  return isHost;
}

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
    console.error('Firebase not configured');
    if (onUpdate) onUpdate([]);
    return () => {};
  }

  const roomsRef = ref(database, ROOMS_REF);
  const unsubscribe = onValue(
    roomsRef,
    (snapshot) => {
      const data = snapshot.val();
      const availableRooms = [];
      if (data) {
        Object.keys(data).forEach((key) => {
          const room = data[key];
          // 待機中かつ自分が作った部屋ではないもの（テスト用なら自分の部屋も表示してOKだが、基本は除外か判別可能に）
          if (room.status === 'waiting') {
            availableRooms.push({
              id: key,
              ...room,
            });
          }
        });
      }
      // 作成日時の降順などで並び替えると良い
      availableRooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      onUpdate(availableRooms);
    },
    (error) => {
      console.error('Firebase listen error:', error);
      if (
        error?.code === 'PERMISSION_DENIED' ||
        (error?.message && error.message.includes('Permission denied'))
      ) {
        showAlertModal(
          '【通信エラー】サーバーの接続上限（または無料枠）に達しているため、現在オンライン機能が利用できません。'
        );
      }
    }
  );

  return unsubscribe;
}

/**
 * ルームを作成する
 */
export async function createRoom(hostName) {
  if (!database) throw new Error('Firebase not initialized');

  const uuid = getOrCreateUUID();
  const roomsRef = ref(database, ROOMS_REF);

  // 既存の自分が作ったルーム（ゴミ）を削除
  try {
    const snapshot = await get(roomsRef);
    if (snapshot.exists()) {
      const deletePromises = [];
      snapshot.forEach((child) => {
        const roomData = child.val();
        if (roomData.host && roomData.host.id === uuid) {
          deletePromises.push(
            remove(ref(database, `${ROOMS_REF}/${child.key}`))
          );
        }
      });
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    }
  } catch (e) {
    console.error('Failed to cleanup old rooms:', e);
  }

  const newRoomRef = push(roomsRef);

  const rngSeed = Math.floor(Math.random() * 100000000).toString();
  currentRoomId = newRoomRef.key;
  isHost = true;

  // ホスト切断時の自動部屋削除を予約
  onDisconnect(newRoomRef)
    .remove()
    .catch((e) => console.error('onDisconnect error:', e));

  await set(newRoomRef, {
    status: 'waiting',
    createdAt: serverTimestamp(),
    rngSeed: rngSeed,
    host: {
      id: uuid,
      name: hostName || 'Player 1',
      icon: resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY)),
      isReady: false,
      leaderConfig: null,
    },
    client: null,
    actionQueue: {},
  });

  listenToRoom(currentRoomId);
  return currentRoomId;
}

/**
 * 既存のルームに参加する
 */
export async function joinRoom(roomId, clientName) {
  if (!database) throw new Error('Firebase not initialized');

  const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    throw new Error('Room not found');
  }

  const roomData = snapshot.val();
  if (roomData.status !== 'waiting') {
    throw new Error('Room is already playing or finished');
  }

  currentRoomId = roomId;
  isHost = false;

  // クライアント切断時の自動ロビー戻り（クライアント削除 & ステータス復元）を予約
  onDisconnect(roomRef)
    .update({
      status: 'waiting',
      client: null,
    })
    .catch((e) => console.error('onDisconnect error:', e));

  // クライアント情報を書き込み、ステータスを playing に切り替える
  await update(roomRef, {
    status: 'playing',
    client: {
      id: getOrCreateUUID(),
      name: clientName || 'Player 2',
      icon: resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY)),
      isReady: false,
      leaderConfig: null,
    },
    battleSeed: Date.now(),
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
      if (multiplayerCallbacks.onRoomClosed)
        multiplayerCallbacks.onRoomClosed();
      return;
    }

    // ホスト側：クライアントが入室したことを検知
    if (
      isHost &&
      data.status === 'playing' &&
      data.client &&
      multiplayerCallbacks.onRoomJoined
    ) {
      multiplayerCallbacks.onRoomJoined(data);
      multiplayerCallbacks.onRoomJoined = null; // 1回だけ呼ぶ
    }

    // クライアント側：すでにplayingなら即座に開始
    if (
      !isHost &&
      data.status === 'playing' &&
      multiplayerCallbacks.onRoomJoined
    ) {
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
    onlineActionUnsubscribe = null;
  }

  const actionsRef = ref(database, `${ROOMS_REF}/${currentRoomId}/actions`);
  // Firebase v9 Modular APIでは、onChildAddedは直接Unsubscribe関数を返します
  onlineActionUnsubscribe = onChildAdded(actionsRef, (snapshot) => {
    const val = snapshot.val();
    if (onActionReceived && val) {
      onActionReceived(val);
    }
  });
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
    timestamp: serverTimestamp(),
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
  const pRef = ref(
    database,
    `${ROOMS_REF}/${currentRoomId}/${isHost ? 'host' : 'client'}`
  );
  await update(pRef, {
    leaderConfig: config,
    isReady: isReadyStatus,
  });
}

/**
 * 自身の準備状態のみを更新する（デッキデータは維持）
 */
export async function setPlayerReadyOnly(isReadyStatus) {
  if (!currentRoomId || !database) return;
  const pRef = ref(
    database,
    `${ROOMS_REF}/${currentRoomId}/${isHost ? 'host' : 'client'}`
  );
  await update(pRef, {
    isReady: isReadyStatus,
  });
}

/**
 * リマッチに向けてアクションキューを初期化し、新しいシードをセットする（ホスト専用）
 */
export async function clearActionQueueAndRegenerateSeed() {
  if (!currentRoomId || !database || !isHost) return;
  const roomRef = ref(database, `${ROOMS_REF}/${currentRoomId}`);
  await update(roomRef, {
    actions: null,
    battleSeed: Date.now(),
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
    timestamp: serverTimestamp(),
  });
}

/**
 * ルームから退室（または解散）する
 */
export async function leaveRoom() {
  if (!currentRoomId || !database) return;

  const roomId = currentRoomId;
  const wasHost = isHost;

  // 1. ローカルの状態クリアは「最初」に無条件で安全に実行します
  // （これによりサーバー通信の成否にかかわらず、クライアントのローカル状態はクリーンになりロビーへ戻れます）
  if (roomListenerUnsubscribe) {
    roomListenerUnsubscribe();
    roomListenerUnsubscribe = null;
  }
  stopListeningToRoomActions();

  currentRoomId = null;
  isHost = false;
  cachedRoomData = null;

  const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);

  // 正常退室のための切断時予約の解除
  try {
    await onDisconnect(roomRef).cancel();
  } catch (e) {
    console.warn('onDisconnect cancel failed:', e);
  }

  try {
    if (wasHost) {
      // ホストが抜ける場合はルームごと削除
      await remove(roomRef);
    } else {
      // クライアントが抜ける場合は、他の操作との競合によるルームの再作成を防ぐため
      // トランザクションを使用してデータが存在する間だけステータスとクライアントを更新する
      await runTransaction(roomRef, (room) => {
        if (!room) return undefined; // ルームが既に削除されている場合は書き込みせず中断
        return {
          ...room,
          status: 'waiting',
          client: null,
        };
      });
    }
  } catch (e) {
    console.error('leaveRoom failed:', e);
    // 正常退室処理に失敗した場合は、ホストの場合のみ切断時自動削除の予約を再設定します
    // （クライアント側での onDisconnect().update は削除済みルームの再生成・ゾンビルーム化を招くため行いません）
    try {
      if (wasHost) {
        await onDisconnect(roomRef).remove();
      }
    } catch (disconnectError) {
      console.warn('Failed to re-register onDisconnect:', disconnectError);
    }
    throw e;
  }
}

/**
 * テスト用・強制的にルームを削除する
 */
export async function forceDeleteRoom(roomId) {
  if (!database) return;
  const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
  await remove(roomRef).catch((e) => console.error(e));
}

/**
 * デバッグ用・すべてのルームを強制解散（削除）する
 */
export async function forceDeleteAllRooms() {
  if (!database) return;
  const roomsRef = ref(database, ROOMS_REF);
  await remove(roomsRef).catch((e) => console.error(e));
}
