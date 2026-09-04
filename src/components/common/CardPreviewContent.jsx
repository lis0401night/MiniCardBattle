import { useState } from 'react';
import { GameState } from '../../state/gameState.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import { getObtainMethodsText } from '../../utils/constants/obtainMethods.js';
import { SKILLS } from '../../utils/constants/skills.js';
import {
  getCardImgUrl,
  playSound,
  resolveCardChoices,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

export default function CardPreviewContent({
  card,
  styleProps = {},
  showPremiumTag = false,

  // UI states & specific props for Reward Overlay override
  isRevealed = true,
  customActionSlot = null,
  onRevealAreaClick = null,

  // Callbacks from GlobalModals
  onImageZoom = null,
  onEquipClick = null,
  onLinkClick = null,
  onParentBack = null,
  onTogglePremium = null,
  onClosePreview = null,
  onAcquisitionOk = null,
  onExchangeConfirm = null,
  onExchangeBack = null,

  // External Helpers injected for backwards compatibility or global access
  renderSkillTagReact = null,
}) {
  const [isImageZoomedLocal, setIsImageZoomedLocal] = useState(false);

  if (!card) return null;

  const imgUrl =
    styleProps.imgUrl || (getCardImgUrl ? getCardImgUrl(card) : '');
  const isSkin = styleProps.isSkin || false;
  const isStandardCard = !isSkin && !styleProps.isPlaymat && !styleProps.isIcon;
  const rarityClass = card.isToken
    ? ' rarity-0'
    : card.rarity !== undefined && card.rarity !== null
      ? ` rarity-${card.rarity}`
      : '';
  const rarityColors = {
    0: '#a3a3a3',
    1: '#cd7f32',
    2: '#e2e8f0',
    3: '#facc15',
    4: '#fde047',
  };
  const nameColor =
    styleProps.titleColor || rarityColors[card.rarity] || '#fff';
  const filter = GameState.playerConfig?.filter || 'none';

  const skillCandidates = Array.isArray(card.skills)
    ? card.skills.map((sk) => ({ ...sk }))
    : [];

  const { choices: cardChoices, choices2: cardChoices2 } =
    resolveCardChoices(card);

  let lookupId = card.baseId || card.id;
  let isPremiumActive = false;
  let isPremiumUnlocked = false;

  // For Reward overlay, ignore premium unlock checks visually unless forced
  if (isRevealed) {
    if (card.isPremium !== undefined) {
      isPremiumActive = card.isPremium;
    } else if (card.owner === 'red') {
      isPremiumActive = false;
    } else {
      isPremiumActive = GameState.premiumCards?.includes(lookupId);
      isPremiumUnlocked = GameState.unlockedPremiumCards?.includes(lookupId);
    }
  }

  const safeRenderSkillTag = (c) => {
    if (renderSkillTagReact) return renderSkillTagReact(c);
    if (window.renderSkillTag)
      return (
        <div
          dangerouslySetInnerHTML={{ __html: window.renderSkillTag(c, false) }}
        ></div>
      );
    return null;
  };

  const cardDims = styleProps.isPlaymat
    ? { width: 280, height: 140 }
    : styleProps.isIcon
      ? { width: 140, height: 140 }
      : { width: 180, height: 240 };

  const renderDescContent = (descContent) => {
    if (Array.isArray(descContent)) {
      return descContent.map((seg, i) => {
        if (seg.type === 'link') {
          return (
            <span
              key={i}
              style={{
                color: '#38bdf8',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onLinkClick && seg.targetId) onLinkClick(seg.targetId);
              }}
            >
              {seg.value}
            </span>
          );
        }
        return <span key={i}>{seg.value}</span>;
      });
    }
    return descContent;
  };

  return (
    <>
      <div
        className={`preview-content ${styleProps.containerClass || ''}`}
        style={{
          margin: styleProps.margin,
          cursor: 'default',
          borderColor: styleProps.borderColor,
          boxShadow: styleProps.boxShadow,
          position: 'relative',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div
          style={{
            padding: '20px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {styleProps.parentCard && (
            <button
              className="btn"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                padding: '5px 10px',
                fontSize: '0.8rem',
                zIndex: 20,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onParentBack) onParentBack();
              }}
            >
              ⬅ 戻る
            </button>
          )}
          <div
            style={{
              position: 'relative',
              width: `${cardDims.width}px`,
              height: `${cardDims.height}px`,
            }}
          >
            <div
              className={
                styleProps.isPlaymat || styleProps.isIcon
                  ? ''
                  : `card blue${!isSkin ? rarityClass : ''}`
              }
              style={
                styleProps.isPlaymat
                  ? {
                      width: `${cardDims.width}px`,
                      height: `${cardDims.height}px`,
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: '2px solid #38bdf8',
                      borderRadius: '8px',
                      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.6)',
                      backgroundColor: '#000',
                    }
                  : styleProps.isIcon
                    ? {
                        width: `${cardDims.width}px`,
                        height: `${cardDims.height}px`,
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: 'none',
                        borderRadius: '50%',
                        boxShadow: 'none',
                        backgroundColor: '#0f172a',
                      }
                    : {
                        width: `${cardDims.width}px`,
                        height: `${cardDims.height}px`,
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        backgroundColor: 'transparent',
                      }
              }
              onClick={(e) => {
                e.stopPropagation();
                if (isRevealed) {
                  setIsImageZoomedLocal(true);
                  playSound?.(SOUNDS?.seClick);
                  if (onImageZoom) onImageZoom();
                }
              }}
            >
              {isRevealed ? (
                <>
                  <div
                    className="card-bg"
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      backgroundColor:
                        styleProps.isPlaymat || styleProps.isIcon
                          ? '#0f172a'
                          : '',
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={card.name}
                      decoding="sync"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: isSkin
                          ? 'contain'
                          : styleProps.isPlaymat
                            ? 'cover'
                            : styleProps.isIcon
                              ? 'contain'
                              : 'cover',
                        objectPosition: isSkin
                          ? 'top center'
                          : styleProps.isPlaymat || styleProps.isIcon
                            ? 'center'
                            : 'center center',
                        filter: filter,
                        display: 'block',
                      }}
                    />
                  </div>
                  {styleProps.isIcon && (
                    <img
                      src={appendVersionQuery(
                        'assets/icons/iconframe_gold.webp'
                      )}
                      alt=""
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 5,
                      }}
                    />
                  )}
                  {isStandardCard && (
                    <div
                      className="card-power"
                      style={{ fontSize: '2.5rem', bottom: '0', right: '5px' }}
                    >
                      {card.currentPower !== undefined
                        ? card.currentPower
                        : card.power}
                    </div>
                  )}
                  {isStandardCard && safeRenderSkillTag(card)}
                  {isStandardCard &&
                    card.equippedCards &&
                    card.equippedCards.length > 0 && (
                      <div
                        className="card-skill-tag equip-badge"
                        style={{
                          position: 'absolute',
                          top: '-5px',
                          left: '-5px',
                          background: '#64748b',
                          color: '#fff',
                          borderColor: '#94a3b8',
                          transform: 'scale(0.9)',
                          zIndex: 10,
                        }}
                      >
                        ⚔️装備中
                      </div>
                    )}
                </>
              ) : (
                <div
                  className="card-bg"
                  style={{ background: '#334155' }}
                ></div>
              )}
            </div>
            {isRevealed &&
              isStandardCard &&
              card.equippedCards &&
              card.equippedCards.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: '0',
                    marginLeft: '15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    zIndex: 15,
                  }}
                >
                  {card.equippedCards.map((eqCard, idx) => {
                    const eqImgUrl = getCardImgUrl
                      ? getCardImgUrl(eqCard, true)
                      : '';
                    return (
                      <div
                        key={idx}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundImage: `url('${eqImgUrl}')`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          cursor: 'pointer',
                          border: '2px solid #94a3b8',
                          boxShadow: '0 0 5px rgba(0,0,0,0.5)',
                        }}
                        title={`装備：${eqCard.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onEquipClick) onEquipClick(eqCard);
                        }}
                      ></div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>

        <div className="preview-details">
          {showPremiumTag && isRevealed && (
            <div
              style={{
                background: 'linear-gradient(45deg, #d946ef, #9333ea)',
                color: 'white',
                padding: '2px 10px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                marginBottom: '5px',
                alignSelf: 'center',
                display: 'inline-block',
              }}
            >
              PREMIUM UNLOCK
            </div>
          )}
          <h2
            className={
              isRevealed && card.rarity === 4 && !isSkin ? 'rarity-4-text' : ''
            }
            style={{
              color: isRevealed ? nameColor : '#fff',
              marginTop: showPremiumTag ? '5px' : '0',
            }}
          >
            {isRevealed ? styleProps.titleName || card.name : '? ? ?'}
            {isRevealed && styleProps.displayType && (
              <span
                className="skip-rarity-text"
                style={{
                  color: '#3b82f6',
                  marginLeft: '5px',
                  WebkitBackgroundClip: 'border-box',
                  WebkitTextFillColor: 'initial',
                }}
              >
                ({styleProps.displayType})
              </span>
            )}
          </h2>

          <div className="preview-scroll-area">
            {isStandardCard && (
              <div className="preview-skills-list">
                {!isRevealed ? (
                  <p className="preview-skill-desc">クリックしてカードを公開</p>
                ) : skillCandidates.length > 0 ? (
                  skillCandidates.map((sk, idx) => {
                    const s = SKILLS?.[sk.id];
                    if (!s) return null;
                    const val =
                      sk.value === null || sk.value === undefined
                        ? ''
                        : sk.value;
                    const desc =
                      typeof s.desc === 'function'
                        ? s.desc(sk.value, sk)
                        : s.desc;

                    if (
                      (sk.id === 'choice' || sk.id === 'force') &&
                      (Array.isArray(cardChoices) ||
                        Array.isArray(cardChoices2))
                    ) {
                      const targetChoices =
                        sk.choiceGroup === 2 ? cardChoices2 : cardChoices;
                      if (!Array.isArray(targetChoices)) return null;
                      return (
                        <div key={idx} className="preview-skill-item">
                          <details
                            className="choice-accordion"
                            style={{ width: '100%' }}
                          >
                            <summary
                              style={{
                                listStyle: 'none',
                                cursor: 'pointer',
                                outline: 'none',
                                width: '100%',
                              }}
                            >
                              <div
                                className="preview-skill-badge"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '10px',
                                  width: '110px',
                                  position: 'relative',
                                  margin: '0 auto',
                                }}
                              >
                                <span>
                                  {s.icon} {s.name}
                                  {val}
                                </span>
                                <span
                                  className="accordion-icon"
                                  style={{
                                    fontSize: '0.8rem',
                                    transition: 'transform 0.2s',
                                    position: 'absolute',
                                    right: '8px',
                                  }}
                                >
                                  ▼
                                </span>
                              </div>
                              <p
                                className="preview-skill-desc"
                                style={{
                                  marginTop: '6px',
                                  marginBottom: '8px',
                                  color: '#f8fafc',
                                  textAlign: 'center',
                                }}
                              >
                                {renderDescContent(desc)}
                              </p>
                            </summary>
                            <div
                              className="accordion-content"
                              style={{ marginTop: '5px' }}
                            >
                              {targetChoices.map((cho, cIdx) => {
                                const cs = SKILLS?.[cho.id];
                                if (!cs) return null;
                                const cVal =
                                  cho.value === null || cho.value === undefined
                                    ? ''
                                    : cho.value;
                                const cDesc =
                                  typeof cs.desc === 'function'
                                    ? cs.desc(cho.value, cho)
                                    : cs.desc;
                                return (
                                  <div
                                    key={cIdx}
                                    style={{
                                      marginLeft: '10px',
                                      borderLeft: '2px solid #475569',
                                      paddingLeft: '10px',
                                      marginTop: '8px',
                                      marginBottom: '8px',
                                    }}
                                  >
                                    <div
                                      className="preview-skill-badge"
                                      style={{
                                        background: 'rgba(148, 163, 184, 0.2)',
                                        borderColor: '#94a3b8',
                                        color: '#94a3b8',
                                        fontSize: '0.75rem',
                                      }}
                                    >
                                      {cs.icon} {cs.name}
                                      {cVal}
                                    </div>
                                    <p
                                      className="preview-skill-desc"
                                      style={{
                                        fontSize: '0.8rem',
                                        color: '#94a3b8',
                                        margin: '4px 0 0 0',
                                      }}
                                    >
                                      {renderDescContent(cDesc)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="preview-skill-item">
                        <div className="preview-skill-badge">
                          {s.icon} {s.name}
                          {val}
                        </div>
                        <p className="preview-skill-desc">
                          {renderDescContent(desc)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="preview-skill-desc">能力なし</p>
                )}
              </div>
            )}
            {isRevealed && (
              <p className="preview-flavor-text" style={{ display: 'block' }}>
                {styleProps.flavorOverride || card.flavor || '...'}
              </p>
            )}
            {isRevealed && styleProps.fromCardList && (
              <p
                className="preview-obtain-info"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  color: '#eab308',
                  marginTop: '10px',
                  padding: '6px 10px',
                  background: 'rgba(234, 179, 8, 0.08)',
                  borderRadius: '4px',
                  borderLeft: '3px solid #eab308',
                  textAlign: 'left',
                  lineHeight: '1.4',
                }}
              >
                <strong style={{ color: '#facc15' }}>入手方法：</strong>{' '}
                {getObtainMethodsText(card.obtain, card.isToken)}
              </p>
            )}
          </div>

          {/* User Custom Override Actions */}
          {customActionSlot}

          {/* Preview Modal Actions */}
          {styleProps.showPreviewActions &&
            isRevealed &&
            isPremiumUnlocked &&
            card.owner !== 'red' && (
              <button
                className="btn"
                style={{
                  marginTop: '10px',
                  width: '100%',
                  flexShrink: 0,
                  background: isPremiumActive
                    ? 'linear-gradient(45deg, #d946ef, #9333ea)'
                    : '#475569',
                  fontSize: '0.9rem',
                  padding: '10px 5px',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTogglePremium) onTogglePremium(card.id);
                }}
              >
                {isPremiumActive ? '✨ プレミアムON' : '✨ プレミアムOFF'}
              </button>
            )}
          {styleProps.showPreviewActions && (
            <button
              className="btn"
              style={{ marginTop: '15px', width: '100%', flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                if (onClosePreview) onClosePreview();
              }}
            >
              閉じる
            </button>
          )}

          {/* Acquisition Action */}
          {styleProps.showAcquisitionOk && (
            <button
              className="btn ok-button"
              style={{
                marginTop: '15px',
                width: '110px',
                alignSelf: 'center',
                background:
                  styleProps.okBg || 'linear-gradient(45deg, #facc15, #eab308)',
                color: styleProps.okColor || '#000',
                fontWeight: 'bold',
                pointerEvents: styleProps.canClose ? 'auto' : 'none',
                opacity: styleProps.canClose ? 1 : 0.5,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onAcquisitionOk) onAcquisitionOk();
              }}
            >
              OK
            </button>
          )}

          {/* Exchange Action */}
          {styleProps.showExchangeActions &&
            styleProps.exchangeData &&
            isRevealed && (
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  width: '100%',
                  marginTop: '10px',
                  flexShrink: 0,
                }}
              >
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    minHeight: '40px',
                    padding: '5px',
                    background: '#475569',
                    marginTop: 0,
                    fontSize: '0.9rem',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onExchangeBack) onExchangeBack();
                  }}
                >
                  戻る
                </button>
                <button
                  className="btn"
                  disabled={
                    styleProps.exchangeData.isMaxed ||
                    !styleProps.exchangeData.canExchange
                  }
                  style={{
                    flex: 1,
                    minHeight: '40px',
                    padding: '5px',
                    background:
                      styleProps.exchangeData.isMaxed ||
                      !styleProps.exchangeData.canExchange
                        ? '#475569'
                        : 'linear-gradient(45deg, #f97316, #ea580c)',
                    color:
                      styleProps.exchangeData.isMaxed ||
                      !styleProps.exchangeData.canExchange
                        ? '#94a3b8'
                        : '#ffffff',
                    marginTop: 0,
                    fontSize: '0.9rem',
                    textTransform: 'none',
                    cursor:
                      styleProps.exchangeData.isMaxed ||
                      !styleProps.exchangeData.canExchange
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: styleProps.exchangeData.isMaxed ? 0.5 : 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onExchangeConfirm)
                      onExchangeConfirm(styleProps.exchangeData);
                  }}
                >
                  {styleProps.exchangeData.isMaxed
                    ? '交換済み'
                    : `交換 ${styleProps.exchangeData.cost} pt`}
                </button>
              </div>
            )}
        </div>

        {!isRevealed && onRevealAreaClick && (
          <div
            id="reward-mask"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(15, 23, 42, 0.95)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRevealAreaClick();
            }}
          >
            <h2
              className="reward-title"
              style={{
                marginBottom: '20px',
                color: '#facc15',
                textShadow: '0 0 10px rgba(250, 204, 21, 0.5)',
              }}
            >
              カードを獲得！
            </h2>
            <div style={{ fontSize: '5rem', color: '#334155' }}>?</div>
            <div
              style={{
                fontSize: '1rem',
                color: '#cbd5e1',
                marginTop: '15px',
                animation: 'pulse 1.5s infinite',
              }}
            >
              タップして表を開く
            </div>
          </div>
        )}
      </div>

      {isImageZoomedLocal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.9)',
            zIndex: 4000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsImageZoomedLocal(false);
            playSound?.(SOUNDS?.seClick);
          }}
        >
          <img
            src={imgUrl}
            decoding="sync"
            style={{
              width: 'min(95vw, calc(95vh * 2 / 3))',
              height: 'min(95vh, calc(95vw * 3 / 2))',
              objectFit: 'contain',
              borderRadius: '12px',
              boxShadow: '0 0 40px rgba(0,0,0,0.8)',
              backgroundColor: isSkin ? 'transparent' : '#000',
            }}
            alt="Enlarged"
          />
        </div>
      )}
    </>
  );
}
