import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ToolNavigation from './ToolNavigation.jsx';

/**
 * HTMLファイルやスタンドアロン環境用のツールナビゲーション自動マウント処理
 * 共通の React コンポーネント (ToolNavigation) を自動生成されたコンテナへマウントし、
 * プロジェクトの「DOM操作廃止」および「DRY原則」規約を完全遵守します。
 *
 * @returns {void}
 */
function initToolNavigationStandalone() {
  if (typeof document === 'undefined') return;

  let container = document.getElementById('tool-navigation-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'tool-navigation-root';
    document.body.appendChild(container);
  }

  // 二重マウントの防止
  if (container.dataset.mounted) return;
  container.dataset.mounted = 'true';

  const root = createRoot(container);
  root.render(createElement(ToolNavigation));
}

// DOM読み込み完了時に自動マウントを開始
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToolNavigationStandalone);
  } else {
    initToolNavigationStandalone();
  }
}
