import { useRef, useState } from 'react';
import { MAX_CARD_COPIES } from '../../utils/constants/config.js';
import { SKILLS, SKILL_CATEGORIES } from '../../utils/constants/skills.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

export default function CardFilterModal({
  visible,
  onClose,
  tempFilters,
  setTempFilters,
  toggleTempFilter,
  toggleTempSkillFilter,
  onApply,
  onReset,
  defaultOwnership = 'include_unowned',
}) {
  const [skillCategoryOpen, setSkillCategoryOpen] = useState({});
  const modalContentRef = useRef(null);
  const skillAccordionRef = useRef(null);

  if (!visible) return null;

  const availableRarities = ['N', 'R', 'SR', 'SSR'];
  const availableCosts = [0, 1, 2, 3, 4, '5+'];

  const toggleCategory = (catKey) => {
    playSound?.(SOUNDS?.seClick);
    setSkillCategoryOpen((prev) => {
      const nextState = { ...prev, [catKey]: !prev[catKey] };

      // 初めてアコーディオンを開く場合、モーダルのスクロール位置を調整して見やすくする
      if (nextState[catKey] && modalContentRef.current) {
        setTimeout(() => {
          if (skillAccordionRef.current && modalContentRef.current) {
            const containerRect =
              modalContentRef.current.getBoundingClientRect();
            const accordionRect =
              skillAccordionRef.current.getBoundingClientRect();

            // アコーディオンのトップ位置までスクロール
            modalContentRef.current.scrollTop +=
              accordionRect.top - containerRect.top - 10;
          }
        }, 50);
      }
      return nextState;
    });
  };

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
          padding: '15px 20px',
          width: '90%',
          maxWidth: '400px',
          height: '82dvh',
          maxHeight: '82dvh',
          boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 固定タイトル */}
        <h3
          style={{
            margin: '0 0 10px 0',
            color: '#facc15',
            textAlign: 'center',
            fontSize: '1.2rem',
            flexShrink: 0,
          }}
        >
          フィルター
        </h3>

        {/* スクロールエリア */}
        <div
          ref={modalContentRef}
          style={{
            position: 'relative',
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            paddingRight: '4px',
            marginBottom: '10px',
          }}
        >
          {/* カード名 */}
          <div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '8px',
              }}
            >
              カード名
            </div>
            <input
              type="text"
              value={tempFilters.name || ''}
              onChange={(e) =>
                setTempFilters({ ...tempFilters, name: e.target.value })
              }
              placeholder="カード名で検索..."
              style={{
                background: '#334155',
                color: '#fff',
                border: '1px solid #475569',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.9rem',
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* 所持 */}
          <div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '8px',
              }}
            >
              所持
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { id: 'owned_only', label: '所持のみ' },
                { id: 'include_unowned', label: '未所持含む' },
                {
                  id: 'three_or_less',
                  label: `${MAX_CARD_COPIES - 1}枚以下のみ`,
                },
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    setTempFilters({ ...tempFilters, ownership: opt.id });
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border:
                      (tempFilters.ownership || defaultOwnership) === opt.id
                        ? '2px solid #facc15'
                        : '2px solid #475569',
                    background:
                      (tempFilters.ownership || defaultOwnership) === opt.id
                        ? 'rgba(250, 204, 21, 0.2)'
                        : '#334155',
                    color:
                      (tempFilters.ownership || defaultOwnership) === opt.id
                        ? '#facc15'
                        : '#94a3b8',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  {opt.label}
                </div>
              ))}
            </div>
          </div>

          {/* レアリティ */}
          <div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '8px',
              }}
            >
              レアリティ
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availableRarities.map((r) => (
                <div
                  key={`r-${r}`}
                  onClick={() => toggleTempFilter('rarity', r)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: tempFilters.rarity.includes(r)
                      ? '2px solid #facc15'
                      : '2px solid #475569',
                    background: tempFilters.rarity.includes(r)
                      ? 'rgba(250, 204, 21, 0.2)'
                      : '#334155',
                    color: tempFilters.rarity.includes(r)
                      ? '#facc15'
                      : '#94a3b8',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  {r}
                </div>
              ))}
            </div>
          </div>

          {/* コスト */}
          <div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '8px',
              }}
            >
              コスト
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availableCosts.map((cVal) => (
                <div
                  key={`c-${cVal}`}
                  onClick={() => toggleTempFilter('cost', cVal)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: tempFilters.cost.includes(cVal)
                      ? '2px solid #facc15'
                      : '2px solid #475569',
                    background: tempFilters.cost.includes(cVal)
                      ? 'rgba(250, 204, 21, 0.2)'
                      : '#334155',
                    color: tempFilters.cost.includes(cVal)
                      ? '#facc15'
                      : '#94a3b8',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  {cVal}
                </div>
              ))}
            </div>
          </div>

          {/* スキル能力（アコーディオン） */}
          <div ref={skillAccordionRef}>
            <div
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '8px',
              }}
            >
              能力（スキル）
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {Object.entries(SKILL_CATEGORIES).map(([catKey, cat]) => {
                const categorySkillIds = Object.keys(SKILLS).filter(
                  (skKey) => SKILLS[skKey].category === catKey
                );
                if (categorySkillIds.length === 0) return null;

                const selectedCount = categorySkillIds.filter((skKey) =>
                  tempFilters.skills.includes(skKey)
                ).length;
                const isOpen = !!skillCategoryOpen[catKey];

                return (
                  <div
                    key={catKey}
                    style={{
                      background: '#1e293b',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={() => toggleCategory(catKey)}
                      style={{
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: isOpen ? '#334155' : 'transparent',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '1rem',
                            color: cat.color || '#38bdf8',
                          }}
                        >
                          {cat.icon || '✨'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            color: '#e2e8f0',
                          }}
                        >
                          {cat.name}
                        </span>
                        {selectedCount > 0 && (
                          <span
                            style={{
                              background: '#facc15',
                              color: '#0f172a',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              borderRadius: '10px',
                              padding: '1px 7px',
                            }}
                          >
                            {selectedCount}
                          </span>
                        )}
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </div>

                    {isOpen && (
                      <div
                        style={{
                          padding: '10px 12px',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                          background: '#0f172a',
                          borderTop: '1px solid #334155',
                        }}
                      >
                        {categorySkillIds.map((skKey) => {
                          const sk = SKILLS[skKey];
                          const isSelected = tempFilters.skills.includes(skKey);
                          return (
                            <div
                              key={skKey}
                              onClick={() => toggleTempSkillFilter(skKey)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '16px',
                                border: isSelected
                                  ? '1.5px solid #facc15'
                                  : '1.5px solid #475569',
                                background: isSelected
                                  ? 'rgba(250, 204, 21, 0.2)'
                                  : '#1e293b',
                                color: isSelected ? '#facc15' : '#cbd5e1',
                                cursor: 'pointer',
                                userSelect: 'none',
                                fontSize: '0.8rem',
                              }}
                            >
                              {sk.name}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 固定フッターボタン */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '10px',
            paddingTop: '10px',
            borderTop: '1px solid #334155',
            flexShrink: 0,
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
