/**
 * @file battleEventEmitter.js
 * @description バトルシステム全体のUI操作・入力待機・演出イベントを媒介する軽量イベントエミッターモジュール。
 * windowオブジェクトに直接生やされたグローバルコールバック関数を全廃し、型安全で安全な非同期待機 (waitFor) 構造を提供する。
 */

/**
 * @callback EventHandler
 * @param {any} [data] - イベントとともに送信されるペイロードデータ
 */

class BattleEventEmitter {
  /**
   * イベントエミッターのインスタンスを初期化する。
   */
  constructor() {
    /** @type {Map<string, Set<EventHandler>>} イベント名とハンドラー集合のマップ */
    this.listeners = new Map();
  }

  /**
   * 指定されたイベントにリスナー関数を登録する。
   * @param {string} event - イベント名
   * @param {EventHandler} handler - イベント発生時に呼び出されるコールバック関数
   */
  on(event, handler) {
    if (typeof handler !== 'function') return;
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
  }

  /**
   * 指定されたイベントからリスナー関数を解除する。
   * @param {string} event - イベント名
   * @param {EventHandler} handler - 解除するコールバック関数
   */
  off(event, handler) {
    if (!this.listeners.has(event)) return;
    const handlers = this.listeners.get(event);
    handlers.delete(handler);
    if (handlers.size === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * 指定されたイベントを一回だけ購読し、一度実行されたら自動的に解除する。
   * @param {string} event - イベント名
   * @param {EventHandler} handler - 一度だけ実行されるコールバック関数
   */
  once(event, handler) {
    const onceWrapper = (data) => {
      this.off(event, onceWrapper);
      handler(data);
    };
    this.on(event, onceWrapper);
  }

  /**
   * イベントを発行（ディスパッチ）し、登録されたすべてのリスナーを実行する。
   * @param {string} event - 発行するイベント名
   * @param {any} [payload] - リスナーに送られるデータ
   */
  emit(event, payload) {
    if (!this.listeners.has(event)) return;
    const handlers = Array.from(this.listeners.get(event));
    handlers.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[BattleEventEmitter] Error in event "${event}":`, err);
      }
    });
  }

  /**
   * 指定されたイベントが発行されるまで非同期で待機するユーティリティ関数。
   * @param {string} event - 待機するイベント名
   * @param {number} [timeoutMs=0] - タイムアウト時間（ミリ秒）。0 を指定すると無期限に待機する。
   *   タイムアウト時は reject せず null で resolve する。
   * @returns {{ promise: Promise<any>, cancel: () => void }} 待機用 Promise と、待機を中止する関数
   */
  waitFor(event, timeoutMs = 0) {
    let timer = null;
    let handler = null;
    let cancel = () => {};

    const promise = new Promise((resolve) => {
      handler = (data) => {
        if (timer) clearTimeout(timer);
        this.off(event, handler);
        resolve(data);
      };

      this.on(event, handler);

      // 呼び出し元がバトル中断時などに待機を中止できるようにする
      cancel = () => {
        if (timer) clearTimeout(timer);
        if (handler) this.off(event, handler);
        resolve(null);
      };

      if (timeoutMs > 0) {
        timer = setTimeout(cancel, timeoutMs);
      }
    });

    return { promise, cancel };
  }

  /**
   * 登録されているすべてのイベントリスナーを一括解除する（バトル終了・初期化用）。
   */
  clearAll() {
    this.listeners.clear();
  }
}

/** バトルシステム共通のシングルトンイベントエミッターインスタンス */
export const battleEvents = new BattleEventEmitter();
