import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/style.css';

// 既存のコンテナ内で React アプリを初期化
const container = document.getElementById('app-container');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("ルート要素 'app-container' が見つかりませんでした");
}

// Service Worker の登録とストレージの永続化
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
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
