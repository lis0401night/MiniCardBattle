import { useState, useEffect } from 'react';

export let addDamagePopupHook = null;
export function setAddDamagePopupHook(h) {
  addDamagePopupHook = h;
}

// ダメージポップアップの表示時間（ミリ秒）
const DAMAGE_POPUP_DURATION = 1000;

export default function DamageOverlay() {
  const [popups, setPopups] = useState([]);

  useEffect(() => {
    setAddDamagePopupHook((x, y, text, color) => {
      // 非推奨のsubstrを避け、sliceによる一意なID生成
      const id = Date.now() + Math.random().toString(36).slice(2, 11);
      setPopups((prev) => [...prev, { id, x, y, text, color }]);

      // アニメーション終了後に自動的にポップアップを削除
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p.id !== id));
      }, DAMAGE_POPUP_DURATION);
    });

    return () => setAddDamagePopupHook(null);
  }, []);

  if (popups.length === 0) return null;

  return (
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
    </div>
  );
}
