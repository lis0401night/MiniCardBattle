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
  query,
  orderByChild,
  equalTo,
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
 * @param {function(Array): void} onUpdate - ルーム一覧更新時のコールバック関数
 * @returns {function(): void} リスナー解除関数
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
          // 待機中かつ公開設定（isPublic !== false）の部屋のみを一覧に含める
          if (room.status === 'waiting' && room.isPublic !== false) {
            availableRooms.push({
              id: key,
              ...room,
            });
          }
        });
      }
      // 作成日時の降順で並び替え
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

const ROOM_CODE_MIN = 100000;
const ROOM_CODE_RANGE = 900000;
const ROOM_CODE_MAX_ATTEMPTS = 5;

/**
 * 6桁のランダムな数字ルームID（コード）を生成する
 * @returns {string} 6桁の数字文字列
 */
function generateRoomCode() {
  return Math.floor(ROOM_CODE_MIN + Math.random() * ROOM_CODE_RANGE).toString();
}

/**
 * 6桁のルームコードを原子的（runTransaction）に予約する
 * 同一コードが同時に複数クライアントで取得されることを競合防止トランザクションで確実に防ぎます。
 *
 * @param {string} roomId - 作成予定のルームID (Firebase Key)
 * @returns {Promise<string>} 予約に成功した6桁のルームコード文字列
 * @throws {Error} 最大再試行回数を超えて予約に失敗した場合
 */
async function reserveRoomCode(roomId) {
  for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const reservationRef = ref(database, `roomCodeIndex/${code}`);

    try {
      const result = await runTransaction(reservationRef, (currentValue) => {
        // まだ誰にも予約されていない場合（null）、roomId を設定して予約
        if (currentValue === null) {
          return roomId;
        }
        // 既に予約済みの場合は変更を破棄してアボート
        return undefined;
      });

      if (result.committed) {
        return code;
      }
    } catch (e) {
      console.warn(`reserveRoomCode attempt ${attempt + 1} failed:`, e);
    }
  }
  throw new Error(
    'ルームコードの生成・予約に失敗しました。時間をおいて再試行してください。'
  );
}

/**
 * ルームを作成する
 * @param {string} hostName - ホストプレイヤー名
 * @param {object} [options] - ルーム作成のオプション
 * @param {boolean} [options.isPublic=true] - 公開ルームにするかどうか
 * @returns {Promise<string>} 作成されたルームID
 */
export async function createRoom(hostName, { isPublic = true } = {}) {
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
  const roomCode = await reserveRoomCode(newRoomRef.key);

  const rngSeed = Math.floor(Math.random() * 100000000).toString();

  try {
    await set(newRoomRef, {
      status: 'waiting',
      isPublic: isPublic,
      roomCode: roomCode,
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
  } catch (error) {
    // ルーム初期作成に失敗した場合は予約したインデックスコードを削除・解放する
    await remove(ref(database, `roomCodeIndex/${roomCode}`)).catch(() => {});
    throw error;
  }

  currentRoomId = newRoomRef.key;
  isHost = true;

  // ホスト切断時の自動部屋削除（部屋本体およびルームコード予約インデックス）を予約
  onDisconnect(newRoomRef)
    .remove()
    .catch((e) => console.error('onDisconnect error:', e));
  onDisconnect(ref(database, `roomCodeIndex/${roomCode}`))
    .remove()
    .catch((e) => console.error('onDisconnect code index error:', e));

  listenToRoom(currentRoomId);
  return currentRoomId;
}

/**
 * 6桁のルームコード（またはFirebase ID）から待機中ルームを検索して参加する
 * @param {string} roomCodeInput - 入力された6桁コードまたはルームID
 * @param {string} clientName - クライアントプレイヤー名
 * @returns {Promise<string>} 参加したルームID
 */
export async function joinRoomByCode(roomCodeInput, clientName) {
  if (!database) throw new Error('Firebase not initialized');
  if (!roomCodeInput || !roomCodeInput.trim()) {
    throw new Error('ルームIDを入力してください。');
  }

  const trimmedCode = roomCodeInput.trim();
  const roomsRef = ref(database, ROOMS_REF);

  // タイムアウト付きでPromiseを実行するヘルパー
  const getWithTimeout = (promise, ms = 5000) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error('通信タイムアウト: ルーム情報の取得に失敗しました。')
            ),
          ms
        )
      ),
    ]);
  };

  let targetRoomId = null;

  try {
    // 1. まず直接 Firebase Key (roomId) として存在するか短時間で試行
    const directRef = ref(database, `${ROOMS_REF}/${trimmedCode}`);
    const directSnapshot = await getWithTimeout(get(directRef), 3000).catch(
      () => null
    );
    if (directSnapshot && directSnapshot.exists()) {
      const room = directSnapshot.val();
      if (room.status === 'waiting') {
        targetRoomId = trimmedCode;
      }
    }

    // 2. 直接参照で見つからなかった場合、roomCode のインデックスクエリで探索
    if (!targetRoomId) {
      const codeQuery = query(
        roomsRef,
        orderByChild('roomCode'),
        equalTo(trimmedCode)
      );
      const codeSnapshot = await getWithTimeout(get(codeQuery), 5000).catch(
        () => null
      );

      if (codeSnapshot && codeSnapshot.exists()) {
        codeSnapshot.forEach((child) => {
          if (targetRoomId) return; // 最初に見つかった1件のみ採用
          const room = child.val();
          if (room.status === 'waiting') {
            targetRoomId = child.key;
          }
        });
      }
    }

    // 3. クエリで取得できなかった場合のフォールバック（全ルーム走査）
    if (!targetRoomId) {
      const allSnapshot = await getWithTimeout(get(roomsRef), 5000).catch(
        () => null
      );
      if (allSnapshot && allSnapshot.exists()) {
        allSnapshot.forEach((child) => {
          if (targetRoomId) return; // 最初に見つかった1件のみ採用
          const room = child.val();
          if (
            room.status === 'waiting' &&
            (room.roomCode === trimmedCode ||
              String(room.roomCode) === trimmedCode)
          ) {
            targetRoomId = child.key;
          }
        });
      }
    }
  } catch (err) {
    console.error('joinRoomByCode search error:', err);
    throw err;
  }

  if (!targetRoomId) {
    throw new Error(
      '指定されたIDのルームが見つからないか、既に対戦中・解散されています。'
    );
  }

  return await joinRoom(targetRoomId, clientName);
}

