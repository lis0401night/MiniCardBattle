/**
 * @file fetch.js
 * axios をベースにした共通 API 通信ラッパーモジュール。
 *
 * アプリケーション全体の API 通信を一元化し、JSON の自動変換、タイムアウト監視、
 * エラーハンドリング、および画面離脱時の keepalive 通信を統一してサポートします。
 */

import axios from 'axios';

/** API通信のデフォルトタイムアウト時間 (ms): モバイル回線やサーバー負荷を考慮し余裕を持たせた設定 */
export const DEFAULT_API_TIMEOUT_MS = 6000;

/**
 * APIエンドポイントのURLを正規化します。
 * フルURL（http/https）、ルートパス（/）、または既に 'api/' で始まっている場合はそのまま返し、
 * それ以外の相対パス（例: 'update_points.php'）には自動的に 'api/' を補完します。
 *
 * @param {string} url - 対象のエンドポイントURL
 * @returns {string} 正規化されたURL文字列
 */
export function normalizeApiUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('/') ||
    url.startsWith('api/')
  ) {
    return url;
  }
  return `api/${url}`;
}

/**
 * 共通の axios クライアントインスタンス。
 * デフォルトヘッダーおよびタイムアウトが設定されています。
 */
export const apiClient = axios.create({
  timeout: DEFAULT_API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// レスポンスインターセプターの設定
// 正常時は response.data を自動返却して呼び出し側のボイラープレートを排除し、
// エラー発生時は一貫したロギングと整形を行います。
apiClient.interceptors.response.use(
  (response) => {
    // 正常終了時はパース済みのレスポンスデータをそのまま返却
    return response.data;
  },
  (error) => {
    // 通信タイムアウト時のエラーハンドリング
    if (
      error.code === 'ECONNABORTED' ||
      (error.message && error.message.toLowerCase().includes('timeout'))
    ) {
      console.error(
        `[API Timeout] 通信がタイムアウトしました: ${error.config?.url || 'unknown'} (${error.config?.timeout || DEFAULT_API_TIMEOUT_MS}ms)`
      );
    } else if (error.response) {
      // サーバーが 2xx 以外のステータスコードを返却した場合のエラーハンドリング
      console.error(
        `[API HTTP Error] ${error.config?.url || 'unknown'} - ステータス: ${error.response.status}`,
        error.response.data
      );
    } else {
      // ネットワーク切断やDNS解決失敗等のエラーハンドリング
      console.error(
        `[API Network Error] 通信に失敗しました: ${error.config?.url || 'unknown'}`,
        error.message
      );
    }
    return Promise.reject(error);
  }
);

/**
 * GET リクエストを非同期で実行します。
 * クエリパラメータのオブジェクトを自動的に URL クエリ文字列にマッピングします。
 *
 * @template T
 * @param {string} url - リクエスト対象のエンドポイント（'api/' プレフィックスの有無を問わず指定可能）
 * @param {Record<string, any>} [params={}] - URLクエリパラメータオブジェクト
 * @param {import('axios').AxiosRequestConfig} [config={}] - 追加の axios リクエスト設定（timeout 等）
 * @returns {Promise<T>} レスポンスデータ
 */
export async function asyncGet(url, params = {}, config = {}) {
  const targetUrl = normalizeApiUrl(url);
  return await apiClient.get(targetUrl, {
    params,
    ...config,
  });
}

/**
 * POST リクエストを非同期で実行します。
 * 送信データを自動で JSON シリアライズし、Content-Type ヘッダーを付与します。
 * keepalive: true が指定された場合は、画面遷移・バックグラウンド移行時の送信完了を保証するため
 * axios の Fetch アダプタを利用して通信を行います。
 *
 * @template T
 * @param {string} url - リクエスト対象のエンドポイント（'api/' プレフィックスの有無を問わず指定可能）
 * @param {any} [data=null] - 送信するリクエストボディ
 * @param {import('axios').AxiosRequestConfig & { keepalive?: boolean }} [config={}] - 追加の axios リクエスト設定（timeout, keepalive 等）
 * @returns {Promise<T>} レスポンスデータ
 */
export async function asyncPost(url, data = null, config = {}) {
  const targetUrl = normalizeApiUrl(url);
  const { keepalive, fetchOptions, ...restConfig } = config;

  // keepalive が指定されている場合は Fetch アダプタを使用してブラウザの keepalive 機能を有効化
  const requestConfig = {
    ...restConfig,
    ...(keepalive
      ? {
          adapter: 'fetch',
          fetchOptions: {
            ...(fetchOptions || {}),
            keepalive: true,
          },
        }
      : {}),
  };

  // axios 内部の mergeConfig (utils.merge) におけるプロトタイプ汚染対策で、
  // 'prototype' 等の予約プロパティ名がリクエスト本文から自動除外される不具合を防止するため、
  // オブジェクトペイロードは事前に JSON 文字列化して渡す。
  let requestData = data;
  if (
    data !== null &&
    typeof data === 'object' &&
    typeof FormData !== 'undefined' &&
    !(data instanceof FormData) &&
    typeof Blob !== 'undefined' &&
    !(data instanceof Blob) &&
    typeof ArrayBuffer !== 'undefined' &&
    !(data instanceof ArrayBuffer)
  ) {
    requestData = JSON.stringify(data);
  } else if (
    data !== null &&
    typeof data === 'object' &&
    typeof FormData === 'undefined'
  ) {
    // Node.js等 FormData 等のブラウザAPIが存在しない環境向けフォールバック
    requestData = JSON.stringify(data);
  }

  return await apiClient.post(targetUrl, requestData, requestConfig);
}
