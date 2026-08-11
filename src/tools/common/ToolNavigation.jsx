import { useState, useEffect, useRef } from 'react';
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
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);

  // 現在のページURLパスを取得
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  // メニュー開閉時のフォーカス移動制御
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (isOpen) {
      drawerRef.current?.focus();
    } else {
      menuButtonRef.current?.focus();
    }
  }, [isOpen]);

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
   * ドロワー内部でのキーボードフォーカストラップ処理
   * Tabキー操作時にドロワー内部のフォーカス可能要素間を循環させる
   *
   * @param {React.KeyboardEvent} event キーボードイベント
   */
  const handleDrawerKeyDown = (event) => {
    if (event.key !== 'Tab') return;

    const focusableElements = [
      ...event.currentTarget.querySelectorAll('a[href], button:not(:disabled)'),
    ];
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (!firstElement || !lastElement) {
      event.preventDefault();
    } else if (
      event.shiftKey &&
      (document.activeElement === event.currentTarget ||
        document.activeElement === firstElement)
    ) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

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
        ref={menuButtonRef}
        type="button"
        className="tool-nav-btn"
        onClick={toggleMenu}
        aria-label="ツールメニューを開く"
        aria-expanded={isOpen}
        aria-controls="tool-navigation-drawer"
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
      <aside
        id="tool-navigation-drawer"
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-navigation-title"
        className={`tool-nav-drawer ${isOpen ? 'open' : ''}`}
        aria-hidden={!isOpen}
        inert={!isOpen}
        onKeyDown={handleDrawerKeyDown}
      >
        <div className="tool-nav-header">
          <h3 id="tool-navigation-title" className="tool-nav-title">
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
