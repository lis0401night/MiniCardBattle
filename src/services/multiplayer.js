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

// ルームマッチ・クイックマッチのFirebaseルートノード定数
export const ROOMS_REF = 'rooms';
export const QUICK_MATCH_REF = 'quickMatch';

// 現在のセッションのベースパス（'rooms' または 'quickMatch'）
export let currentBasePath = ROOMS_REF;

/**
 * Firebase Realtime Database への書き込みデータから undefined を再帰的に安全処理するサニタイズ関数。
 * Firebase SDK は undefined を含むオブジェクトの書き込み時に即座に例外をスローするため、
 * undefined を除外または安全に変換して通信エラーを恒久的に防止する。
 *
 * @param {*} val - サニタイズ対象のデータ
 * @returns {*} サニタイズ済みの安全なデータ
 */
export function sanitizeForFirebase(val) {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;
  // Firebaseのセンチネルオブジェクト（serverTimestamp等）やプレーンオブジェクト以外のインスタンスは維持
  if (
    val.constructor &&
    val.constructor.name !== 'Object' &&
    !Array.isArray(val)
  ) {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForFirebase(item));
  }
  const result = {};
  for (const [key, value] of Object.entries(val)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirebase(value);
    }
  }
  return result;
}

/**
 * 現在の対戦セッションのベースパスを取得する
 * @returns {string} 'rooms' または 'quickMatch'
 */
export function getCurrentBasePath() {
  return currentBasePath;
}

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

/**
 * 復帰（リジョイン）用に内部ルーム状態を復元する
 * @param {string} roomId - ルームIDまたはマッチID
 * @param {string|null} roomCode - ルームコード
 * @param {boolean} hostFlag - ホストフラグ
 * @param {string} [basePath=ROOMS_REF] - ベースパス（rooms または quickMatch）
 */
export function restoreMultiplayerSession(
  roomId,
  roomCode,
  hostFlag,
  basePath = ROOMS_REF
) {
  currentRoomId = roomId;
  currentRoomCode = roomCode;
  isHost = hostFlag;
  currentBasePath = basePath || ROOMS_REF;
  isInBattleMode = true;
}

/** 対戦中セッションのLocalStorageキー */
export const ONLINE_ACTIVE_SESSION_KEY =
  'mini_card_battle_active_online_session';

/**
 * 進行中の対戦セッション情報をLocalStorageに保存する
 * @param {string} roomId - ルームID
 * @param {boolean} hostFlag - 自身がホストかどうか
 * @param {string} [basePath=currentBasePath] - ベースパス
 */
export function saveActiveBattleSession(
  roomId,
  hostFlag,
  basePath = currentBasePath
) {
  if (!roomId) return;
  try {
    localStorage.setItem(
      ONLINE_ACTIVE_SESSION_KEY,
      JSON.stringify({
        roomId,
        isHost: hostFlag,
        basePath: basePath || currentBasePath,
        savedAt: Date.now(),
      })
    );
  } catch (e) {
    console.warn('saveActiveBattleSession failed:', e);
  }
}

/**
 * 進行中の対戦セッション情報をクリアする
 */
export function clearActiveBattleSession() {
  try {
    localStorage.removeItem(ONLINE_ACTIVE_SESSION_KEY);
  } catch (e) {
    console.warn('clearActiveBattleSession failed:', e);
  }
}

/**
 * 保存された対戦セッション情報を取得する
 * @returns {{ roomId: string, isHost: boolean, savedAt: number }|null}
 */
