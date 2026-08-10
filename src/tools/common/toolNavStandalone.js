import { TOOL_NAV_ITEMS } from './toolNavData.js';
import './toolNav.css';

/**
 * HTMLファイル（Vanilla JS）用のスタンドアロン型ツールナビゲーションの組み込み処理
 */
function initToolNavigationStandalone() {
  if (typeof document === 'undefined') return;

  const currentPath = window.location.pathname;

  // ボタンエレメントの生成
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tool-nav-btn';
  btn.setAttribute('aria-label', 'ツールメニューを開く');
  btn.title = 'ツール切り替えメニュー';
  btn.innerHTML = '☰';

  // 暗転バックドロップの生成
  const backdrop = document.createElement('div');
  backdrop.className = 'tool-nav-backdrop';

  // サイドドロワーの生成
  const drawer = document.createElement('aside');
  drawer.className = 'tool-nav-drawer';

  // メニューアイテムHTMLの生成
  const itemsHtml = TOOL_NAV_ITEMS.map((item) => {
    const active =
      currentPath.endsWith(item.path) || currentPath.includes(item.path);
    return `
      <li class="tool-nav-item ${active ? 'active' : ''}">
        <a href="${item.path}">
          <span class="tool-nav-icon">${item.icon}</span>
          <div>
            <div>${item.name}</div>
            <div style="font-size: 11px; color: ${active ? '#93c5fd' : '#64748b'}; font-weight: normal;">
              ${item.desc}
            </div>
          </div>
        </a>
      </li>
    `;
  }).join('');

  drawer.innerHTML = `
    <div class="tool-nav-header">
      <h3 class="tool-nav-title">
        <span>🛠️</span> 開発・管理ツール一覧
      </h3>
      <button type="button" class="tool-nav-close-btn" aria-label="メニューを閉じる">✕</button>
    </div>
    <ul class="tool-nav-list">
      ${itemsHtml}
    </ul>
    <div class="tool-nav-footer">
      MiniCardBattle Tools &copy; ${new Date().getFullYear()}
    </div>
  `;

  // DOMへの追加
  document.body.appendChild(btn);
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  /**
   * メニューを開く
   */
  const openMenu = () => {
    backdrop.classList.add('open');
    drawer.classList.add('open');
  };

  /**
   * メニューを閉じる
   */
  const closeMenu = () => {
    backdrop.classList.remove('open');
    drawer.classList.remove('open');
  };

  // イベントハンドラ設定
  btn.addEventListener('click', openMenu);
  backdrop.addEventListener('click', closeMenu);

  const closeBtn = drawer.querySelector('.tool-nav-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMenu);
  }

  // Escキーで閉じる
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
    }
  });
}

// DOM読み込み完了時に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initToolNavigationStandalone);
} else {
  initToolNavigationStandalone();
}
