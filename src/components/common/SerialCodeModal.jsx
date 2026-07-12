import { useState } from 'react';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

export default function SerialCodeModal({ visible, onClose, onSubmit }) {
  const [code, setCode] = useState('');

  if (!visible) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    if (typeof playSound === 'function') {
      playSound(SOUNDS.seClick);
    }
    if (typeof onSubmit === 'function') {
      onSubmit(code.trim());
    }
    setCode('');
  };

  const handleClose = () => {
    if (typeof playSound === 'function') {
      playSound(SOUNDS.seClick);
    }
    setCode('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.8)',
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '360px',
          boxShadow:
            '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: '#facc15',
            fontSize: '1.25rem',
            margin: 0,
            textAlign: 'center',
            fontWeight: 'bold',
            borderBottom: '2px solid rgba(250, 204, 21, 0.2)',
            paddingBottom: '10px',
          }}
        >
          シリアルコード入力
        </h3>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              color: '#cbd5e1',
              fontSize: '0.85rem',
              lineHeight: '1.5',
              textAlign: 'center',
            }}
          >
            特典のシリアルコードを入力してください。
          </div>

          <input
            type="text"
            placeholder="コードを入力"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #334155',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
              outline: 'none',
              textAlign: 'center',
            }}
            autoFocus
          />

          <div
            style={{
              display: 'flex',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              className="btn"
              style={{
                flex: 1,
                background: '#475569',
                margin: 0,
                fontSize: '0.9rem',
                padding: '10px 0',
                borderRadius: '8px',
              }}
              onClick={handleClose}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="btn"
              disabled={!code.trim()}
              style={{
                flex: 1,
                background: code.trim()
                  ? 'linear-gradient(45deg, #3b82f6, #1d4ed8)'
                  : '#1e293b',
                color: code.trim() ? '#ffffff' : '#64748b',
                border: code.trim() ? 'none' : '1px solid #334155',
                margin: 0,
                fontSize: '0.9rem',
                padding: '10px 0',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: code.trim() ? 'pointer' : 'default',
              }}
            >
              送信
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
