// ==========================================
// オンライン対戦 選択結果（submitChoice）同期モジュール
//
// オンライン対戦では、同じアクション（カードプレイ・ターン終了・リーダースキル）を
// 両端末がそれぞれ決定論的に実行し、プレイヤーの「選択」だけを Firebase 経由で送受信する。
//
// 以前は選択結果を種類・順番の情報なしで FIFO キューに積んでいたため、
// 送信回数と受信待ち回数が一度でもずれると（時間切れ後の遅延到着など）、
// 以降の選択がすべて 1 つずつずれて別の選択として解釈され、盤面が乖離していた。
//
// 本モジュールでは、各選択に以下の識別情報を付与して照合する。
//   - choiceScope : 選択が発生したアクションの Firebase アクションキー（両端末で同一）
//   - choiceSeq   : そのアクション内で、送信側プレイヤーが行った何回目の選択か（1始まり）
//   - choiceKind  : 選択の種類（レーン選択・手札選択・スキル選択・上書き確認など）
// 受信側は「現在処理中のアクション」「待っている順番」「待っている種類」と一致するものだけを受け取り、
// 古い選択（終了済みアクションのもの・時間切れで代替済みのもの）は破棄する。
// ==========================================

import { GameState } from '../../state/gameState.js';
import { sendOnlineAction } from '../../services/multiplayer.js';
import { checkIsOnlineMode } from '../../utils/gameUtils.js';

/** アクション処理の外側（マリガン等）で発生する選択に使用するスコープ名 */
export const NO_CHOICE_SCOPE = '__no_action__';

/** 選択データの種類（送信側と受信側で一致しなければ受け取らない） */
export const CHOICE_KIND = Object.freeze({
  /** 自分のレーンへの配置・召喚先選択（waitPlayerLaneSelection） */
  LANE: 'lane',
  /** 相手のレーン選択（waitPlayerEnemyLaneSelection） */
  ENEMY_LANE: 'enemyLane',
  /** 自分のカードがあるレーンの選択（waitPlayerAlliedLaneSelection） */
  ALLIED_LANE: 'alliedLane',
  /** 手札選択（waitPlayerHandSelection） */
  HAND: 'hand',
  /** 墓地・デッキ等からのカード選択（waitPlayerDiscardSelection） */
  DISCARD: 'discard',
  /** 自分と相手の墓地からの選択（waitPlayerDualDiscardSelection） */
  DUAL_DISCARD: 'dualDiscard',
  /** 「選択」「命令」スキルの選択肢選択（waitSkillChoice） */
  SKILL: 'skill',
  /** 既存カードへの上書き確認（confirmOverwrittenLane） */
  CONFIRM: 'confirm',
});

/** 選択スコープを割り当てるアクション種別（選択が発生しうるアクションのみ。ホワイトリスト方式） */
export const CHOICE_SCOPED_ACTION_TYPES = Object.freeze([
  'playCard',
  'endTurn',
  'leaderSkill',
]);

/** 終了済みスコープを保持する上限数（長時間対戦でのメモリ肥大を防ぐ） */
const MAX_FINISHED_SCOPES = 500;

/** 現在処理中のアクションに対応する選択スコープ */
let currentScope = NO_CHOICE_SCOPE;

/** スコープごとの「自分が送信した選択の回数」 */
const sentSeqByScope = new Map();

/** スコープごとの「相手の選択を受け取った（または代替値で確定した）回数」 */
const consumedSeqByScope = new Map();

/** 処理が完了したスコープ（このスコープ宛ての選択が後から届いた場合は破棄する） */
const finishedScopes = new Set();

/**
 * 現在待機中の相手選択リクエスト。
 * @type {{ scope: string, seq: number, kind: string, resolve: (value: *) => void } | null}
 */
let waitingRequest = null;

/**
 * 受信済み選択の保管キューを取得する（未初期化なら初期化する）。
 * @returns {Array<object>} 受信済み選択エンベロープの配列
 */