export function getActiveBattleSession() {
  try {
    const raw = localStorage.getItem(ONLINE_ACTIVE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * アプリ起動時に、復帰可能な進行中の対戦ルームが存在するかどうかを確認する。
 * @returns {Promise<{ session: Object, roomData: Object }|null>} 復帰可能な場合はセッションとルーム情報、それ以外はnull
 */
export async function checkCanRejoinActiveBattle() {
  const session = getActiveBattleSession();
  if (!session || !session.roomId || !database) return null;

  try {
    const basePath = session.basePath || ROOMS_REF;
    const roomRef = ref(database, `${basePath}/${session.roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      clearActiveBattleSession();
      return null;
    }

    const roomData = snapshot.val();
    // 対戦中（status === 'battle'）かつ双方が揃っていることを確認
    if (roomData.status !== 'battle' || !roomData.host || !roomData.client) {
      clearActiveBattleSession();
      return null;
    }

    // プレイヤーの切断放置時間をチェック
    const opponent = session.isHost ? roomData.client : roomData.host;
    const me = session.isHost ? roomData.host : roomData.client;
    const now = getServerNow();

    // 相手がオフラインで切断から65秒（待機60秒＋猶予）以上経過している場合は既に不戦勝決着済みとみなす
    if (opponent && opponent.isOnline === false && opponent.disconnectedAt) {
      if (now - opponent.disconnectedAt > 65000) {
        clearActiveBattleSession();
        return null;
      }
    }

    // 自身がオフラインで切断から65秒以上経過している場合、相手側でタイムアウト（自身の不戦敗）決着済みとみなす
    if (me && me.isOnline === false && me.disconnectedAt) {
      if (now - me.disconnectedAt > 65000) {
        clearActiveBattleSession();
        return null;
      }
    }

    return {
      session,
      roomData,
    };
  } catch (e) {
    console.error('checkCanRejoinActiveBattle error:', e);
    return null;
  }
}

/** Firebaseサーバーとローカル時刻の差分（ミリ秒）。.info/serverTimeOffset で同期する */
let serverTimeOffsetMs = 0;
if (database) {
  onValue(ref(database, '.info/serverTimeOffset'), (snap) => {
    serverTimeOffsetMs = snap.val() || 0;
  });
}

/** 自身のFirebaseサーバー接続状態 */
let isFirebaseConnected = true;
const connectionListeners = new Set();

/** 対戦中フラグ（切断ハンドラーの再接続復元制御用） */
let isInBattleMode = false;

if (database) {
  onValue(ref(database, '.info/connected'), (snap) => {
    isFirebaseConnected = !!snap.val();
    connectionListeners.forEach((cb) => {
      try {
        cb(isFirebaseConnected);
      } catch (err) {
        console.error('Firebase connection listener error:', err);
      }
    });

    // 対戦中に再接続された場合、自動的に自身の isOnline を true に復旧し、切断予約を再登録する
    if (isFirebaseConnected && isInBattleMode && currentRoomId) {
      handleReconnectInBattle();
    }
  });
}

/**
 * 現在のFirebase接続状態を取得する
 * @returns {boolean} 接続中ならtrue
 */
export function getIsFirebaseConnected() {
  return isFirebaseConnected;
}

/**
 * Firebase接続状態の変更を監視する
 * @param {(connected: boolean) => void} callback
 * @returns {() => void} 購読解除関数
 */
export function subscribeFirebaseConnection(callback) {
  connectionListeners.add(callback);
  callback(isFirebaseConnected);
  return () => {
    connectionListeners.delete(callback);
  };
}

/**
 * 対戦中の再接続復帰処理。
 * 切断によって消費された onDisconnect を再登録し、自身の isOnline を true に更新する。
 */
async function handleReconnectInBattle() {
  if (!database || !currentRoomId || !isInBattleMode) return;
  const role = isHost ? 'host' : 'client';
  const myRef = ref(database, `${currentBasePath}/${currentRoomId}/${role}`);
  try {
    // 自身のオンライン状態を true に戻し、切断時刻をクリア
    await update(myRef, { isOnline: true, disconnectedAt: null });
    // 切断時の false 更新＋切断時刻記録を再予約（Firebaseは一度切断すると以前の onDisconnect が消費されるため）
    await onDisconnect(myRef).update({
      isOnline: false,
      disconnectedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('handleReconnectInBattle failed:', e);
  }
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

/** クイックマッチ終了（ended）セッションの有効期限（15分） */
export const QUICK_MATCH_ENDED_EXPIRE_MS = 15 * 60 * 1000;

/** クイックマッチ対戦中（battle）で双方オフライン時の有効期限（15分） */
export const QUICK_MATCH_DISCONNECT_EXPIRE_MS = 15 * 60 * 1000;

/** アクティブなセッションハートビートのタイマーID */
let sessionHeartbeatTimerId = null;

/**
 * 待機中セッションの定期生存信号（ハートビート）送信を開始する。
 * 5秒ごとにホスト生存信号を自動送信し、二重起動は自動防止される。
 * @param {string} roomId - 対象のルームIDまたはマッチID
 * @param {string} [basePath=currentBasePath] - ベースパス（rooms または quickMatch）
 */
export function startSessionHeartbeat(roomId, basePath = currentBasePath) {
  stopSessionHeartbeat();
  if (!roomId || !database) return;

  // 初回即時送信
  updateRoomHeartbeat(roomId, basePath);

  sessionHeartbeatTimerId = setInterval(() => {
    updateRoomHeartbeat(roomId, basePath);
  }, 5000);
}

/**
 * 待機中セッションの定期生存信号（ハートビート）送信を停止する
 */
export function stopSessionHeartbeat() {
  if (sessionHeartbeatTimerId) {
    clearInterval(sessionHeartbeatTimerId);
    sessionHeartbeatTimerId = null;
  }
}

/**
 * ホストが現在アプリを開いて待機中であることを示す生存信号（ハートビート）を更新する。
 * ルームが削除済みの場合にゾンビノードを新設しないよう、runTransaction で存在確認と更新をアトミックに行う。
 *
 * @param {string} roomId - 対象のルームIDまたはマッチID
 * @param {string} [basePath=currentBasePath] - ベースパス
 * @returns {Promise<boolean>} 更新が成功したかどうか
 */
export async function updateRoomHeartbeat(roomId, basePath = currentBasePath) {
  if (!roomId || !database) return false;
  // ローカルで退室・キャンセル済み（null 含む）の場合は送信を抑止
  if (currentRoomId !== roomId) return false;
  try {
    const roomRef = ref(database, `${basePath}/${roomId}`);
    const result = await runTransaction(roomRef, (room) => {
      // ルームが存在しない、またはホスト情報が存在しない場合はアボート（削除済みノードの再生成を防止）
      if (!room || !room.host) return undefined;
      return {
        ...room,
        host: {
          ...room.host,
          lastActiveAt: serverTimestamp(),
        },
      };
    });
    return !!result.committed;
  } catch (e) {
    console.warn(`updateRoomHeartbeat failed for ${basePath}/${roomId}:`, e);
    return false;
  }
}

/**
 * ルーム・セッションのホストが生存中（直近にハートビートを送信しているか、または作成直後であるか）を判定する。
 * @param {Object} room - ルームまたはマッチデータ
 * @param {number} [now=getServerNow()] - サーバー基準の現在のタイムスタンプ
 * @returns {boolean} ホストが生存中であればtrue
 */
export function isHostAlive(room, now = getServerNow()) {
  if (!room || !room.host) return false;
  const rawLastSeen = room.host.lastActiveAt ?? room.createdAt;
  // 作成直後などでタイムスタンプ未設定またはセンチネルオブジェクトの場合は安全のため生存と判定
  if (!rawLastSeen) return true;
  const lastSeen = Number(rawLastSeen);
  if (isNaN(lastSeen)) return true;
  const diff = now - lastSeen;
  if (isNaN(diff)) return true;
  // 端末とサーバーの時刻差で未来時刻になっている場合は生存中
  if (diff < 0) return true;
  return diff <= ROOM_HEARTBEAT_TIMEOUT_MS;
}

/**
 * クイックマッチセッションが破棄対象（期限切れ、放置、または抜け殻ゾンビノード）であるかを判定する。
 *
 * 【判定基準】
 * 1. 抜け殻（不完全ノード）:
 *    正常な部屋なら必ず存在する status または host.id が欠落している場合（親部屋削除後の子パス再生成）。
 * 2. 待機タイムアウト:
 *    status === 'waiting' かつホスト生存信号（ハートビート）が途絶えている（ROOM_HEARTBEAT_TIMEOUT_MS 超過）。
 * 3. 終了後放置:
 *    status === 'ended' かつ、終了時刻（battleEndedAt または createdAt）から QUICK_MATCH_ENDED_EXPIRE_MS（15分）以上経過。
 * 4. 双方切断放置:
 *    status === 'battle' かつ双方が offline（isOnline === false）であり、
 *    双方の disconnectedAt から QUICK_MATCH_DISCONNECT_EXPIRE_MS（15分）以上経過。
 *
 * @param {Object} data - セッションデータ
 * @param {number} [now=getServerNow()] - 判定基準時刻（ミリ秒）
 * @returns {boolean} 削除対象であれば true
 */
export function isQuickMatchExpired(data, now = getServerNow()) {
  if (!data || typeof data !== 'object') return true;

  // 1. 抜け殻・不完全ノードの判定（正常なセッションには必ず status と host.id が存在する）
  if (!data.status || !data.host?.id) {
    return true;
  }

  // 2. 待機中（waiting）セッションの判定
  if (data.status === 'waiting') {
    return !isHostAlive(data, now);
  }

  // 3. 終了済み（ended）セッションの判定
  if (data.status === 'ended') {
    const rawEndedAt = data.battleEndedAt ?? data.createdAt;
    if (!rawEndedAt) return true;
    const endedAt = Number(rawEndedAt);
    if (isNaN(endedAt)) return true;
    return now - endedAt >= QUICK_MATCH_ENDED_EXPIRE_MS;
  }

  // 4. 対戦中（battle）セッションの双方切断判定
  if (data.status === 'battle') {
    // 片方でもオンライン、または接続状態が未確定の場合は進行中とみなし絶対に削除しない
    if (data.host?.isOnline !== false || data.client?.isOnline !== false) {
      return false;
    }
    const hostDisconnectedAt = Number(data.host?.disconnectedAt);
    const clientDisconnectedAt = Number(data.client?.disconnectedAt);
    // 切断時刻が両者とも記録されていない場合は安全のため削除しない
    if (
      !hostDisconnectedAt ||
      !clientDisconnectedAt ||
      isNaN(hostDisconnectedAt) ||
      isNaN(clientDisconnectedAt)
    ) {
      return false;
    }
    const hostElapsed = now - hostDisconnectedAt;
    const clientElapsed = now - clientDisconnectedAt;
    return (
      hostElapsed >= QUICK_MATCH_DISCONNECT_EXPIRE_MS &&
      clientElapsed >= QUICK_MATCH_DISCONNECT_EXPIRE_MS
    );
  }

  // 上記以外の状態（未定義ステータス等）は安全のため削除対象外とする
  return false;
}

/**
 * 対象ノードの最新スナップショットを事前に同期（preload）し、ローカルキャッシュを確定させる共通ヘルパー関数。
 *
 * 【設計背景】
 * Firebase Realtime Database の runTransaction は、対象パスのローカルキャッシュが存在しない場合、
 * サーバー問い合わせ前に初回呼び出しが `null` で即時評価される仕様を持つ。
 * そのため、ノードの存在を厳格に要求するトランザクション処理（if (!match) return undefined;）において、
 * サーバーへリクエストが送信される前に自己中断（アボート）されてしまう重大な問題が発生する。
 * 本関数は一時的な onValue リスナーを確立してサーバー上の最新状態を確実に同期し、
 * トランザクションが正確な実データに基づいてアトミックに実行されることを保証する。
 *
 * @param {import('firebase/database').DatabaseReference} targetRef - 対象ノードのFirebase参照
 * @param {number} [timeoutMs=3000] - サーバー応答待機の最大許容時間（ミリ秒）
 * @returns {Promise<{ snapVal: any, unsubscribe: function(): void }>} 取得された最新データ値とリスナー解除関数のペア
 */
export async function preloadNodeSnapshot(targetRef, timeoutMs = 3000) {
  let unsubscribe = null;
  const snapVal = await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    unsubscribe = onValue(
      targetRef,
      (snap) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(snap.val());
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    );
  });

  return {
    snapVal,
    unsubscribe: () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
        unsubscribe = null;
      }
    },
  };
}

/**
 * セッション本体（および必要に応じて6桁コードインデックス）を安全に削除する共通処理
 * @param {string} roomId - 削除対象のルームIDまたはマッチID
 * @param {Object} [options] - オプション
 * @param {string} [options.basePath=currentBasePath] - ベースパス
 * @param {string} [options.roomCode=null] - 削除対象の6桁ルームコード
 * @returns {Promise<void>}
 */
export async function removeSessionNode(
  roomId,
  { basePath = currentBasePath, roomCode = null } = {}
) {
  if (!database || !roomId) return;
  if (basePath === ROOMS_REF) {
    const updates = {
      [`${ROOMS_REF}/${roomId}`]: null,
    };
    if (roomCode) {
      updates[`roomCodeIndex/${roomCode}`] = null;
    }
    await update(ref(database), updates);
  } else {
    await remove(ref(database, `${basePath}/${roomId}`)).catch(() => {});
  }
}

/**
 * 指定したベースパス（rooms または quickMatch）において、
 * 特定ユーザーがホストしている過去の未完了待機部屋を一括走査して確実に削除する共通処理。
 * @param {string} [basePath=currentBasePath] - ベースパス
 * @param {string} [userId=getOrCreateUUID()] - ユーザーUUID
 * @returns {Promise<void>}
 */
export async function cleanupUserSessions(
  basePath = currentBasePath,
  userId = getOrCreateUUID()
) {
  if (!database) return;
  try {
    const targetRef = ref(database, basePath);
    const snapshot = await get(targetRef);
    if (!snapshot || !snapshot.exists()) return;

    const deletePromises = [];
    snapshot.forEach((child) => {
      const data = child.val();
      if (data && data.host?.id === userId && data.status === 'waiting') {
        deletePromises.push(
          removeSessionNode(child.key, {
            basePath,
            roomCode: data.roomCode || null,
          })
        );
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }
  } catch (e) {
    console.warn(`cleanupUserSessions failed for ${basePath}:`, e);
  }
}

/**
 * 指定したベースパスにおいて、ホスト生存信号（ハートビート）が途絶えた放置部屋や抜け殻ゾンビノードを一括検出し、安全に削除する共通処理。
 * @param {string} [basePath=currentBasePath] - ベースパス
 * @returns {Promise<void>}
 */
export async function cleanupExpiredSessions(basePath = currentBasePath) {
  if (!database) return;
  try {
    const targetRef = ref(database, basePath);
    const snapshot = await get(targetRef);
    if (!snapshot || !snapshot.exists()) return;

    const now = getServerNow();
    const cleanupPromises = [];

    snapshot.forEach((child) => {
      const data = child.val();
      const shouldDelete =
        basePath === QUICK_MATCH_REF
          ? isQuickMatchExpired(data, now)
          : data && data.status === 'waiting' && !isHostAlive(data, now);

      if (shouldDelete) {
        cleanupPromises.push(
          removeSessionNode(child.key, {
            basePath,
            roomCode: data?.roomCode || null,
          })
        );
      }
    });

    if (cleanupPromises.length > 0) {
      await Promise.all(cleanupPromises);
    }
  } catch (e) {
    console.warn(`cleanupExpiredSessions failed for ${basePath}:`, e);
  }
}

// リスナー解除用関数
let roomListenerUnsubscribe = null;
export let cachedRoomData = null;

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
 * @param {string} [roomCode=null] - 削除対象の6桁ルームコード
 * @returns {Promise<void>}
 */
async function removeRoomAndCode(roomId, roomCode = null) {
  return removeSessionNode(roomId, { basePath: ROOMS_REF, roomCode });
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

  // 既存の自分が作った古い待機ルーム（ゴミ）を一括クリーンアップ
  await cleanupUserSessions(ROOMS_REF, uuid);

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

  currentBasePath = ROOMS_REF;
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

  // 対象ルームの最新データを事前に同期（preload）して存在確認とローカルキャッシュを確定
  const { snapVal: initialRoom, unsubscribe } =
    await preloadNodeSnapshot(roomRef);

  try {
    if (
      !initialRoom ||
      initialRoom.status !== 'waiting' ||
      initialRoom.client
    ) {
      throw new Error(
        '指定されたルームは見つからないか、既に対戦中・満員です。'
      );
    }

    let attempts = 0;
    // 1回の原子的トランザクションで参加状態（status === 'waiting' && client == null）を確認して参加更新を実行
    const result = await runTransaction(roomRef, (room) => {
      attempts++;
      // 初回未キャッシュ時の null を事前同期データで安全に補完
      const current = room || (attempts === 1 ? initialRoom : null);
      if (!current || current.status !== 'waiting' || current.client) {
        return undefined; // 条件を満たさない場合はトランザクションを中断してコミットしない
      }
      return {
        ...current,
        status: 'playing',
        client: clientInfo,
        battleSeed: Date.now(),
      };
    });

    if (!result.committed || !result.snapshot?.exists()) {
      throw new Error(
        '指定されたルームは見つからないか、既に対戦中・満員です。'
      );
    }

    currentBasePath = ROOMS_REF;
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
  } finally {
    unsubscribe();
  }
}

/**
 * ルームの変更（相手の入室、アクション追加、切断など）を監視する
 */
export function listenToRoom(roomId) {
  if (!database) return;

  if (roomListenerUnsubscribe) {
    roomListenerUnsubscribe();
  }

  const roomRef = ref(database, `${currentBasePath}/${roomId}`);
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

/**
 * バトル中のアクションを監視する。
 * @param {Function} onActionReceived - アクション受信時コールバック ({ action, actor, timestamp }, actionKey: string) => void
 * @param {Set<string>|null} [ignoredActionKeys=null] - 復帰（リジョイン）時にスキップする既存アクションIDのSet。過去ログの多重再実行を防止する。
 */
export function listenToRoomActions(
  onActionReceived,
  ignoredActionKeys = null
) {
  if (!database || !currentRoomId) return;

  if (onlineActionUnsubscribe) {
    onlineActionUnsubscribe();
    onlineActionUnsubscribe = null;
  }

  const actionsRef = ref(
    database,
    `${currentBasePath}/${currentRoomId}/actions`
  );
  // Firebase v9 Modular APIでは、onChildAddedは直接Unsubscribe関数を返します
  onlineActionUnsubscribe = onChildAdded(actionsRef, (snapshot) => {
    // 復帰時に既に存在していた過去アクションは二重実行を防ぐためスキップ
    if (ignoredActionKeys && ignoredActionKeys.has(snapshot.key)) {
      return;
    }

    const val = snapshot.val();
    if (onActionReceived && val) {
      onActionReceived(val, snapshot.key);
    }
  });
}

export function stopListeningToRoomActions() {
  if (onlineActionUnsubscribe) {
    onlineActionUnsubscribe();
    onlineActionUnsubscribe = null;
  }
}

/**
 * オンライン対戦のアクションをFirebase RTDBへ送信する。
 * undefinedによるFirebaseの例外発生を防ぐため、ペイロードを安全に正規化して送信する。
 * @param {Object} action - 送信するアクションオブジェクト
 * @returns {Promise<void>}
 */
export async function sendOnlineAction(action) {
  if (!database || !currentRoomId || !action) return;
  // undefined を安全に除去してFirebaseのエラーを防止
  const sanitizedAction = JSON.parse(JSON.stringify(action));
  const actionsRef = ref(
    database,
    `${currentBasePath}/${currentRoomId}/actions`
  );
  await push(actionsRef, {
    actor: isHost ? 'host' : 'client',
    action: sanitizedAction,
    timestamp: serverTimestamp(),
  });
}

/**
 * ホストが最新の完全盤面スナップショットをルーム直下（rooms/{roomId}/lastSyncState）に保存する。
 * アプリ落ち復帰時の高速リストアに使用する。
 * undefinedによるFirebase例外を防ぐためサニタイズして保存する。
 * @param {Object} state - 同期用ステートオブジェクト
 * @param {string|null} [lastActionKey=null] - 反映済みの最新アクションキー（Firebase Push ID）
 * @returns {Promise<void>}
 */
export async function saveLastSyncStateToRoom(state, lastActionKey = null) {
  if (!database || !currentRoomId || !isHost || !state) return;
  try {
    const syncRef = ref(
      database,
      `${currentBasePath}/${currentRoomId}/lastSyncState`
    );
    const sanitizedState = JSON.parse(JSON.stringify(state));
    await set(syncRef, {
      ...sanitizedState,
      lastActionKey: lastActionKey ?? state.lastActionKey ?? null,
      savedAt: getServerNow(),
    });
  } catch (e) {
    console.warn('saveLastSyncStateToRoom failed:', e);
  }
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
    `${currentBasePath}/${currentRoomId}/${isHost ? 'host' : 'client'}`
  );
  await update(pRef, {
    leaderConfig: sanitizeForFirebase(config),
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
    `${currentBasePath}/${currentRoomId}/${isHost ? 'host' : 'client'}`
  );
  await update(pRef, {
    isReady: isReadyStatus,
  });
}

/**
 * 対戦開始時に対戦用の切断ポリシー（即時部屋削除・追い出しの解除と isOnline 状態管理）を設定する。
 * ホスト・クライアント双方で呼び出され、電波瞬断時の部屋存続と復帰待機を実現する。
 */
export async function setupBattleDisconnectHandlers() {
  if (!database || !currentRoomId) return;
  isInBattleMode = true;

  const roomId = currentRoomId;
  const roomCode = currentRoomCode;
  const roomRef = ref(database, `${currentBasePath}/${roomId}`);
  const role = isHost ? 'host' : 'client';
  const myRef = ref(database, `${currentBasePath}/${roomId}/${role}`);

  try {
    // 1. ロビー待機用の即時削除・即時退出予約を安全に解除
    await onDisconnect(roomRef)
      .cancel()
      .catch(() => {});
    if (isHost && roomCode) {
      const codeRef = ref(database, `roomCodeIndex/${roomCode}`);
      await onDisconnect(codeRef)
        .cancel()
        .catch(() => {});
    }

    // 2. 対戦用：切断時に部屋を消さず、自身の isOnline を false に設定し、
    //    切断時刻（disconnectedAt）も記録する切断予約を登録
    await onDisconnect(myRef).update({
      isOnline: false,
      disconnectedAt: serverTimestamp(),
    });
    // 3. 現在のオンライン状態を明示的に true に設定
    await update(myRef, { isOnline: true, disconnectedAt: null });
  } catch (e) {
    console.error('setupBattleDisconnectHandlers failed:', e);
  }
}

/**
 * 対戦終了時またはロビー戻り時に、ロビー用の切断ポリシー（ホスト切断＝部屋削除、クライアント切断＝待機戻り）へ復元する。
 */
export async function restoreLobbyDisconnectHandlers() {
  if (!database || !currentRoomId) {
    isInBattleMode = false;
    return;
  }
  isInBattleMode = false;

  const roomId = currentRoomId;
  const roomCode = currentRoomCode;
  const roomRef = ref(database, `${currentBasePath}/${roomId}`);
  const role = isHost ? 'host' : 'client';
  const myRef = ref(database, `${currentBasePath}/${roomId}/${role}`);

  try {
    // 1. 対戦用の切断予約（isOnline + disconnectedAt）を解除
    await onDisconnect(myRef)
      .cancel()
      .catch(() => {});

    // 2. ロビー用の切断予約を再登録
    if (isHost) {
      await onDisconnect(roomRef)
        .remove()
        .catch(() => {});
      if (roomCode) {
        const codeRef = ref(database, `roomCodeIndex/${roomCode}`);
        await onDisconnect(codeRef)
          .remove()
          .catch(() => {});
      }
    } else {
      await onDisconnect(roomRef)
        .update({
          status: 'waiting',
          client: null,
        })
        .catch(() => {});
    }
  } catch (e) {
    console.warn('restoreLobbyDisconnectHandlers failed:', e);
  }
}

/**
 * 対戦用に設定された切断時ハンドラー（onDisconnect(myRef)）を安全に解除する。
 * 対戦終了時、リタイア時、または退室時に呼び出され、親部屋ノード削除後にブラウザを閉じた際、
 * 子ノード（host または client）が自動再生成されてゾンビ化する現象を完全に防止する。
 *
 * @param {string} [roomId=currentRoomId] - 対象のルームID
 * @param {string} [basePath=currentBasePath] - ベースパス
 * @param {boolean} [asHost=isHost] - ホストかどうか
 * @returns {Promise<void>}
 */
export async function cancelBattleDisconnectHandlers(
  roomId = currentRoomId,
  basePath = currentBasePath,
  asHost = isHost
) {
  if (!database || !roomId) return;
  const role = asHost ? 'host' : 'client';
  const myRef = ref(database, `${basePath}/${roomId}/${role}`);
  try {
    await onDisconnect(myRef).cancel();
  } catch (e) {
    console.warn('cancelBattleDisconnectHandlers failed:', e);
  }
}

/**
 * 対戦開始時にルームのステータスを 'battle' に更新する（ホスト専用）
 * 両プレイヤーが準備完了した際、DB上に対戦開始フラグを書き込み確実な追いつき同期を実現します。
 * トランザクションにより、ステータス変更と isReady フラグの消費（false 化）を原子的に実行し、
 * 対戦終了後にロビーへ戻った際の残存データ（status:'battle', isReady:true）による
 * 誤った即時再試合の発火を防止します。
 * @returns {Promise<object|null>} コミット成功時は最新のルームデータ、失敗・中断時は null
 */
export async function setRoomStatusToBattle() {
  if (!currentRoomId || !database || !isHost) return null;
  const roomRef = ref(database, `${currentBasePath}/${currentRoomId}`);
  const result = await runTransaction(roomRef, (room) => {
    // ルームが存在しない、または双方の準備完了が確認できない場合はコミットしない
    if (
      !room ||
      !room.host?.isReady ||
      !room.client?.isReady ||
      !Number.isFinite(room.battleSeed)
    )
      return undefined;
    return {
      ...room,
      status: 'battle',
      battleStartedAt: getServerNow(),
      host: {
        ...room.host,
        isReady: false,
        isOnline: true,
      },
      client: {
        ...room.client,
        isReady: false,
        isOnline: true,
      },
    };
  });

  if (result && result.committed) {
    // ホスト側の対戦用切断ポリシー（即時削除の解除と isOnline 管理）を即時適用
    await setupBattleDisconnectHandlers();
    saveActiveBattleSession(currentRoomId, true);
    return result.snapshot.val();
  }
  return null;
}

/**
 * 対戦終了時にルームのステータスを 'waiting' に戻し、準備完了状態をクリアする
 * 存在しない client ノードを誤って再生成しないよう安全に判定して更新する
 * @returns {Promise<void>}
 */
export async function resetRoomStatusToWaiting() {
  clearActiveBattleSession();
  if (!currentRoomId || !database) return;
  const roomRef = ref(database, `${currentBasePath}/${currentRoomId}`);
  if (isHost) {
    await runTransaction(roomRef, (room) => {
      if (!room) return undefined;
      const next = {
        ...room,
        status: 'waiting',
        battleStartedAt: null, // 対戦終了を明示し、ロビーの追いつき同期の誤発火を防止
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

  // 対戦終了後はロビー用の切断時ポリシー（部屋削除 / 退室）へ復元
  await restoreLobbyDisconnectHandlers();
}

/**
 * クイックマッチ対戦終了時にセッションステータスを 'ended' に更新する
 * ルームを waiting に戻さないことで、戦闘後会話中などに第三者が誤ってマッチングすることを完全に防止する
 * @returns {Promise<void>}
 */
export async function markQuickMatchEnded() {
  clearActiveBattleSession();
  if (!currentRoomId || !database) return;
  const matchRef = ref(database, `${currentBasePath}/${currentRoomId}`);
  try {
    if (isHost) {
      await update(matchRef, {
        status: 'ended',
        battleEndedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('markQuickMatchEnded failed:', e);
  } finally {
    // 対戦終了後は復帰待機が不要となるため、通信の成否に関わらず対戦中の切断時予約（isOnline: false 等）を確実に解除
    // （対戦後会話中やリザルト表示中にブラウザを閉じた際の子ノード自動再生成・ゾンビ化を防止）
    await cancelBattleDisconnectHandlers();
  }
}

/**
 * リマッチに向けてアクションキューを初期化し、新しいシードをセットする（ホスト専用）
 */
export async function clearActionQueueAndRegenerateSeed() {
  if (!currentRoomId || !database || !isHost) return;
  const roomRef = ref(database, `${currentBasePath}/${currentRoomId}`);
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
  const chatRef = ref(database, `${currentBasePath}/${currentRoomId}/chat`);
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
  clearActiveBattleSession();
  stopSessionHeartbeat();

  if (!currentRoomId || !database) return;

  const roomId = currentRoomId;
  const roomCode = currentRoomCode;
  const wasHost = isHost;
  const leavingBasePath = currentBasePath;

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
  isInBattleMode = false;
  currentBasePath = ROOMS_REF;

  const sessionRef = ref(database, `${leavingBasePath}/${roomId}`);
  const codeRef =
    leavingBasePath === ROOMS_REF && roomCode
      ? ref(database, `roomCodeIndex/${roomCode}`)
      : null;

  try {
    if (wasHost) {
      // 1. ホストの場合：セッション本体（および必要に応じて6桁コードインデックス）を安全に削除
      await removeSessionNode(roomId, {
        basePath: leavingBasePath,
        roomCode,
      });
    } else {
      // 1. ゲストの場合の退室処理
      if (leavingBasePath === ROOMS_REF) {
        // ルームマッチ: ロビーで再募集するためステータスを waiting に戻し、client を null にクリア
        await update(sessionRef, {
          status: 'waiting',
          client: null,
        });
      } else {
        // クイックマッチ: 1戦完結型のため、セッションが存在する場合のみ ended 状態を維持して client を外す
        // （削除済みの場合に waiting ノードが再生成されたり、第三者が誤マッチングする事故を防止）
        await runTransaction(sessionRef, (s) => {
          if (!s) return undefined;
          return {
            ...s,
            status: 'ended',
            client: null,
          };
        });
      }
    }

    // 2. 明示的な退室・解散が完了した後、不要になった切断時自動削除/更新の予約を解除する
    try {
      await onDisconnect(sessionRef)
        .cancel()
        .catch(() => {});
      if (codeRef) {
        await onDisconnect(codeRef)
          .cancel()
          .catch(() => {});
      }
      // 対戦中に設定された自身の子ノード（host/client）の切断予約を確実に解除（親ノード削除後のゾンビ復活防止）
      await cancelBattleDisconnectHandlers(roomId, leavingBasePath, wasHost);
    } catch (disconnectError) {
      console.warn('切断時予約の解除に失敗しました:', disconnectError);
    }
  } catch (e) {
    console.error(`leaveRoom failed on ${leavingBasePath}:`, e);
    // 正常退室処理に失敗した場合は、ホストの場合のみ切断時自動削除の予約を再設定します
    try {
      if (wasHost) {
        await onDisconnect(sessionRef)
          .remove()
          .catch(() => {});
        if (codeRef) {
          await onDisconnect(codeRef)
            .remove()
            .catch(() => {});
        }
      }
      // 自身の子ノードの対戦中予約は安全のため確実に解除
      await cancelBattleDisconnectHandlers(roomId, leavingBasePath, wasHost);
    } catch (disconnectError) {
      console.warn('Failed to re-register onDisconnect:', disconnectError);
    }
    throw e;
  }
}

/**
 * 例外を安全にキャッチして退室・解散処理を実行するラッパー関数
 * @param {string} [errorMessage='退室処理に失敗しました:'] - エラーログ出力用のプレフィックス
 * @returns {Promise<void>}
 */
export async function safeLeaveRoom(errorMessage = '退室処理に失敗しました:') {
  try {
    await leaveRoom();
  } catch (e) {
    console.error(errorMessage, e);
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

// --- Quick Match System ---

/**
 * クイックマッチのマッチングを開始する。
 * Firebaseの /quickMatch 配下の待機エントリを探索し、
 * 待機中のプレイヤーがいれば参加して直接対戦を開始、いなければ自身が待機エントリを作成して相手の参加を待つ。
 *
 * @param {string} playerName - プレイヤー名
 * @param {Object} myLeaderConfig - 自身のリーダー・デッキ設定
 * @param {function(Object): void} onMatched - マッチング成立時のコールバック
 * @param {function(string): void} [onWaiting] - 待機開始時のコールバック
 * @returns {Promise<{ isHost: boolean, roomId: string }>}
 */
export async function startQuickMatch(
  playerName,
  myLeaderConfig,
  onMatched,
  onWaiting
) {
  if (!database) throw new Error('Firebase not initialized');

  const uuid = getOrCreateUUID();
  const qmRef = ref(database, QUICK_MATCH_REF);
  const now = getServerNow();
  // Firebase 書き込み用に undefined を除外・サニタイズしたリーダー設定
  const safeLeaderConfig = sanitizeForFirebase(myLeaderConfig);

  // 1. 待機中のクイックマッチエントリを探索
  let matchedMatchId = null;
  let matchedMatchData = null;

  try {
    // 探索前に自身の過去の古い待機エントリおよび期限切れ放置エントリを一括クリーンアップ
    await cleanupUserSessions(QUICK_MATCH_REF, uuid);
    await cleanupExpiredSessions(QUICK_MATCH_REF);

    const qmSnap = await get(qmRef);

    if (qmSnap && qmSnap.exists()) {
      const candidates = [];

      qmSnap.forEach((child) => {
        const match = child.val();
        if (
          match &&
          match.status === 'waiting' &&
          !match.client &&
          match.host?.id !== uuid &&
          isHostAlive(match, now)
        ) {
          candidates.push({ matchId: child.key, ...match });
        }
      });

      // 古い（先に待機している）順にマッチングを試みる
      candidates.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      for (const candidate of candidates) {
        const targetMatchRef = ref(
          database,
          `${QUICK_MATCH_REF}/${candidate.matchId}`
        );
        const clientInfo = {
          id: uuid,
          name: playerName || 'Player 2',
          icon: resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY)),
          isReady: true,
          leaderConfig: safeLeaderConfig,
          isOnline: true,
          lastActiveAt: getServerNow(),
        };

        // 相手の部屋ノードを事前に同期（preload）し、ローカルキャッシュを満たすと共に最新の実在性を検証
        const { snapVal: latestMatch, unsubscribe } =
          await preloadNodeSnapshot(targetMatchRef);

        try {
          // サーバー上で既に削除・キャンセルされている、または待機中でない場合は安全にスキップ（削除済みノードの誤再生成を完全に防止）
          if (
            !latestMatch ||
            latestMatch.status !== 'waiting' ||
            latestMatch.client
          ) {
            continue;
          }

          let attempts = 0;
          const result = await runTransaction(targetMatchRef, (match) => {
            attempts++;
            // 初回呼び出し時、万が一未キャッシュの null が渡った場合でも事前同期済みの latestMatch で安全にフォールバック
            const current = match || (attempts === 1 ? latestMatch : null);
            if (!current || current.status !== 'waiting' || current.client) {
              return undefined;
            }
            return {
              ...current,
              status: 'battle',
              battleStartedAt: getServerNow(),
              battleSeed: Date.now(),
              client: clientInfo,
            };
          });

          if (result.committed && result.snapshot?.exists()) {
            matchedMatchId = candidate.matchId;
            matchedMatchData = result.snapshot.val();
            break;
          }
        } finally {
          unsubscribe();
        }
      }
    }
  } catch (err) {
    console.warn('Quick match search warning:', err);
  }

  // 2. 待機部屋に参加成功した場合（クライアント側として対戦開始）
  if (matchedMatchId && matchedMatchData) {
    currentBasePath = QUICK_MATCH_REF;
    currentRoomId = matchedMatchId;
    currentRoomCode = null;
    isHost = false;

    // 対戦中の切断ハンドラーを設定
    await setupBattleDisconnectHandlers();
    saveActiveBattleSession(currentRoomId, false, QUICK_MATCH_REF);
    listenToRoom(currentRoomId);

    if (onMatched) {
      onMatched(matchedMatchData);
    }
    return { isHost: false, roomId: currentRoomId };
  }

  // 3. 待機部屋がない場合、ホストとして新しい待機エントリを作成して相手を待つ
  // 作成前に念のため自身の過去の待機エントリがあれば確実に削除
  await cleanupUserSessions(QUICK_MATCH_REF, uuid);

  const newMatchRef = push(qmRef);
  const matchId = newMatchRef.key;
  const rngSeed = Math.floor(Math.random() * 100000000).toString();

  const hostInfo = {
    id: uuid,
    name: playerName || 'Player 1',
    icon: resolveValidIconId(localStorage.getItem(PROFILE_ICON_KEY)),
    isReady: true,
    leaderConfig: safeLeaderConfig,
    isOnline: true,
    lastActiveAt: serverTimestamp(),
  };

  try {
    // 待機中の切断時はエントリを自動削除するよう予約
    await onDisconnect(newMatchRef).remove();

    await set(newMatchRef, {
      status: 'waiting',
      createdAt: serverTimestamp(),
      rngSeed: rngSeed,
      host: hostInfo,
      client: null,
      actionQueue: {},
    });
  } catch (err) {
    await remove(newMatchRef).catch(() => {});
    throw err;
  }

  currentBasePath = QUICK_MATCH_REF;
  currentRoomId = matchId;
  currentRoomCode = null;
  isHost = true;

  // 相手の参加（status === 'battle'）を監視するリスナーを設定
  let matchHandled = false;
  multiplayerCallbacks.onRoomUpdated = async (data) => {
    if (matchHandled) return;
    if (data?.status === 'battle' && data.client && data.client.leaderConfig) {
      matchHandled = true;
      // 対戦用の切断ハンドラーを適用
      await setupBattleDisconnectHandlers();
      saveActiveBattleSession(currentRoomId, true, QUICK_MATCH_REF);

      if (onMatched) {
        onMatched(data);
      }
    }
  };

  listenToRoom(currentRoomId);

  if (onWaiting) {
    onWaiting(matchId);
  }

  return { isHost: true, roomId: matchId };
}

/**
 * クイックマッチ待機をキャンセルし、待機エントリを安全に削除する統一ラッパー関数
 */
export async function cancelQuickMatch() {
  stopSessionHeartbeat();
  await safeLeaveRoom('クイックマッチのキャンセル処理に失敗しました:');
  // 念のため自身の過去の未完了待機エントリがあれば一掃
  await cleanupUserSessions(QUICK_MATCH_REF);
}
