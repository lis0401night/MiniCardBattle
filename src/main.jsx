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
  console.error("ルート要素 'app-container' が見つかりませんでした");}