function getChoiceQueue() {
  if (!Array.isArray(GameState.pendingChoices)) GameState.pendingChoices = [];
  return GameState.pendingChoices;
}

/**
 * スコープ単位のカウンタを 1 進めて新しい値を返す。
 * @param {Map<string, number>} counterMap - 対象のカウンタ
 * @param {string} scope - 選択スコープ
 * @returns {number} 加算後の値（1始まり）
 */
function incrementScopeCounter(counterMap, scope) {
  const next = (counterMap.get(scope) || 0) + 1;
  counterMap.set(scope, next);
  return next;
}

/**
 * 選択スコープを開始する。アクション処理の直前に呼び出す。
 * @param {string|null|undefined} actionKey - 処理するアクションの Firebase アクションキー
 * @returns {void}
 */
export function beginChoiceScope(actionKey) {
  currentScope = actionKey || NO_CHOICE_SCOPE;
}

/**
 * 現在の選択スコープを終了する。アクション処理の完了後（例外時含む）に呼び出す。
 * 終了したスコープ宛ての未消費の選択はキューから破棄する。
 * @returns {void}
 */
export function endChoiceScope() {
  const scope = currentScope;
  currentScope = NO_CHOICE_SCOPE;
  // マリガン等のスコープなし選択は対戦中に繰り返し使われるため終了扱いにしない
  if (scope === NO_CHOICE_SCOPE) return;

  finishedScopes.add(scope);
  sentSeqByScope.delete(scope);
  consumedSeqByScope.delete(scope);

  // 上限を超えた古いスコープ記録から削除（Set は挿入順を保持する）
  while (finishedScopes.size > MAX_FINISHED_SCOPES) {
    const oldest = finishedScopes.values().next().value;
    finishedScopes.delete(oldest);
  }

  // 終了済みスコープ宛ての未消費選択を破棄
  const queue = getChoiceQueue();
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!queue[i].legacy && queue[i].scope === scope) {
      console.warn(
        '[onlineChoiceSync] 処理済みアクションの未消費の選択を破棄しました:',
        queue[i]
      );
      queue.splice(i, 1);
    }
  }
}

/**
 * 自分の選択結果を相手端末へ送信する（オンライン対戦時のみ）。
 * 送信のたびに現在スコープの送信回数を 1 進め、順番と種類を付与する。
 * @param {string} kind - 選択の種類（CHOICE_KIND の値）
 * @param {*} choiceData - 送信する選択データ
 * @returns {Promise<void>}
 */
export async function submitLocalChoice(kind, choiceData) {
  if (!checkIsOnlineMode(GameState.gameMode)) return;
  const scope = currentScope;
  const seq = incrementScopeCounter(sentSeqByScope, scope);
  await sendOnlineAction({
    type: 'submitChoice',
    owner: 'blue',
    choiceData,
    choiceScope: scope,
    choiceSeq: seq,
    choiceKind: kind,
  });
}

/**
 * 待機中リクエストへ受信済み選択を引き渡せるか照合し、可能なら引き渡す。
 * 照合ルール:
 *   - 終了済みスコープ宛て → 古い選択として破棄
 *   - 別スコープ宛て → 後続アクションの選択として保留
 *   - 同一スコープで順番が待機中より前 → 時間切れで代替済みの古い選択として破棄
 *   - 同一スコープで順番が同じ・種類が不一致 → 処理経路の食い違いとして破棄
 *   - 同一スコープで順番が同じ以降・種類が一致 → 受け取る（順番が飛んだ場合はカウンタを追従させる）
 *   - 同一スコープで順番が後・種類が不一致 → 後続の選択として保留
 * @returns {void}
 */
