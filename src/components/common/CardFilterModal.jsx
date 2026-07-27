import { useMemo, useRef, useState } from 'react';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { MAX_CARD_COPIES } from '../../utils/constants/config.js';
import { SKILLS, SKILL_CATEGORIES } from '../../utils/constants/skills.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

export default function CardFilterModal({
  visible,
  onClose,
  tempFilters = {},
  setTempFilters,
  toggleTempFilter,
  toggleTempSkillFilter,
  onApply,
  onReset,
  defaultOwnership = 'include_unowned',
}) {
  const [isSkillAccordionOpen, setIsSkillAccordionOpen] = useState(false);
  const modalContentRef = useRef(null);
  const skillAccordionRef = useRef(null);

  const availablePowers = useMemo(() => {
    const powers = new Set();
    (CARD_MASTER || []).forEach((c) => {
      if (!c.isToken && typeof c.power === 'number' && !isNaN(c.power)) {
        powers.add(c.power);
      }
    });
    return Array.from(powers).sort((a, b) => a - b);
  }, []);

  if (!visible) return null;

  const availableRarities = [1, 2, 3, 4];

  const raritiesList = tempFilters.rarity || [];
  const powersList = tempFilters.power || [];
  const skillsList = tempFilters.skills || [];
  const excludeSkillsList = tempFilters.excludeSkills || [];

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
              ].map((opt) => {
                const isSelected =
                  (tempFilters.ownership || defaultOwnership) === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      playSound?.(SOUNDS?.seClick);
                      setTempFilters({ ...tempFilters, ownership: opt.id });
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      border: isSelected
                        ? '2px solid #facc15'
                        : '2px solid #475569',
                      background: isSelected
                        ? 'rgba(250, 204, 21, 0.2)'
                        : '#334155',
                      color: isSelected ? '#facc15' : '#94a3b8',
                      cursor: 'pointer',
                      userSelect: 'none',
                      fontSize: '0.85rem',
                    }}
                  >
                    {opt.label}
                  </div>
                );
              })}
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
                    border: raritiesList.includes(r)
                      ? '2px solid #facc15'
                      : '2px solid #475569',
                    background: raritiesList.includes(r)
                      ? 'rgba(250, 204, 21, 0.2)'
                      : '#334155',
                    color: raritiesList.includes(r) ? '#facc15' : '#94a3b8',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  ★{r}
                </div>
              ))}
            </div>
          </div>

          {/* パワー */}
          <div>
            <div
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '8px',
              }}
            >
              パワー
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availablePowers.map((pow) => (
                <div
                  key={`p-${pow}`}
                  onClick={() => toggleTempFilter('power', pow)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: powersList.includes(pow)
                      ? '2px solid #facc15'
                      : '2px solid #475569',
                    background: powersList.includes(pow)
                      ? 'rgba(250, 204, 21, 0.2)'
                      : '#334155',
                    color: powersList.includes(pow) ? '#facc15' : '#94a3b8',
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  {pow}
                </div>
              ))}
            </div>
          </div>

          {/* 能力（アコーディオン） */}
          <div ref={skillAccordionRef}>
            <div
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                const nextState = !isSkillAccordionOpen;
                setIsSkillAccordionOpen(nextState);
                if (nextState) {
                  setTimeout(() => {
                    if (modalContentRef.current && skillAccordionRef.current) {
                      modalContentRef.current.scrollTo({
                        top: skillAccordionRef.current.offsetTop,
                        behavior: 'smooth',
                      });
                    }
                  }, 50);
                }
              }}
              style={{
                color: '#94a3b8',
                fontSize: '0.9rem',
                marginBottom: '8px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px',
                backgroundColor: '#334155',
                borderRadius: '6px',
                border:
                  skillsList.length > 0 || excludeSkillsList.length > 0
                    ? '1px solid #facc15'
                    : '1px solid transparent',
              }}
            >
              <span
                style={{
                  color:
                    skillsList.length > 0 || excludeSkillsList.length > 0
                      ? '#facc15'
                      : '#94a3b8',
                }}
              >
                能力 ※2回クリックで除外
              </span>
              <span>{isSkillAccordionOpen ? '▲' : '▼'}</span>
            </div>

            {isSkillAccordionOpen && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  padding: '8px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                }}
              >
                {SKILL_CATEGORIES.map((category) => {
                  const activeGroups = category.groups
                    .map((group) => ({
                      ...group,
                      validSkills: group.skills.filter((sk) => SKILLS[sk]),
                    }))
                    .filter((g) => g.validSkills.length > 0);

                  if (activeGroups.length === 0) return null;

                  return (
                    <div
                      key={category.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          color: '#facc15',
                          borderBottom: '1px solid rgba(250, 204, 21, 0.2)',
                          paddingBottom: '2px',
                          marginBottom: '4px',
                        }}
                      >
                        {category.name}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          paddingLeft: '4px',
                        }}
                      >
                        {activeGroups.map((group, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              background: 'rgba(255,255,255,0.02)',
                              padding: '6px',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.05)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: '#94a3b8',
                                fontWeight: 'bold',
                              }}
                            >
                              {group.name}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '6px',
                              }}
                            >
                              {group.validSkills.map((sk) => {
                                const skillDef = SKILLS[sk] || {
                                  name: sk,
                                  icon: '',
                                };
                                const isSelected = skillsList.includes(sk);
                                const isExcluded =
                                  excludeSkillsList.includes(sk);

                                return (
                                  <div
                                    key={sk}
                                    onClick={() => toggleTempSkillFilter(sk)}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      border: isSelected
                                        ? '1px solid #facc15'
                                        : isExcluded
                                          ? '1px solid #ef4444'
                                          : '1px solid #475569',
                                      background: isSelected
                                        ? 'rgba(250, 204, 21, 0.2)'
                                        : isExcluded
                                          ? 'rgba(239, 68, 68, 0.2)'
                                          : '#334155',
                                      color: isSelected
                                        ? '#facc15'
                                        : isExcluded
                                          ? '#ef4444'
                                          : '#cbd5e1',
                                      textDecoration: isExcluded
                                        ? 'line-through'
                                        : 'none',
                                      cursor: 'pointer',
                                      fontSize: '0.8rem',
                                      userSelect: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <span>{skillDef.icon}</span>
                                    <span>{skillDef.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 固定フッターボタン */}
        <div
          style={{
            display: 'flex',
            gap: '15px',
            justifyContent: 'center',
            flexShrink: 0,
            paddingTop: '5px',
          }}
        >
          <button
            className="btn"
            style={{
              background: '#7f1d1d',
              margin: 0,
              padding: '8px',
              flex: 1,
              minWidth: '80px',
              fontSize: '1rem',
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
              minWidth: '80px',
              fontSize: '1rem',
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
              minWidth: '80px',
              fontSize: '1rem',
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
