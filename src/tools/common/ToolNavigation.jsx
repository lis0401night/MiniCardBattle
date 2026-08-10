import { useState, useEffect } from 'react';
import { TOOL_NAV_ITEMS } from './toolNavData';
import './toolNav.css';

/**
 * 全ツール共通のハンバーガーナビゲーションReactコンポーネント
 *
 * @return {JSX.Element} ハンバーガーボタンおよびサイドドロワーUI
 */
export default function ToolNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('');

  // 現在のページURLパスを取得
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  // キーボードEscキー押下でメニューを閉じる処理
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  /**
   * メニューの開閉切り替え
   */
  const toggleMenu = () => {
    setIsOpen((prev) => !prev);
  };

  /**
   * 現在選択されている（アクティブな）ツールの判定
   *
   * @param {string} itemPath 判定対象のツールのパス
   * @return {boolean} アクティブフラグ
   */
  const isActive = (itemPath) => {
    if (!currentPath) return false;
    return currentPath.endsWith(itemPath) || currentPath.includes(itemPath);
  };

  return (
    <>
      {/* フローティング ハンバーガーボタン */}
      <button
        type="button"
        className="tool-nav-btn"
        onClick={toggleMenu}
        aria-label="ツールメニューを開く"
        title="ツール切り替えメニュー"
      >
        ☰
      </button>

      {/* 暗転バックドロップ */}
      <div
        className={`tool-nav-backdrop ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* サイドスライド ドロワーメニュー */}
      <aside className={`tool-nav-drawer ${isOpen ? 'open' : ''}`}>
        <div className="tool-nav-header">
          <h3 className="tool-nav-title">
            <span>🛠️</span> 開発・管理ツール一覧
          </h3>
          <button
            type="button"
            className="tool-nav-close-btn"
            onClick={() => setIsOpen(false)}
            aria-label="メニューを閉じる"
          >
            ✕
          </button>
        </div>

        <ul className="tool-nav-list">
          {TOOL_NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <li
                key={item.id}
                className={`tool-nav-item ${active ? 'active' : ''}`}
              >
                <a href={item.path}>
                  <span className="tool-nav-icon">{item.icon}</span>
                  <div>
                    <div>{item.name}</div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: active ? '#93c5fd' : '#64748b',
                        fontWeight: 'normal',
                      }}
                    >
                      {item.desc}
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>

        <div className="tool-nav-footer">
          MiniCardBattle Tools &copy; {new Date().getFullYear()}
        </div>
      </aside>
    </>
  );
}