function tryDeliverRemoteChoice() {
  if (!waitingRequest) return;
  const queue = getChoiceQueue();
  const req = waitingRequest;

  let i = 0;
  while (i < queue.length) {
    const entry = queue[i];

    // 識別情報を持たない旧形式の選択は従来通り先頭から受け取る（バージョン混在時の互換）
    if (entry.legacy) {
      queue.splice(i, 1);
      waitingRequest = null;
      req.resolve(entry.data);
      return;
    }

    if (finishedScopes.has(entry.scope)) {
      console.warn(
        '[onlineChoiceSync] 処理済みアクション宛ての選択を破棄しました:',
        entry
      );
      queue.splice(i, 1);
      continue;
    }

    if (entry.scope !== req.scope) {
      i++;
      continue;
    }

    if (entry.seq < req.seq) {
      console.warn(
        '[onlineChoiceSync] 代替値で確定済みの古い選択を破棄しました:',
        entry
      );
      queue.splice(i, 1);
      continue;
    }

    if (entry.kind !== req.kind) {
      if (entry.seq === req.seq) {
        console.warn(
          `[onlineChoiceSync] 選択の種類が一致しないため破棄しました（待機: ${req.kind}）:`,
          entry
        );
        queue.splice(i, 1);
        continue;
      }
      i++;
      continue;
    }

    if (entry.seq > req.seq) {
      console.warn(
        `[onlineChoiceSync] 選択の順番が飛んでいるため追従します（待機: ${req.seq}）:`,
        entry
      );
      consumedSeqByScope.set(req.scope, entry.seq);
    }
    queue.splice(i, 1);
    waitingRequest = null;
    req.resolve(entry.data);
    return;
  }
}

/**
 * 相手端末から届いた選択結果（submitChoice アクション）を受け付ける。
 * @param {object} action - 受信した submitChoice アクション
 * @returns {void}
 */
export function receiveRemoteChoice(action) {
  // Firebase は空配列を保存しないため、未定義の場合は空文字列として扱う
  const data = action.choiceData !== undefined ? action.choiceData : '';
  const hasMeta =
    action.choiceSeq !== undefined && action.choiceKind !== undefined;

  getChoiceQueue().push(
    hasMeta
      ? {
          scope: action.choiceScope || NO_CHOICE_SCOPE,
          seq: Number(action.choiceSeq),
          kind: action.choiceKind,
          data,
          legacy: false,
        }
      : { data, legacy: true }
  );
  tryDeliverRemoteChoice();
}

/**
 * 相手プレイヤーの選択結果を待機する。
 * 待機開始時点で現在スコープの受信回数を 1 進め、その順番・種類に一致する選択のみを受け取る。
 * @param {string} kind - 待機する選択の種類（CHOICE_KIND の値）
 * @returns {Promise<*>} 受信した選択データ（時間切れ時は resolveRemoteChoiceWait で渡された代替値）
 */
export function waitRemoteChoice(kind) {
  return new Promise((resolve) => {
    const scope = currentScope;
    const seq = incrementScopeCounter(consumedSeqByScope, scope);
    waitingRequest = { scope, seq, kind, resolve };
    tryDeliverRemoteChoice();
  });
}

/**
 * 待機中の相手選択を代替値で確定させる（フェイルセーフ時間切れ用）。
 * 確定した順番の選択が後から届いた場合は、古い選択として自動的に破棄される。
 * @param {*} fallbackValue - 代替値
 * @returns {boolean} 待機中のリクエストを確定させた場合は true
 */
export function resolveRemoteChoiceWait(fallbackValue) {
  if (!waitingRequest) return false;
  const req = waitingRequest;
  waitingRequest = null;
  req.resolve(fallbackValue);
  return true;
}

/**
 * 選択同期の状態をすべて初期化する（対戦開始時・対戦終了時に呼び出す）。
 * 待機中のリクエストは解決せずに破棄する。
 * @returns {void}
 */
export function resetOnlineChoiceSync() {
  currentScope = NO_CHOICE_SCOPE;
  sentSeqByScope.clear();
  consumedSeqByScope.clear();
  finishedScopes.clear();
  waitingRequest = null;
  GameState.pendingChoices = [];
}
