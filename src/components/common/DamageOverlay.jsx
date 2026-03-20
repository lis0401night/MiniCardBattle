import React, { useState, useEffect } from 'react';

export let addDamagePopupHook = null;
export function setAddDamagePopupHook(h) { addDamagePopupHook = h; }

export default function DamageOverlay() {
  const [popups, setPopups] = useState([]);

  useEffect(() => {
    setAddDamagePopupHook((x, y, text, color) => {
      const id = Date.now() + Math.random().toString(36).substr(2, 9);
      setPopups(prev => [...prev, { id, x, y, text, color }]);
      
      // Auto-remove after animation
      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== id));
      }, 1000);
    });
    
    return () => setAddDamagePopupHook(null);
  }, []);

  if (popups.length === 0) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 }}>
      {popups.map(p => (
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
