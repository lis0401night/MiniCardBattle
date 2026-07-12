// URLの末尾スラッシュ補正（PWAでのホーム画面追加時の階層ズレバグ対策）
// 例: /MiniCardBattle のようにスラッシュなしでアクセスされた場合、末尾にスラッシュを付与してリダイレクトします
if (
  typeof window !== 'undefined' &&
  window.location.pathname &&
  !window.location.pathname.endsWith('/') &&
  !window.location.pathname.endsWith('.html')
) {
  window.location.replace(
    window.location.pathname +
      '/' +
      window.location.search +
      window.location.hash
  );
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { installGlobalErrorReporter } from './utils/errorReporter.js';
import './styles/style.css';

// グローバルエラーレポーターをインストール（index.htmlのインラインスクリプトから利用可能にする）
installGlobalErrorReporter();

// 既存のコンテナ内で React アプリを初期化
const container = document.getElementById('app-container');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  console.error("ルート要素 'app-container' が見つかりませんでした");
}

// Service Worker の登録とストレージの永続化
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`)
      .then((registration) => {
        console.log(
          '[Service Worker] Registered with scope:',
          registration.scope
        );
      })
      .catch((error) => {
        console.error('[Service Worker] Registration failed:', error);
      });
  });
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage
    .persist()
    .then((persisted) => {
      if (persisted) {
        console.log('[Storage] Persistent storage granted.');
      } else {
        console.log(
          '[Storage] Persistent storage not granted (auto-cleanup active).'
        );
      }
    })
    .catch((err) => {
      console.error('[Storage] Persistent storage request error:', err);
    });
}
