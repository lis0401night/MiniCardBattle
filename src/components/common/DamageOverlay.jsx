import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { setAddDamagePopupHook } from '../../utils/gameUtils.js';

// ダメージポップアップの表示時間（ミリ秒）
const DAMAGE_POPUP_DURATION = 1000;

/**
 * ダメージポップアップのオーバーレイコンポーネント
 * body 直下にポータル描画することで、#app-container の filter（slow-motion 演出）や
 * CSS の影響を受けず、position: fixed がビューポート基準のまま維持される
 * @returns {import('react').ReactPortal|null} ポータルでレンダリングされたダメージポップアップ群
 */
export default function DamageOverlay() {
  const [popups, setPopups] = useState([]);

  useEffect(() => {
    const timers = new Set();
    setAddDamagePopupHook((x, y, text, color) => {
      // 非推奨のsubstrを避け、sliceによる一意なID生成
      const id = Date.now() + Math.random().toString(36).slice(2, 11);
      setPopups((prev) => [...prev, { id, x, y, text, color }]);

      // アニメーション終了後に自動的にポップアップを削除
      const t = setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== id));
        timers.delete(t);
      }, DAMAGE_POPUP_DURATION);
      timers.add(t);
    });

    return () => {
      timers.forEach(clearTimeout);
      setAddDamagePopupHook(null);
    };
  }, []);

  if (popups.length === 0) return null;

  // #app-container の filter（slow-motion）の影響を受けないよう、
  // body 直下にポータル描画する
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {popups.map((p) => (
        <div
          key={p.id}
          className="damage-popup"
          style={{ position: 'absolute', left: p.x, top: p.y, color: p.color }}
        >
          {p.text}
        </div>
      ))}
    </div>,
    document.body
  );
}
