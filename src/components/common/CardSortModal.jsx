import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

export default function CardSortModal({
  visible,
  onClose,
  tempSortKey,
  setTempSortKey,
  tempSortOrder,
  setTempSortOrder,
  onApply,
  onReset,
}) {
  if (!visible) return null;

  const sortOptions = [
    { id: 'default', label: '標準 (ID順)' },
    { id: 'cost', label: 'コスト' },
    { id: 'attack', label: '攻撃力' },
    { id: 'hp', label: '体力 (HP)' },
    { id: 'rarity', label: 'レアリティ' },
    { id: 'name', label: '五十音順' },
  ];

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 2000, display: 'flex' }}
      onClick={onClose}
    >
      <div
        className="skill-modal-box modal-pop-animation"
        style={{
          borderRadius: '12px',
          padding: '20px',
          width: '90%',
          maxWidth: '380px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: '0 0 15px 0',
            color: '#facc15',
            textAlign: 'center',
            fontSize: '1.2rem',
          }}
        >
          並び替え
        </h3>

        {/* ソート項目選択 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              color: '#94a3b8',
              fontSize: '0.85rem',
              marginBottom: '2px',
            }}
          >
            並び替え基準
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
            }}
          >
            {sortOptions.map((opt) => (
              <div
                key={opt.id}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setTempSortKey(opt.id);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border:
                    tempSortKey === opt.id
                      ? '2px solid #facc15'
                      : '1px solid #475569',
                  background:
                    tempSortKey === opt.id
                      ? 'rgba(250, 204, 21, 0.2)'
                      : '#334155',
                  color: tempSortKey === opt.id ? '#facc15' : '#e2e8f0',
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontSize: '0.85rem',
                  textAlign: 'center',
                  fontWeight: tempSortKey === opt.id ? 'bold' : 'normal',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>

        {/* 昇順 / 降順 */}
        <div style={{ marginBottom: '25px' }}>
          <div
            style={{
              color: '#94a3b8',
              fontSize: '0.85rem',
              marginBottom: '8px',
            }}
          >
            順序
          </div>
          <div
            style={{
              display: 'flex',
              gap: '10px',
              background: '#1e293b',
              padding: '4px',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}
          >
            <div
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                setTempSortOrder('asc');
              }}
              style={{
                flex: 1,
                padding: '8px',
                textAlign: 'center',
                borderRadius: '6px',
                background: tempSortOrder === 'asc' ? '#3b82f6' : 'transparent',
                color: tempSortOrder === 'asc' ? '#fff' : '#94a3b8',
                fontWeight: tempSortOrder === 'asc' ? 'bold' : 'normal',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: '0.85rem',
              }}
            >
              昇順 (小 → 大)
            </div>
            <div
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                setTempSortOrder('desc');
              }}
              style={{
                flex: 1,
                padding: '8px',
                textAlign: 'center',
                borderRadius: '6px',
                background:
                  tempSortOrder === 'desc' ? '#3b82f6' : 'transparent',
                color: tempSortOrder === 'desc' ? '#fff' : '#94a3b8',
                fontWeight: tempSortOrder === 'desc' ? 'bold' : 'normal',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: '0.85rem',
              }}
            >
              降順 (大 → 小)
            </div>
          </div>
        </div>

        {/* フッターボタン */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px',
            paddingTop: '10px',
            borderTop: '1px solid #334155',
          }}
        >
          <button
            className="btn"
            style={{
              background: '#475569',
              color: '#fff',
              padding: '8px 16px',
              fontSize: '0.9rem',
              borderRadius: '8px',
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              onReset();
            }}
          >
            リセット
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn"
              style={{
                background: '#334155',
                color: '#94a3b8',
                padding: '8px 16px',
                fontSize: '0.9rem',
                borderRadius: '8px',
              }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                onClose();
              }}
            >
              キャンセル
            </button>
            <button
              className="btn ok-button"
              style={{
                background: '#facc15',
                color: '#0f172a',
                fontWeight: 'bold',
                padding: '8px 20px',
                fontSize: '0.9rem',
                borderRadius: '8px',
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
    </div>
  );
}