/**
 * 既存のルームに参加する
 * @param {string} roomId - 対象のルームID
 * @param {string} clientName - クライアントプレイヤー名
 * @returns {Promise<string>} 参加したルームID
 */
export async function joinRoom(roomId, clientName) {
  if (!database) throw new Error('Firebase not initialized');

  const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);

  const clientInfo = {
    id: getOrCreateUUID(),
    name: clientName || 'Player 2',
    icon: resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY)),
    isReady: false,
    leaderConfig: null,
  };

  // 1回の原子的トランザクションで参加状態（status === 'waiting' && client == null）を確認して参加更新を実行
  const result = await runTransaction(roomRef, (room) => {
    if (!room || room.status !== 'waiting' || room.client) {
      return undefined; // 条件を満たさない場合はトランザクションを中断してコミットしない
    }
    return {
      ...room,
      status: 'playing',
      client: clientInfo,
      battleSeed: Date.now(),
    };
  });

  if (!result.committed) {
    throw new Error('指定されたルームは見つからないか、既に対戦中・満員です。');
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

/**
 * 自身以外の未埋まり公開待機ルームが存在するかどうかを単発(get)で判定する
 * メインメニュー画面（ModeSelectScreen）で過剰な通信・読み取りコストを回避しつつ、
 * オンライン対戦ボタンの通知バッジ表示を更新するための軽量チェック関数
 *
 * @returns {Promise<boolean>} 自分以外の公開待機ルームが1件以上存在すればtrue
 */
export async function checkHasPublicWaitingRooms() {
  if (!database) return false;
  try {
    const myId = getOrCreateUUID();
    const roomsRef = ref(database, ROOMS_REF);

    // 常時接続リスナーではなく単発(get)で現在のルーム一覧情報を取得
    const snapshot = await get(roomsRef);
    if (!snapshot.exists()) return false;

    let hasRoom = false;
    snapshot.forEach((child) => {
      if (hasRoom) return; // 該当する部屋が1件でも見つかれば走査を打ち切り
      const room = child.val();
      // 「待機中(status === 'waiting')」「公開(isPublic !== false)」「自分以外のホスト」の3条件を満たすか確認
      if (
        room.status === 'waiting' &&
        room.isPublic !== false &&
        room.host?.id !== myId
      ) {
        hasRoom = true;
      }
    });
    return hasRoom;
  } catch (e) {
    console.error('checkHasPublicWaitingRooms error:', e);
    return false;
  }
}
