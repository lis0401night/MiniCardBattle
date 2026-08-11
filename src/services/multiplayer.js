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
  limitToLast,
} from 'firebase/database';
import { database } from '../utils/firebase.js';
import { getOrCreateUUID } from '../utils/gameUtils.js';
import { showAlertModal } from './uiModals.js';
import { PROFILE_ICON_KEY } from '../utils/constants/config.js';
import { resolveValidIconId } from '../utils/constants/avatars.js';

// 現在参加しているルームのIDおよびルームコード
export let currentRoomId = null;
export let currentRoomCode = null;
export let isHost = false;
export let multiplayerCallbacks = {
  onRoomJoined: null,
  onRoomUpdated: null,
  onActionReceived: null,
  onRoomClosed: null,
};

/**
 * 現在参加しているルームのIDを取得する
 * @returns {string|null} ルームID
 */
export function getCurrentRoomId() {
  return currentRoomId;
}

/**
 * 現在参加しているルームの6桁コードを取得する
 * @returns {string|null} ルームコード
 */
export function getCurrentRoomCode() {
  return currentRoomCode;
}

/**
 * 自身がホストであるかどうかを取得する
 * @returns {boolean} ホストフラグ
 */
export function getIsHost() {
  return isHost;
}

/** Firebaseサーバーとローカル時刻の差分（ミリ秒）。.info/serverTimeOffset で同期する */
let serverTimeOffsetMs = 0;
if (database) {
  onValue(ref(database, '.info/serverTimeOffset'), (snap) => {
    serverTimeOffsetMs = snap.val() || 0;
  });
}

/**
 * サーバー基準の現在時刻を取得する。
 * @returns {number} サーバー基準のタイムスタンプ（ミリ秒）
 */
export function getServerNow() {
  return Date.now() + serverTimeOffsetMs;
}

/** ホスト生存信号（ハートビート）の有効期限（45秒） */
export const ROOM_HEARTBEAT_TIMEOUT_MS = 45000;

/**
 * ホストが現在ロビー画面でアプリを開いて待機中であることを示す生存信号（ハートビート）を更新する。
 * ルームが削除済みの場合は書き込まず、ゴミノードの再生成を防ぐ。
 * @param {string} roomId - 対象のルームID
 * @returns {Promise<boolean>} 更新が成功したかどうか
 */
export async function updateRoomHeartbeat(roomId) {
  if (!roomId || !database) return false;
  try {
    const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
    // ルームが削除済みの場合は書き込まず、ゴミノードの再生成を防ぐ
    const result = await runTransaction(roomRef, (room) => {
      if (!room || !room.host) return undefined;
      return {
        ...room,
        host: {
          ...room.host,
          lastActiveAt: serverTimestamp(),
        },
      };
    });
    return result.committed;
  } catch (e) {
    console.warn('updateRoomHeartbeat failed:', e);
    return false;
  }
}

/**
 * ルームのホストが生存中（直近にハートビートを送信しているか、または作成直後であるか）を判定する。
 * @param {Object} room - ルームデータ
 * @param {number} [now] - サーバー基準の現在のタイムスタンプ
 * @returns {boolean} ホストが生存中であればtrue
 */
export function isHostAlive(room, now = getServerNow()) {
  if (!room || !room.host) return false;
  const lastSeen = room.host.lastActiveAt || room.createdAt || 0;
  if (!lastSeen) return true;
  return now - lastSeen <= ROOM_HEARTBEAT_TIMEOUT_MS;
}

// リスナー解除用関数
let roomListenerUnsubscribe = null;
export let cachedRoomData = null;

// 定数
export const ROOMS_REF = 'rooms';

/**
 * 未埋まりの公開対戦待機ルーム一覧をリアルタイム監視する共通実装。
 * ホストの生存信号（lastActiveAt）を確認し、放置された無人部屋は自動除外・クリーンアップする。
 *
 * @param {function(Array):void} onUpdate - ロード・更新完了時にコールバックされる関数
 * @param {Object} [options] - 動作オプション
 * @param {boolean} [options.cleanupExpired=true] - 期限切れ部屋を自動クリーンアップするかどうか
 * @returns {function():void} 監視解除用関数
 */
