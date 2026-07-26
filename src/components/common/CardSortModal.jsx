import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

export default function CardSortModal({
  visible,
  onClose,
  tempSortMode,
  setTempSortMode,
  onApply,
  onReset,
}) {
  if (!visible) return null;

  const sortOptions = [
    { id: 'rarity_asc', label: 'レアリティ昇順' },
    { id: 'rarity_desc', label: 'レアリティ降順' },
    { id: 'power_asc', label: 'パワー昇順' },
    { id: 'power_desc', label: 'パワー降順' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1e293b',
          border: '2px solid #facc15',
          borderRadius: '12px',
          padding: '20px',
          width: '85%',
          maxWidth: '320px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            color: '#facc15',
            textAlign: 'center',
            fontSize: '1.1rem',
            marginBottom: '5px',
          }}
        >
          並び替え（ソート）
        </h3>

        {sortOptions.map((opt) => {
          const isSelected = tempSortMode === opt.id;
          return (
            <button
              key={opt.id}
              className="btn"
              style={{
                padding: '10px 14px',
                fontSize: '0.9rem',
                textAlign: 'left',
                background: isSelected ? 'rgba(250, 204, 21, 0.2)' : '#334155',
                border: isSelected
                  ? '1.5px solid #facc15'
                  : '1px solid #475569',
                color: isSelected ? '#facc15' : '#cbd5e1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
              }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                setTempSortMode(opt.id);
              }}
            >
              <span>{opt.label}</span>
            </button>
          );
        })}

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginTop: '10px',
          }}
        >
          <button
            className="btn"
            style={{
              background: '#7f1d1d',
              margin: 0,
              padding: '8px',
              flex: 1,
              minWidth: '70px',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap',
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              onReset();
            }}
          >
            リセット
          </button>
          <button
            className="btn"
            style={{
              background: '#64748b',
              margin: 0,
              padding: '8px',
              flex: 1,
              minWidth: '70px',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap',
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              onClose();
            }}
          >
            閉じる
          </button>
          <button
            className="btn"
            style={{
              background: '#10b981',
              margin: 0,
              padding: '8px',
              flex: 1,
              minWidth: '70px',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap',
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              onApply();
            }}
          >
            適用
          </button>
        </div>
      </div>
    </div>
  );
}