function subscribeWaitingRooms(onUpdate, { cleanupExpired = true } = {}) {
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
      const now = getServerNow();
      const expiredRoomKeys = [];

      if (data) {
        Object.keys(data).forEach((key) => {
          const room = data[key];
          // 待機中かつ公開設定（isPublic !== false）の部屋をチェック
          if (room && room.status === 'waiting' && room.isPublic !== false) {
            if (isHostAlive(room, now)) {
              availableRooms.push({
                id: key,
                ...room,
              });
            } else {
              expiredRoomKeys.push({ key, code: room.roomCode });
            }
          }
        });
      }

      // 放置された無人部屋のバックグラウンドクリーンアップ
      if (cleanupExpired && expiredRoomKeys.length > 0) {
        expiredRoomKeys.forEach(({ key, code }) => {
          removeExpiredRoomIfStillInactive(key, code).catch(() => {});
        });
      }

      // 作成日時の降順で並び替え
      availableRooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (onUpdate) onUpdate(availableRooms);
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
 * 未埋まりの公開対戦待機ルーム一覧をリアルタイム監視する。
 * ホストの生存信号を確認し、放置部屋は自動除外・クリーンアップする。
 *
 * @param {function(Array):void} onUpdate - ロード・更新完了時にコールバックされる関数
 * @returns {function():void} 監視解除用関数
 */
export function fetchPublicWaitingRooms(onUpdate) {
  return subscribeWaitingRooms(onUpdate, { cleanupExpired: true });
}

/**
 * 待機中の公開ルーム一覧を取得・監視する関数（ロビー画面用）
 * @param {function(Array): void} onUpdate - ルーム一覧更新時のコールバック関数
 * @returns {function(): void} リスナー解除関数
 */
export function listenToLobbyRooms(onUpdate) {
  return subscribeWaitingRooms(onUpdate, { cleanupExpired: true });
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
 * ルーム本体とルームコードインデックスを同一の原子的（アトミック）更新で同時削除する
 * @param {string} roomId - 削除対象のルームID
 * @param {string} roomCode - 削除対象の6桁ルームコード（省略可能）
 * @returns {Promise<void>}
 */
async function removeRoomAndCode(roomId, roomCode) {
  if (!database || !roomId) return;
  const updates = {
    [`${ROOMS_REF}/${roomId}`]: null,
  };
  if (roomCode) {
    updates[`roomCodeIndex/${roomCode}`] = null;
  }
  await update(ref(database), updates);
}

/**
 * 期限切れ判定されたルームが、現在も非アクティブ状態（ホストが離脱・停止中）であることを
 * トランザクション内でアトミックに再確認した上で安全に削除する。
 * @param {string} roomId - 対象のルームID
 * @param {string} [roomCode] - 対象のルームコード
 * @returns {Promise<void>}
 */
async function removeExpiredRoomIfStillInactive(roomId, roomCode) {
  if (!database || !roomId) return;
  const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
  const result = await runTransaction(roomRef, (room) => {
    if (!room || isHostAlive(room, getServerNow())) return undefined;
    return null;
  });

  if (!result.committed || !roomCode) return;

  const codeRef = ref(database, `roomCodeIndex/${roomCode}`);
  await runTransaction(codeRef, (indexedRoomId) => {
    return indexedRoomId === roomId ? null : undefined;
  });
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

  // 既存の自分が作ったルーム（ゴミ）を削除（部屋本体とインデックスを原子的に削除）
  try {
    const snapshot = await get(roomsRef);
    if (snapshot.exists()) {
      const deletePromises = [];
      snapshot.forEach((child) => {
        const roomData = child.val();
        if (roomData.host && roomData.host.id === uuid) {
          deletePromises.push(removeRoomAndCode(child.key, roomData.roomCode));
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

  // 予約直後に自動解放を登録し、set完了前の切断でインデックスが孤児化することを防ぐ
  const codeIndexRef = ref(database, `roomCodeIndex/${roomCode}`);
  const rngSeed = Math.floor(Math.random() * 100000000).toString();

  try {
    // ルーム公開前に両方の切断時自動削除予約を登録する
    await onDisconnect(codeIndexRef).remove();
    await onDisconnect(newRoomRef).remove();

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
    // ルーム初期作成またはonDisconnect登録に失敗した場合は予約したインデックスコードおよびルーム本体をクリーンアップ
    await removeRoomAndCode(newRoomRef.key, roomCode).catch(() => {});
    throw error;
  }

  currentRoomId = newRoomRef.key;
  currentRoomCode = roomCode;
  isHost = true;

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
  // Firebase のノードパスに安全に使用できる英数字・ハイフン・アンダースコアのみを許可する
  if (!/^[A-Za-z0-9_-]+$/.test(trimmedCode)) {
    throw new Error('ルームIDの形式が不正です。');
  }
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

    // 2. 予約インデックス（roomCodeIndex）から対象ルームIDを O(1) で高速解決
    if (!targetRoomId) {
      const indexSnapshot = await getWithTimeout(
        get(ref(database, `roomCodeIndex/${trimmedCode}`)),
        3000
      ).catch(() => null);
      const indexedRoomId = indexSnapshot?.val();
      if (indexedRoomId && typeof indexedRoomId === 'string') {
        const indexedRoomSnapshot = await getWithTimeout(
          get(ref(database, `${ROOMS_REF}/${indexedRoomId}`)),
          3000
        ).catch(() => null);
        if (indexedRoomSnapshot?.exists()) {
          const room = indexedRoomSnapshot.val();
          if (room.status === 'waiting') {
            targetRoomId = indexedRoomId;
          }
        }
      }
    }

    // 3. インデックスで見つからなかった場合、roomCode のインデックスクエリで探索
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
          if (targetRoomId) return true; // 最初に見つかった1件のみ採用し列挙を打ち切り
          const room = child.val();
          if (room.status === 'waiting') {
            targetRoomId = child.key;
            return true; // 打ち切り
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
    // Firebase RTDBでは undefined を返した場合のみトランザクション中断となる（null は削除コミットになる）
    if (room === null) return undefined;
    if (room.status !== 'waiting' || room.client) {
      return undefined; // 条件を満たさない場合はトランザクションを中断してコミットしない
    }
    return {
      ...room,
      status: 'playing',
      client: clientInfo,
      battleSeed: Date.now(),
    };
  });

  if (!result.committed || !result.snapshot?.exists()) {
    throw new Error('指定されたルームは見つからないか、既に対戦中・満員です。');
  }

  currentRoomId = roomId;
  // ホストが発行した6桁コードを参加側でも保持し、getCurrentRoomCode()から参照できるようにする
  currentRoomCode = result.snapshot.val()?.roomCode || null;
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
 * 対戦開始時にルームのステータスを 'battle' に更新する（ホスト専用）
 * 両プレイヤーが準備完了した際、DB上に対戦開始フラグを書き込み確実な追いつき同期を実現します。
 * @returns {Promise<void>}
 */
export async function setRoomStatusToBattle() {
  if (!currentRoomId || !database || !isHost) return;
  const roomRef = ref(database, `${ROOMS_REF}/${currentRoomId}`);
  await update(roomRef, {
    status: 'battle',
    battleStartedAt: serverTimestamp(),
  });
}

/**
 * 対戦終了時にルームのステータスを 'waiting' に戻し、準備完了状態をクリアする
 * 存在しない client ノードを誤って再生成しないよう安全に判定して更新する
 * @returns {Promise<void>}
 */
export async function resetRoomStatusToWaiting() {
  if (!currentRoomId || !database) return;
  const roomRef = ref(database, `${ROOMS_REF}/${currentRoomId}`);
  if (isHost) {
    await runTransaction(roomRef, (room) => {
      if (!room) return undefined;
      const next = {
        ...room,
        status: 'waiting',
        host: {
          ...room.host,
          isReady: false,
        },
      };
      if (room.client) {
        next.client = {
          ...room.client,
          isReady: false,
        };
      }
      return next;
    });
  } else {
    await runTransaction(roomRef, (room) => {
      if (!room?.client) return undefined;
      return {
        ...room,
        client: {
          ...room.client,
          isReady: false,
        },
      };
    });
  }
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
  const roomCode = currentRoomCode;
  const wasHost = isHost;

  // 1. ローカルの状態クリアは「最初」に無条件で安全に実行します
  // （これによりサーバー通信の成否にかかわらず、クライアントのローカル状態はクリーンになりロビーへ戻れます）
  if (roomListenerUnsubscribe) {
    roomListenerUnsubscribe();
    roomListenerUnsubscribe = null;
  }
  stopListeningToRoomActions();

  currentRoomId = null;
  currentRoomCode = null;
  isHost = false;
  cachedRoomData = null;

  const roomRef = ref(database, `${ROOMS_REF}/${roomId}`);
  const codeRef = roomCode ? ref(database, `roomCodeIndex/${roomCode}`) : null;

  try {
    if (wasHost) {
      // 1. DBからルームおよびコードインデックスを原子的に同時削除（先に明示操作を完了させる）
      await removeRoomAndCode(roomId, roomCode);
    } else {
      // 1. トランザクションを使用して、データが存在する間だけステータスとクライアントを更新する
      await runTransaction(roomRef, (room) => {
        if (!room) return undefined; // ルームが既に削除されている場合は書き込みせず中断
        return {
          ...room,
          status: 'waiting',
          client: null,
        };
      });
    }

    // 2. 明示的な退室・解散が完了した後、不要になった切断時自動削除/更新の予約を解除する
    try {
      await onDisconnect(roomRef).cancel();
      if (codeRef) {
        await onDisconnect(codeRef).cancel();
      }
    } catch (disconnectError) {
      console.warn('切断時予約の解除に失敗しました:', disconnectError);
    }
  } catch (e) {
    console.error('leaveRoom failed:', e);
    // 正常退室処理に失敗した場合は、ホストの場合のみ切断時自動削除の予約を再設定します
    // （クライアント側での onDisconnect().update は削除済みルームの再生成・ゾンビルーム化を招くため行いません）
    try {
      if (wasHost) {
        await onDisconnect(roomRef).remove();
        if (codeRef) {
          await onDisconnect(codeRef).remove();
        }
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

/** 公開待機ルームの存在チェックで取得する最大件数 */
const PUBLIC_ROOM_CHECK_LIMIT = 20;

/**
 * 自身以外の未埋まり公開待機ルームが存在するかどうかを単発(get)で軽量チェックする。
 * メインメニュー画面（ModeSelectScreen）のオンライン対戦ボタンの通知バッジ表示用。
 * ゴミ部屋は onDisconnect().remove() とホスト生存信号（lastActiveAt）の二重の仕組みで除去する。
 * 本関数は isHostAlive() による生存判定を含めて最新の待機部屋に自分以外の公開ルームが存在するかを判定する。
 *
 * @returns {Promise<boolean>} 自分以外の公開待機ルームが1件以上存在すればtrue
 */
export async function checkHasPublicWaitingRooms() {
  if (!database) return false;
  try {
    const myId = getOrCreateUUID();
    const roomsRef = ref(database, ROOMS_REF);
    const now = getServerNow();

    let snapshot;
    try {
      const waitingQuery = query(
        roomsRef,
        orderByChild('status'),
        equalTo('waiting'),
        limitToLast(PUBLIC_ROOM_CHECK_LIMIT)
      );
      snapshot = await get(waitingQuery);
    } catch {
      // インデックス未登録時の安全フォールバック（最新の20件を取得）
      snapshot = await get(
        query(roomsRef, limitToLast(PUBLIC_ROOM_CHECK_LIMIT))
      );
    }

    if (!snapshot || !snapshot.exists()) return false;

    let hasRoom = false;
    snapshot.forEach((child) => {
      const room = child.val();
      if (
        room &&
        room.status === 'waiting' &&
        room.isPublic !== false &&
        room.host?.id !== myId &&
        isHostAlive(room, now)
      ) {
        hasRoom = true;
        return true; // 1件でも見つかれば即座に走査を打ち切り
      }
    });

    return hasRoom;
  } catch (e) {
    console.error('checkHasPublicWaitingRooms error:', e);
    return false;
  }
}
