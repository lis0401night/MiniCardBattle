import React, { useState, useEffect } from 'react';

import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS, getSkinImage } from '../utils/constants/characters.js';
import { PLAYMAT_MASTER, ownedPlaymats } from '../utils/constants/playmats.js';
import { SKILLS } from '../utils/constants/skills.js';
import { playSound, stopAllBGM, getCardImgUrl, togglePremiumCard } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { saveDeck, renderDeckEdit, submitDefenseDeck } from '../hooks/deck.js';
import { GameState } from '../hooks/gameState.js';
import { renderCardList, openCardPreview, setShowCardAcquisitionModalHook, setShowPremiumAcquisitionModalHook, setShowPlaymatAcquisitionModalHook, setOpenCardPreviewHook, setCloseCardPreviewHook } from '../hooks/uiGallery.js';
import { backupDataToXML, importDataFromXML, reloadGame, confirmCharSelect, confirmExchange, setCloseEnemyDeckModalHook } from '../hooks/uiMainCore.js';
import { showAlertModal, setShowConfirmModalHook, setShowAlertModalHook, setShowErrorModalHook, setShowPointAcquisitionModalHook } from '../hooks/uiModals.js';

let g_discardLongPressTimer = null;
let g_discardHasLongPressed = false;

export default function GlobalModals() {
  const [confirmData, setConfirmData] = useState(null);
  const [errorData, setErrorData] = useState(null);
  const [enemyDeckData, setEnemyDeckData] = useState(null);
  const [cardPreviewData, setCardPreviewData] = useState(null);
  const [acquisitionData, setAcquisitionData] = useState(null); // card, premium, playmat
  const [pointAcquisitionData, setPointAcquisitionData] = useState(null);
  const [charDetailData, setCharDetailData] = useState(null);
  const [exchangeDetailData, setExchangeDetailData] = useState(null);
  const [syncDataVisible, setSyncDataVisible] = useState(false);
  const [playerNameVisible, setPlayerNameVisible] = useState(false);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [playmatSelectionVisible, setPlaymatSelectionVisible] = useState(false);
  const [selectedPlaymatState, setSelectedPlaymatState] = useState(null);
  const [skillConfirmData, setSkillConfirmData] = useState(null);
  const [skillChoiceData, setSkillChoiceData] = useState(null);
  const [discardSelectionData, setDiscardSelectionData] = useState(null);
  const [rulesVisible, setRulesVisible] = useState(false);
  const [skinSelectionVisible, setSkinSelectionVisible] = useState(false);
  const [selectedSkinState, setSelectedSkinState] = useState(null);

  const handleCloseCardPreview = (e) => {
    if (e && e.target !== e.currentTarget) return; // overlay click check
    playSound?.(SOUNDS?.seClick);
    setCardPreviewData(null);
  };

  useEffect(() => {
    setShowConfirmModalHook((message, onConfirm, onCancel, isAlert = false) => {
      playSound?.(SOUNDS?.seClick);
      setConfirmData({ message, onConfirm, onCancel, isAlert });
    });

    setShowAlertModalHook((message, onClose) => {
      playSound?.(SOUNDS?.seClick);
      setConfirmData({ message, onConfirm: onClose, onCancel: null, isAlert: true });
    });

    setShowErrorModalHook((message) => {
      if (typeof stopAllBGM === 'function') stopAllBGM();
      setErrorData({ message });
    });

    setShowPointAcquisitionModalHook((data) => {
      playSound?.(SOUNDS?.seGet); // 獲得時の効果音（仮にseGetとするか、seSkill等）
      setPointAcquisitionData(data);
    });

    window.showEnemyDeckModal = (deck, title) => {
      playSound?.(SOUNDS?.seClick);
      setEnemyDeckData({ deck: deck || [], title: title || '敵デッキ確認' });
    };

    setCloseEnemyDeckModalHook(() => {
      playSound?.(SOUNDS?.seClick);
      setEnemyDeckData(null);
    });

    setOpenCardPreviewHook((card) => {
      playSound?.(SOUNDS?.seClick);
      setCardPreviewData({ card });
    });

    setCloseCardPreviewHook(handleCloseCardPreview);

    setShowCardAcquisitionModalHook((cardId) => {
      const card = CARD_MASTER?.find(c => c.id === cardId);
      if (card) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({ type: 'card', card, canClose: false });
        setTimeout(() => setAcquisitionData(prev => prev ? { ...prev, canClose: true } : null), 500);
      }
    });

    setShowPremiumAcquisitionModalHook((cardId) => {
      const card = CARD_MASTER?.find(c => c.id === cardId);
      if (card) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({ type: 'premium', card, canClose: false });
        setTimeout(() => setAcquisitionData(prev => prev ? { ...prev, canClose: true } : null), 500);
      }
    });

    setShowPlaymatAcquisitionModalHook((name, id) => {
      const playmat = PLAYMAT_MASTER?.find(p => p.id === id);
      if (playmat) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({ type: 'playmat', name, playmat, canClose: false });
        setTimeout(() => setAcquisitionData(prev => prev ? { ...prev, canClose: true } : null), 500);
      }
    });

    window.showCharDetailModal = (char) => {
      playSound?.(SOUNDS?.seClick);
      setCharDetailData(char);
    };

    window.closeCharDetailModal = () => {
      playSound?.(SOUNDS?.seClick);
      setCharDetailData(null);
    };

    window.showExchangeDetailModal = (data) => {
      playSound?.(SOUNDS?.seClick);
      let autoImgUrl = data.imgUrl;
      const validItemObj = (data.itemObj && Object.keys(data.itemObj).length > 0) ? data.itemObj : null;

      if (!autoImgUrl && validItemObj && typeof getCardImgUrl === 'function') {
        autoImgUrl = getCardImgUrl(validItemObj);
        if (data.type === 'premium') {
          autoImgUrl = autoImgUrl.replace('.jpg', '_premium.gif');
        }
      }

      setCardPreviewData({
        card: validItemObj || { id: data.id, name: data.titleName, flavor: data.displayFlavor, skills: [] },
        styleProps: {
          titleName: data.titleName || (data.itemObj?.name || data.id),
          displayType: data.displayType || (data.type === 'premium' ? 'プレミアム' : data.type === 'skin' ? 'スキン' : 'カード'),
          imgUrl: autoImgUrl,
          isSkin: data.type === 'skin',
          flavorOverride: data.displayFlavor,
          showPreviewActions: false,
          showExchangeActions: true,
          exchangeData: {
            cost: data.cost,
            isMaxed: data.isMaxed,
            canExchange: data.canExchange,
            type: data.type,
            onConfirm: data.onConfirm
          }
        }
      });
    };

    window.closeExchangeDetailModal = () => {
      playSound?.(SOUNDS?.seClick);
      setCardPreviewData(null);
    };

    window.showSyncDataModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setSyncDataVisible(true);
    };

    window.closeSyncDataModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setSyncDataVisible(false);
    };

    window.showPlayerNameModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setPlayerNameInput('');
      setPlayerNameVisible(true);
    };

    window.closePlayerNameModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setPlayerNameVisible(false);
    };

    window.showPlaymatSelectionModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setSelectedPlaymatState(GameState.selectedPlaymatId || null);
      setPlaymatSelectionVisible(true);
    };

    window.closePlaymatSelectionModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setPlaymatSelectionVisible(false);
      saveDeck?.();
    };

    window.showSkillConfirmModalReact = (data) => {
      setSkillConfirmData(data);
    };

    window.closeSkillConfirmModalReact = () => {
      setSkillConfirmData(null);
    };

    window.showSkillChoiceModalReact = (choices, onSelect, maxChoices = 1) => {
      setSkillChoiceData({ choices, onSelect, maxChoices, selectedIndices: [] });
    };

    window.closeSkillChoiceModalReact = () => {
      setSkillChoiceData(null);
    };

    window.showDiscardSelectionModalReact = (cards, maxPow, onSelect, options = {}) => {
      playSound?.(SOUNDS?.seClick);
      const optArgs = typeof options === 'boolean' ? { isViewOnly: options } : options;
      setDiscardSelectionData({ cards, maxPow, onSelect, ...optArgs });
    };

    window.showRulesModal = () => {
      playSound?.(SOUNDS?.seClick);
      setRulesVisible(true);
    };

    window.closeRulesModal = () => {
      playSound?.(SOUNDS?.seClick);
      setRulesVisible(false);
    };

    window.showSkinSelectionModalState = () => {
      playSound?.(SOUNDS?.seClick);
      // Access playerSkins via window.currentSkinCharId or pass it directly.
      // Easiest is to set selectedSkinState based on the *current detailed character*
      // which is passed down through charDetailData, but since we are inside useEffect
      // and window.function doesn't have closure over current charDetailData unless we are careful,
      // it's better to pass it as argument. But here we can just do it in the button click handler instead.
      setSkinSelectionVisible(true);
    };

    window.closeSkinSelectionModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setSkinSelectionVisible(false);
    };
  }, []);

  const handleConfirmOk = () => {
    playSound?.(SOUNDS?.seClick);
    const cb = confirmData?.onConfirm;
    setConfirmData(null);
    if (cb) cb();
  };

  const handleConfirmCancel = () => {
    playSound?.(SOUNDS?.seClick);
    const cb = confirmData?.onCancel;
    setConfirmData(null);
    if (cb) cb();
  };

  const reloadGame = () => {
    window.location.reload();
  };

  const handleTogglePremium = (e, cardId) => {
    e.stopPropagation();
    playSound?.(SOUNDS?.seClick);
    togglePremiumCard?.(cardId);

    // 更新を反映するために画面を再描画要求
    if (typeof renderCardList === 'function' && document.getElementById('screen-card-list')?.classList.contains('active')) {
      renderCardList();
    }
    if (typeof renderDeckEdit === 'function' && document.getElementById('screen-deck-edit')?.classList.contains('active')) {
      renderDeckEdit();
    }
    // Set state triggering re-render of preview
    setCardPreviewData(prev => ({ ...prev }));
  };

  const renderSkillTagReact = (card) => {
    if (!window.renderSkillTag) return null;
    return <div dangerouslySetInnerHTML={{ __html: window.renderSkillTag(card, false) }}></div>;
  };

  const renderCardPreviewContent = (card, styleProps = {}, showPremiumTag = false) => {
    const imgUrl = styleProps.imgUrl || (getCardImgUrl ? getCardImgUrl(card) : '');
    const isSkin = styleProps.isSkin || false;
    const rarityClass = card.rarity ? ` rarity-${card.rarity}` : '';
    const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15', 4: '#fde047' };
    const nameColor = styleProps.titleColor || rarityColors[card.rarity] || '#fff';
    const filter = GameState.playerConfig?.filter || 'none';

    let skillCandidates = [];
    if (card.skill && card.skill !== 'none' && card.skill !== undefined) skillCandidates.push({ id: card.skill, value: card.skillValue });
    if (Array.isArray(card.skills)) card.skills.forEach(sk => skillCandidates.push({ id: sk.id, value: sk.value }));

    let lookupId = card.baseId || card.id;
    let isPremiumActive = false;
    let isPremiumUnlocked = false;

    if (card.isPremium !== undefined) {
      isPremiumActive = card.isPremium;
    } else if (card.owner === 'red') {
      isPremiumActive = false;
    } else {
      isPremiumActive = GameState.premiumCards?.includes(lookupId);
      isPremiumUnlocked = GameState.unlockedPremiumCards?.includes(lookupId);
    }

    return (
      <div className={`preview-content ${styleProps.containerClass || ''}`} style={{ margin: styleProps.margin, cursor: 'default', borderColor: styleProps.borderColor, boxShadow: styleProps.boxShadow }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className={`card blue${!isSkin ? rarityClass : ''}`} style={{ width: '180px', height: '240px', position: 'relative', overflow: 'hidden' }}>
            <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')`, filter: filter, backgroundSize: isSkin ? 'contain' : 'cover', backgroundRepeat: isSkin ? 'no-repeat' : 'inherit', backgroundPosition: isSkin ? 'center bottom' : 'center center' }}></div>
            {!isSkin && <div className="card-power" style={{ fontSize: '2.5rem', bottom: '0', right: '5px' }}>{card.currentPower || card.power}</div>}
            {!isSkin && renderSkillTagReact(card)}
          </div>
        </div>
        <div className="preview-details">
          {showPremiumTag && (
            <div style={{ background: 'linear-gradient(45deg, #d946ef, #9333ea)', color: 'white', padding: '2px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '5px', alignSelf: 'center', display: 'inline-block' }}>
              PREMIUM UNLOCK
            </div>
          )}
          <h2 className={card.rarity === 4 && !isSkin ? 'rarity-4-text' : ''} style={{ color: nameColor, marginTop: showPremiumTag ? '5px' : '0' }}>
            {styleProps.titleName || card.name}
            {styleProps.displayType && <span className="skip-rarity-text" style={{ color: '#3b82f6', marginLeft: '5px', WebkitBackgroundClip: 'border-box', WebkitTextFillColor: 'initial' }}>({styleProps.displayType})</span>}
          </h2>

          <div className="preview-scroll-area">
            {!isSkin && (
              <div className="preview-skills-list">
                {skillCandidates.length > 0 ? skillCandidates.map((sk, idx) => {
                  const s = SKILLS?.[sk.id];
                  if (!s) return null;
                  const val = (sk.value === null || sk.value === undefined) ? '' : sk.value;
                  const desc = typeof s.desc === 'function' ? s.desc(sk.value) : s.desc;

                  if (sk.id === 'choice' && Array.isArray(card.choices)) {
                    return (
                      <div key={idx} className="preview-skill-item">
                        <details className="choice-accordion" style={{ width: '100%' }}>
                          <summary style={{ listStyle: 'none', cursor: 'pointer', outline: 'none', width: '100%' }}>
                            <div className="preview-skill-badge" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '110px', position: 'relative', margin: '0 auto' }}>
                              <span>{s.icon} {s.name}{val}</span>
                              <span className="accordion-icon" style={{ fontSize: '0.8rem', transition: 'transform 0.2s', position: 'absolute', right: '8px' }}>▼</span>
                            </div>
                            <p className="preview-skill-desc" style={{ marginTop: '6px', marginBottom: '8px', color: '#f8fafc', textAlign: 'center' }}>{desc}</p>
                          </summary>
                          <div className="accordion-content" style={{ marginTop: '5px' }}>
                            {card.choices.map((cho, cIdx) => {
                              const cs = SKILLS?.[cho.id];
                              if (!cs) return null;
                              const cVal = (cho.value === null || cho.value === undefined) ? '' : cho.value;
                              const cDesc = typeof cs.desc === 'function' ? cs.desc(cho.value) : cs.desc;
                              return (
                                <div key={cIdx} style={{ marginLeft: '10px', borderLeft: '2px solid #475569', paddingLeft: '10px', marginTop: '8px', marginBottom: '8px' }}>
                                  <div className="preview-skill-badge" style={{ background: 'rgba(148, 163, 184, 0.2)', borderColor: '#94a3b8', color: '#94a3b8', fontSize: '0.75rem' }}>{cs.icon} {cs.name}{cVal}</div>
                                  <p className="preview-skill-desc" style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 0 0' }}>{cDesc}</p>
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
                      <div className="preview-skill-badge">{s.icon} {s.name}{val}</div>
                      <p className="preview-skill-desc">{desc}</p>
                    </div>
                  );
                }) : (
                  <p className="preview-skill-desc">能力なし</p>
                )}
              </div>
            )}
            <p className="preview-flavor-text" style={{ display: 'block' }}>{styleProps.flavorOverride || card.flavor || '...'}</p>
          </div>

          {/* Preview Modal Actions */}
          {styleProps.showPreviewActions && isPremiumUnlocked && card.owner !== 'red' && (
            <button
              className="btn"
              style={{ marginTop: '10px', width: '100%', flexShrink: 0, background: isPremiumActive ? 'linear-gradient(45deg, #d946ef, #9333ea)' : '#475569', fontSize: '0.9rem', padding: '10px 5px' }}
              onClick={(e) => handleTogglePremium(e, card.id)}
            >
              {isPremiumActive ? '✨ プレミアムON' : '✨ プレミアムOFF'}
            </button>
          )}
          {styleProps.showPreviewActions && (
            <button className="btn" style={{ marginTop: '15px', width: '100%', flexShrink: 0 }} onClick={handleCloseCardPreview}>閉じる</button>
          )}

          {/* Acquisition Action */}
          {styleProps.showAcquisitionOk && (
            <button
              className="btn ok-button"
              style={{ marginTop: '15px', width: '110px', alignSelf: 'center', background: styleProps.okBg || 'linear-gradient(45deg, #facc15, #eab308)', color: styleProps.okColor || '#000', fontWeight: 'bold', pointerEvents: acquisitionData?.canClose ? 'auto' : 'none', opacity: acquisitionData?.canClose ? 1 : 0.5 }}
              onClick={() => { playSound?.(SOUNDS?.seClick); setAcquisitionData(null); }}
            >
              OK
            </button>
          )}

          {/* Exchange Action */}
          {styleProps.showExchangeActions && styleProps.exchangeData && (
            <>
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', marginTop: '10px', border: '1px solid #475569', textAlign: 'center' }}>
                <div style={{ color: '#facc15', fontWeight: 'bold', fontSize: '0.7rem', marginBottom: '2px' }}>必要ポイント</div>
                <div style={{ fontSize: '1.2rem', color: '#10b981', fontWeight: 'bold' }}>{styleProps.exchangeData.cost} pt</div>
              </div>
              <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px', flexShrink: 0 }}>
                <button className="btn" style={{ flex: 1, minHeight: '40px', padding: '5px', background: '#475569', marginTop: 0, fontSize: '0.9rem' }} onClick={window.closeExchangeDetailModal}>戻る</button>
                <button
                  className="btn"
                  style={{ flex: 1, minHeight: '40px', padding: '5px', background: styleProps.exchangeData.isMaxed || !styleProps.exchangeData.canExchange ? '#475569' : 'linear-gradient(45deg, #f97316, #ea580c)', color: styleProps.exchangeData.isMaxed || !styleProps.exchangeData.canExchange ? '#94a3b8' : '#ffffff', marginTop: 0, fontSize: '0.9rem' }}
                  onClick={() => {
                    if (styleProps.exchangeData.isMaxed) {
                      showAlertModal?.(styleProps.exchangeData.type === 'premium' ? "既にプレミアム化済みです。" : "所持または交換上限に達しています。");
                    } else if (!styleProps.exchangeData.canExchange) {
                      showAlertModal?.("ポイントが足りません！");
                    } else {
                      if (styleProps.exchangeData.onConfirm) {
                        styleProps.exchangeData.onConfirm();
                      } else {
                        confirmExchange?.();
                      }
                    }
                  }}
                >
                  {styleProps.exchangeData.isMaxed ? '交換済み' : (!styleProps.exchangeData.canExchange ? 'ポイント不足' : '交換')}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    );
  };

  return (
    <>
      {/* Confirm Modal */}
      {confirmData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div className="skill-modal-box modal-pop-animation">
            <h2 style={{ color: '#facc15', marginBottom: '10px' }}>{confirmData.isAlert ? "お知らせ" : "確認"}</h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', textAlign: 'center', marginBottom: '15px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{confirmData.message}</p>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              {!confirmData.isAlert && (
                <button className="btn" style={{ flex: 1, background: '#475569', margin: 0 }} onClick={handleConfirmCancel}>キャンセル</button>
              )}
              <button className="btn" style={{ flex: 1, background: 'linear-gradient(45deg, #0ea5e9, #0284c7)', margin: 0 }} onClick={handleConfirmOk}>{confirmData.isAlert ? "閉じる" : "OK"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div className="skill-modal-box modal-pop-animation" style={{ borderColor: '#ef4444', maxWidth: '400px' }}>
            <h2 style={{ color: '#ef4444', marginBottom: '15px' }}>エラーが発生しました</h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', textAlign: 'left', marginBottom: '25px', lineHeight: 1.6, width: '100%', maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
              {errorData.message || "予期しないエラーが発生しました。"}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '20px', textAlign: 'center' }}>
              ブラウザのキャッシュにより問題が継続する場合があります。<br />下のボタンから最新状態で再読み込みしてください。
            </p>
            <button className="btn" style={{ width: '100%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }} onClick={reloadGame}>更新してタイトルへ</button>
          </div>
        </div>
      )}

      {/* Enemy Deck Modal */}
      {enemyDeckData && (
        <div className="modal-overlay" style={{ zIndex: 2000, display: 'flex' }} onClick={closeEnemyDeckModal}>
          <div className="skill-modal-box modal-pop-animation" style={{ width: '95%', maxWidth: '440px', padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#facc15', marginBottom: '15px' }}>{enemyDeckData.title}</h2>
            <div className="card-list-container">
              <div className="card-list-grid-3col" style={{ padding: '10px' }}>
                {(() => {
                  const grouped = {};
                  enemyDeckData.deck.forEach(cardItem => {
                    let cardId = typeof cardItem === 'object' ? cardItem.id : cardItem;
                    if (!grouped[cardId]) grouped[cardId] = 0;
                    grouped[cardId]++;
                  });

                  return Object.keys(grouped).map((cardId) => {
                    const count = grouped[cardId];
                    const template = CARD_MASTER?.find(m => m.id === cardId);
                    if (!template) return null;

                    const originalItem = enemyDeckData.deck.find(c => (typeof c === 'object' ? c.id === cardId : c === cardId));
                    const isPremium = typeof originalItem === 'object' ? !!originalItem.isPremium : false;
                    const displayCard = { ...template, owner: 'red', isPremium };

                    const imgUrl = getCardImgUrl ? getCardImgUrl(displayCard) : '';
                    const rarityClass = displayCard.rarity ? ` rarity-${displayCard.rarity}` : '';
                    return (
                      <div key={cardId} className="deck-card-item gallery-card-wrapper" onClick={() => openCardPreview?.(displayCard)}>
                        <div className={`card red${rarityClass}`}>
                          <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')` }}></div>
                          <div className="card-power" style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}>{displayCard.power}</div>
                          {renderSkillTagReact(displayCard)}
                          <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.85)', color: '#facc15', padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold', fontSize: '0.75rem', zIndex: 6, border: '1px solid #facc15' }}>
                            x{count}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            {(enemyDeckData.title === 'デッキ確認' || enemyDeckData.title === '所持カード確認') && GameState.playerConfig && GameState.playerConfig.leaderSkill && (
              <button
                className="btn"
                style={{ marginTop: '20px', width: '100%', background: '#475569', fontSize: '1rem', padding: '8px', marginBottom: '0' }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  if (window.showSkillConfirmModalReact) {
                    window.showSkillConfirmModalReact({
                      skill: GameState.playerConfig.leaderSkill,
                      statusText: '',
                      color: '#94a3b8',
                      canExecute: false
                    });
                  }
                }}
              >リーダースキル</button>
            )}
            {!(enemyDeckData.title === 'デッキ確認' || enemyDeckData.title === '所持カード確認') && GameState.enemyConfig && GameState.enemyConfig.leaderSkill && (
              <button
                className="btn"
                style={{ marginTop: '20px', width: '100%', background: '#475569', fontSize: '1rem', padding: '8px', marginBottom: '0' }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  if (window.showSkillConfirmModalReact) {
                    window.showSkillConfirmModalReact({
                      skill: GameState.enemyConfig.leaderSkill,
                      statusText: '',
                      color: '#94a3b8',
                      canExecute: false
                    });
                  }
                }}
              >リーダースキル</button>
            )}
            <button className="btn" style={{ marginTop: '10px', width: '100%' }} onClick={closeEnemyDeckModal}>閉じる</button>
          </div>
        </div>
      )}

      {/* Card Preview Modal */}
      {cardPreviewData && (
        <div className="modal-overlay" style={{ zIndex: 3500, display: 'flex' }} onClick={handleCloseCardPreview}>
          {renderCardPreviewContent(
            cardPreviewData.card,
            cardPreviewData.styleProps || { showPreviewActions: true }
          )}
        </div>
      )}

      {/* Acquisition Modals (Card, Premium, Playmat) */}
      {acquisitionData && (
        <div className="modal-overlay" style={{ zIndex: 3000, display: 'flex', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.4s' }}>
          {acquisitionData.type === 'card' && renderCardPreviewContent(acquisitionData.card, { containerClass: 'acquisition-glow', margin: '0 !important', showAcquisitionOk: true })}

          {acquisitionData.type === 'premium' && renderCardPreviewContent(acquisitionData.card, { containerClass: 'acquisition-glow', margin: '0 !important', borderColor: '#d946ef', boxShadow: '0 0 30px rgba(217, 70, 239, 0.5)', showAcquisitionOk: true, okBg: 'linear-gradient(45deg, #d946ef, #9333ea)', okColor: '#fff' }, true)}

          {acquisitionData.type === 'playmat' && (
            <div style={{ background: 'var(--panel-bg, #1e293b)', border: '2px solid #facc15', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 30px rgba(242, 201, 76, 0.5)' }} onClick={e => e.stopPropagation()}>
              <h2 style={{ color: '#facc15', marginBottom: '20px' }}>プレイマット獲得！</h2>
              <div style={{ width: '100%', height: '160px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #facc15', marginBottom: '20px', boxShadow: '0 0 15px rgba(242, 201, 76, 0.3)' }}>
                <img src={acquisitionData.playmat.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Playmat" />
              </div>
              <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '25px' }}>
                プレイマット「{acquisitionData.name}」を入手しました！
              </p>
              <button
                className="btn ok-button"
                style={{ background: 'linear-gradient(45deg, #facc15, #eab308)', color: '#000', fontWeight: 'bold', width: '110px', alignSelf: 'center', margin: 0, pointerEvents: acquisitionData.canClose ? 'auto' : 'none', opacity: acquisitionData.canClose ? 1 : 0.5 }}
                onClick={() => { playSound?.(SOUNDS?.seClick); setAcquisitionData(null); }}
              >
                OK
              </button>
            </div>
          )}
        </div>
      )}

      {/* Point Acquisition Modal */}
      {pointAcquisitionData && (
        <div className="modal-overlay" style={{ zIndex: 3200, display: 'flex', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', animation: 'fadeIn 0.3s' }} onClick={() => pointAcquisitionData.onClose && pointAcquisitionData.onClose()}>
          <div className="skill-modal-box modal-pop-animation" style={{ border: `2px solid ${pointAcquisitionData.color || '#facc15'}`, textAlign: 'center', maxWidth: '400px', width: '90%', padding: '30px 20px', boxShadow: `0 0 40px ${pointAcquisitionData.color || '#facc15'}66` }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: pointAcquisitionData.color || '#facc15', marginBottom: '20px', fontSize: '1.4rem', textShadow: '1px 1px 2px #000' }}>{pointAcquisitionData.title}</h2>

            <p style={{ color: '#fff', fontSize: '1rem', marginBottom: '10px', whiteSpace: 'pre-line', lineHeight: '1.5' }}>{pointAcquisitionData.message}</p>

            <div style={{ fontSize: '3.5rem', margin: '20px 0', fontWeight: 'bold', color: '#fff', textShadow: `0 0 20px ${pointAcquisitionData.color || '#facc15'}` }}>
              ✨ <span style={{ color: pointAcquisitionData.color || '#facc15' }}>{pointAcquisitionData.points}</span> <span style={{ fontSize: '1.5rem' }}>Pt</span>
            </div>

            {pointAcquisitionData.totalPoints !== undefined && (
              <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginBottom: '30px' }}>現在の累計: {pointAcquisitionData.totalPoints} Pt</p>
            )}

            <button
              className="btn ok-button"
              style={{ width: '150px', margin: '0 auto', background: `linear-gradient(45deg, ${pointAcquisitionData.color || '#facc15'}, ${pointAcquisitionData.darkColor || '#eab308'})`, color: '#000', fontWeight: 'bold' }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                if (pointAcquisitionData.onClose) pointAcquisitionData.onClose();
                setPointAcquisitionData(null);
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Character Detail Modal */}
      {charDetailData && (
        <div className="screen" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--panel-bg, #1e293b)', border: '2px solid #facc15', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
            {(() => {
              const isEnemySelection = GameState.appState === 'select_enemy' || charDetailData.isDungeonEnemy;
              const skinIdToUse = isEnemySelection ? 'default' : (selectedSkinState || GameState.playerSkins[charDetailData.id] || 'default');
              return <img src={getSkinImage(charDetailData.id, skinIdToUse, 'image')} style={{ width: '160px', height: '200px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #334155', marginBottom: '15px' }} alt={charDetailData.name} />;
            })()}

            <h2 style={{ marginBottom: '5px', color: charDetailData.color || '#facc15', fontSize: '1.3rem', textAlign: 'center' }}>{charDetailData.name}</h2>

            {charDetailData.easeOfUse && (
              <div style={{ color: '#fbd38d', fontSize: '0.95rem', marginBottom: '5px', textShadow: '1px 1px 2px #000' }}>
                使いやすさ: {'★'.repeat(charDetailData.easeOfUse)}{'☆'.repeat(3 - charDetailData.easeOfUse)}
              </div>
            )}

            <p style={{ fontSize: '0.9rem', color: '#cbd5e1', textAlign: 'center', marginBottom: '15px', lineHeight: 1.4 }}>{charDetailData.desc}</p>

            {charDetailData.leaderSkill && (
              <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', width: '100%', boxSizing: 'border-box', marginBottom: '15px', border: '1px solid #475569' }}>
                <div style={{ color: '#facc15', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '5px' }}>【リーダー能力】</div>
                <div style={{ fontWeight: 'bold', marginBottom: '3px', color: '#fff' }}>
                  {charDetailData.leaderSkill.name} {charDetailData.leaderSkill.cost ? `(必要SP: ${charDetailData.leaderSkill.cost})` : ''}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.3 }}>{charDetailData.leaderSkill.desc}</div>
              </div>
            )}

            {!(GameState.appState === 'select_enemy' || charDetailData.isDungeonEnemy) && (
              <button
                className="btn"
                style={{ width: '100%', marginBottom: '10px', background: 'linear-gradient(45deg, #c084fc, #9333ea)', border: 'none', color: 'white', padding: '10px', borderRadius: '8px', fontWeight: 'bold', textShadow: '1px 1px 2px #000' }}
                onClick={() => {
                  setSelectedSkinState(GameState.playerSkins[charDetailData.id] || 'default');
                  if (window.showSkinSelectionModalState) window.showSkinSelectionModalState();
                }}
              >
                ✨ スキン変更
              </button>
            )}

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button className="btn" style={{ flex: 1, background: '#475569', margin: 0 }} onClick={window.closeCharDetailModal}>戻る</button>
              <button className="btn" style={{ flex: 1, background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)', margin: 0 }} onClick={() => { setCharDetailData(null); confirmCharSelect?.(); }}>決定</button>
            </div>
          </div>
        </div>
      )}

      {/* Exchange Detail Modal (Deleted, now unified with Card Preview Modal) */}

      {/* Sync Data Modal */}
      {syncDataVisible && (
        <div className="screen" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 70, display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--panel-bg, #1e293b)', border: '2px solid #94a3b8', borderRadius: '12px', padding: '30px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#f8fafc', marginBottom: '20px' }}>データ連携</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
              <button className="btn" style={{ background: 'linear-gradient(45deg, #0ea5e9, #2563eb)', margin: 0 }} onClick={backupDataToXML}>バックアップ</button>
              <button className="btn" style={{ background: 'linear-gradient(45deg, #10b981, #059669)', margin: 0 }} onClick={importDataFromXML}>データ取込</button>
              <button className="btn" style={{ background: '#475569', marginTop: '5px' }} onClick={window.closeSyncDataModalState}>戻る</button>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '20px', textAlign: 'center', lineHeight: 1.4 }}>
              バックアップしたXMLファイルを保存するか、保存したファイルからデータを復元できます。
            </p>
          </div>
        </div>
      )}

      {/* Player Name Modal */}
      {playerNameVisible && (
        <div className="screen" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--panel-bg, #1e293b)', border: '2px solid #10b981', borderRadius: '12px', padding: '30px', width: '90%', maxWidth: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#10b981', marginBottom: '20px', fontSize: '1.2rem' }}>プレイヤーネーム登録</h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '15px', textAlign: 'center' }}>防衛デッキに使用する名前を入力してください。</p>
            <input
              type="text"
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              placeholder="名前を入力..."
              maxLength="12"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', background: '#0f172a', color: '#fff', fontSize: '1rem', marginBottom: '25px', outline: 'none', textAlign: 'center' }}
            />
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button className="btn" style={{ flex: 1, background: '#475569', margin: 0, fontSize: '0.85rem', paddingLeft: '10px', paddingRight: '10px', whiteSpace: 'nowrap' }} onClick={window.closePlayerNameModalState}>キャンセル</button>
              <button
                className="btn"
                style={{ flex: 1, background: 'linear-gradient(45deg, #10b981, #059669)', margin: 0, fontSize: '0.85rem', paddingLeft: '10px', paddingRight: '10px', whiteSpace: 'nowrap' }}
                onClick={() => {
                  if (window.submitDefenseDeckWrapper) {
                    window.submitDefenseDeckWrapper(playerNameInput);
                  } else if (submitDefenseDeck) {
                    submitDefenseDeck(playerNameInput);
                  }
                }}
              >
                完了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playmat Selection Modal */}
      {playmatSelectionVisible && (
        <div className="screen" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 80, display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--panel-bg, #1e293b)', border: '2px solid #facc15', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '400px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#facc15', marginBottom: '15px', fontSize: '1.2rem' }}>プレイマット設定</h2>

            <div style={{ width: '100%', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '5px', boxSizing: 'border-box' }}>
              <div
                style={{
                  padding: '12px',
                  background: (!selectedPlaymatState || selectedPlaymatState === 'null') ? 'rgba(242, 201, 76, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                  border: `2px solid ${(!selectedPlaymatState || selectedPlaymatState === 'null') ? '#facc15' : '#475569'}`,
                  borderRadius: '8px', color: '#fff', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', transition: 'all 0.2s'
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  GameState.selectedPlaymatId = null;
                  setSelectedPlaymatState(null);
                }}
              >
                未選択
              </div>

              {PLAYMAT_MASTER?.filter(p => ownedPlaymats?.includes(p.id)).map(p => {
                const isSelected = selectedPlaymatState === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '8px',
                      background: isSelected ? 'rgba(242, 201, 76, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                      border: `2px solid ${isSelected ? '#facc15' : '#475569'}`,
                      borderRadius: '8px', color: '#fff', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onClick={() => {
                      playSound?.(SOUNDS?.seClick);
                      GameState.selectedPlaymatId = p.id;
                      setSelectedPlaymatState(p.id);
                    }}
                  >
                    <div style={{ width: '80px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #475569', flexShrink: 0 }}>
                      <img src={p.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={p.name} />
                    </div>
                    <div style={{ flex: 1, fontWeight: 'bold', fontSize: '0.9rem' }}>{p.name}</div>
                  </div>
                );
              })}

              {(!ownedPlaymats || ownedPlaymats.length === 0) && (
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
                  解放済みのプレイマットがありません。<br />実績を達成して入手しましょう！
                </div>
              )}
            </div>

            <div style={{ marginTop: '15px', width: '100%', display: 'flex', justifyContent: 'center' }}>
              <button className="btn" style={{ background: '#475569', margin: 0 }} onClick={window.closePlaymatSelectionModalState}>戻る</button>
            </div>
          </div>
        </div>
      )}

      {/* Skin Selection Modal */}
      {skinSelectionVisible && (
        <div className="screen" style={{ background: 'rgba(0,0,0,0.85)', zIndex: 80, display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--panel-bg, #1e293b)', border: '2px solid #c084fc', borderRadius: '12px', padding: '20px', width: '90%', maxWidth: '400px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#c084fc', marginBottom: '15px', fontSize: '1.2rem' }}>キャラスキン設定</h2>

            <div style={{ width: '100%', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '5px', boxSizing: 'border-box' }}>
              {charDetailData && charDetailData.skins && Object.keys(charDetailData.skins).map(skinId => {
                const skinDef = charDetailData.skins[skinId];
                const isSelected = selectedSkinState === skinId;
                const isUnlocked = skinId === 'default' || (GameState.unlockedSkins && GameState.unlockedSkins.includes(`${charDetailData.id}_${skinId}`));

                return (
                  <div
                    key={skinId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '8px',
                      background: isSelected ? 'rgba(192, 132, 252, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                      border: `2px solid ${isSelected ? '#c084fc' : '#475569'}`,
                      borderRadius: '8px', color: '#fff',
                      cursor: isUnlocked ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      opacity: isUnlocked ? 1 : 0.5
                    }}
                    onClick={() => {
                      if (!isUnlocked) return;
                      playSound?.(SOUNDS?.seClick);
                      GameState.playerSkins[charDetailData.id] = skinId;
                      localStorage.setItem('mini_card_battle_player_skins', JSON.stringify(GameState.playerSkins));
                      setSelectedSkinState(skinId);
                      if (window.closeSkinSelectionModalState) window.closeSkinSelectionModalState();
                      if (window.forceUpdateSelectScreen) window.forceUpdateSelectScreen();
                    }}
                  >
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', overflow: 'hidden', border: '2px solid #475569', flexShrink: 0 }}>
                      <img src={skinDef.icon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={skinDef.name} />
                    </div>
                    <div style={{ flex: 1, fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', flexDirection: 'column' }}>
                      <span>{skinDef.name}</span>
                      {!isUnlocked && <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 'normal' }}>未解放 (試練交換所で入手)</span>}
                    </div>
                  </div>
                );
              })}

              {(!charDetailData || !charDetailData.skins) && (
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
                  このキャラクターには変更可能なスキンがありません。
                </div>
              )}
            </div>

            <div style={{ marginTop: '15px', width: '100%', display: 'flex', justifyContent: 'center' }}>
              <button className="btn" style={{ background: '#475569', margin: 0 }} onClick={window.closeSkinSelectionModalState}>戻る</button>
            </div>
          </div>
        </div>
      )}

      {/* Skill Confirm Modal */}
      {skillConfirmData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 2500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }} onClick={window.closeSkillConfirmModalReact}>
          <div className="skill-modal-box modal-pop-animation" onClick={e => e.stopPropagation()}>
            <h2 id="skill-confirm-name" style={{ color: '#facc15', marginBottom: '10px' }}>{skillConfirmData.skill.name}</h2>
            <p id="skill-confirm-desc" style={{ color: '#cbd5e1', fontSize: '0.9rem', textAlign: 'center', marginBottom: '15px', lineHeight: 1.4 }}>{skillConfirmData.skill.desc}</p>
            <div id="skill-confirm-status" style={{ margin: '10px 0 20px 0', fontWeight: 'bold', fontSize: '1.1rem', color: skillConfirmData.color }}>
              {skillConfirmData.statusText}
            </div>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button className="btn" style={{ flex: 1, background: '#475569', marginTop: 0 }} onClick={window.closeSkillConfirmModalReact}>閉じる</button>
              {skillConfirmData.canExecute && (
                <button
                  id="btn-execute-skill"
                  className="btn"
                  style={{ flex: 1, background: 'linear-gradient(45deg, #ef4444, #b91c1c)', marginTop: 0 }}
                  onClick={() => {
                    window.closeSkillConfirmModalReact();
                    if (skillConfirmData.onExecute) skillConfirmData.onExecute();
                  }}
                >
                  使用する
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Skill Choice Modal */}
      {skillChoiceData && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div className="skill-modal-box modal-pop-animation">
            <h2 style={{ color: '#facc15', marginBottom: '20px', textAlign: 'center' }}>スキルを選択 {skillChoiceData.maxChoices > 1 ? `(${skillChoiceData.selectedIndices.length}/${skillChoiceData.maxChoices})` : ''}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
              {skillChoiceData.choices.map((sk, idx) => {
                const skillDef = SKILLS[sk.id] || { name: '不明', icon: '❓', desc: () => '' };
                const val = sk.value || '';
                const isSelected = skillChoiceData.selectedIndices.includes(idx);

                return (
                  <div
                    key={idx}
                    className="preview-skill-item"
                    style={{
                      cursor: 'pointer',
                      transition: 'transform 0.2s, border-color 0.2s, background-color 0.2s',
                      border: `2px solid ${isSelected ? '#facc15' : 'rgba(250, 204, 21, 0.1)'}`,
                      backgroundColor: isSelected ? 'rgba(250, 204, 21, 0.1)' : 'transparent',
                      borderRadius: '8px',
                      padding: '10px'
                    }}
                    onClick={() => {
                      playSound?.(SOUNDS?.seClick);
                      if (skillChoiceData.maxChoices === 1) {
                        const { onSelect } = skillChoiceData;
                        setSkillChoiceData(null);
                        if (onSelect) onSelect([sk]);
                      } else {
                        // Multi-select toggle
                        setSkillChoiceData(prev => {
                          let newIndices = [...prev.selectedIndices];
                          if (newIndices.includes(idx)) {
                            newIndices = newIndices.filter(i => i !== idx);
                          } else if (newIndices.length < prev.maxChoices) {
                            newIndices.push(idx);
                          }
                          return { ...prev, selectedIndices: newIndices };
                        });
                      }
                    }}
                    onMouseOver={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.borderColor = '#facc15';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.borderColor = 'rgba(250, 204, 21, 0.1)';
                      }
                    }}
                  >
                    <div className="preview-skill-badge" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '0 auto 10px auto', width: 'fit-content', minWidth: '120px' }}>
                      {skillDef.icon} {skillDef.name} {val}
                    </div>
                    <p className="preview-skill-desc" style={{ textAlign: 'center', margin: 0 }}>
                      {typeof skillDef.desc === 'function' ? skillDef.desc(sk.value) : skillDef.desc}
                    </p>
                  </div>
                );
              })}
            </div>
            {skillChoiceData.maxChoices > 1 && (
              <button
                className="btn ok-button"
                style={{
                  marginTop: '20px', width: '100%',
                  background: skillChoiceData.selectedIndices.length > 0 ? 'linear-gradient(45deg, #10b981, #059669)' : '#475569',
                  color: skillChoiceData.selectedIndices.length > 0 ? '#fff' : '#94a3b8',
                  pointerEvents: skillChoiceData.selectedIndices.length > 0 ? 'auto' : 'none'
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  const selectedSkills = skillChoiceData.selectedIndices.map(i => skillChoiceData.choices[i]);
                  const { onSelect } = skillChoiceData;
                  setSkillChoiceData(null);
                  if (onSelect) onSelect(selectedSkills);
                }}
              >
                決定
              </button>
            )}
          </div>
        </div>
      )}

      {/* Discard Selection Modal */}
      {discardSelectionData && (
        <div className="modal-overlay" style={{ zIndex: 3500, display: 'flex' }}>
          <div className="skill-modal-box modal-pop-animation" style={{ width: '95%', maxWidth: '440px', padding: '20px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#facc15', marginBottom: '10px' }}>
              {discardSelectionData.isViewOnly ? '墓地一覧' : (discardSelectionData.title || '復活させるカードを選択')}
            </h2>
            {!discardSelectionData.isViewOnly && (
              <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '15px' }}>
                {discardSelectionData.desc || `パワー${discardSelectionData.maxPow}以下のカードを1枚場に出します。`}
              </p>
            )}
            <div className="card-list-container" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              <div id="gallery-card-grid" className="card-list-grid-3col">
                {discardSelectionData.cards.map((cardItem, idx) => {
                  const imgUrl = getCardImgUrl ? getCardImgUrl(cardItem) : '';
                  const rarityClass = cardItem.rarity ? ` rarity-${cardItem.rarity}` : '';
                  return (
                    <div
                      key={idx}
                      className="deck-card-item gallery-card-wrapper"
                      onPointerDown={(e) => {
                        if (e.pointerType === 'mouse' && e.button !== 0) return;
                        g_discardHasLongPressed = false;
                        g_discardLongPressTimer = setTimeout(() => {
                          g_discardHasLongPressed = true;
                          if (window.showCardDetailReact) window.showCardDetailReact(cardItem);
                        }, 600);
                      }}
                      onPointerUp={() => { if (g_discardLongPressTimer) clearTimeout(g_discardLongPressTimer); }}
                      onPointerLeave={() => { if (g_discardLongPressTimer) clearTimeout(g_discardLongPressTimer); }}
                      onPointerCancel={() => { if (g_discardLongPressTimer) clearTimeout(g_discardLongPressTimer); }}
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => {
                        if (g_discardHasLongPressed) return;
                        playSound?.(SOUNDS?.seClick);
                        if (discardSelectionData.isViewOnly) {
                          if (window.showCardDetailReact) window.showCardDetailReact(cardItem);
                          return;
                        }
                        const cb = discardSelectionData.onSelect;
                        setDiscardSelectionData(null);
                        if (cb) cb(cardItem);
                      }}
                      style={{ cursor: 'pointer', transition: 'transform 0.2s', flexShrink: 0, minWidth: '90px' }}
                      onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      <div className={`card blue${rarityClass}`}>
                        <div className="card-bg" style={{ backgroundImage: `url('${imgUrl}')` }}></div>
                        <div className="card-power" style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}>{cardItem.power}</div>
                        {renderSkillTagReact(cardItem)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#fff', textAlign: 'center', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cardItem.name}
                      </div>
                    </div>
                  );
                })}
                {discardSelectionData.cards.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>墓地にはカードがありません</div>
                )}
              </div>
            </div>
            {/* 閲覧モードと選択モード両方で閉じる/選択しないボタンを表示 */}
            <button className="btn" style={{ marginTop: '20px', width: '100%', background: '#475569' }} onClick={() => {
              const cb = discardSelectionData.onSelect;
              setDiscardSelectionData(null);
              if (cb && !discardSelectionData.isViewOnly) cb(null);
            }}>{discardSelectionData.isViewOnly ? '閉じる' : '選択しない'}</button>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {rulesVisible && (
        <div id="modal-rules" className="rules-modal-overlay" style={{ display: 'flex', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', zIndex: 5000, alignItems: 'center', justifyContent: 'center' }} onClick={window.closeRulesModal}>
          <div className="skill-modal-box modal-pop-animation" style={{ width: '90%', maxWidth: '400px', padding: '25px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#facc15', marginBottom: '20px' }}>遊び方</h2>
            <div className="rule-box" style={{ maxHeight: '350px' }}>
              <div className="rule-section">
                <div className="rule-category">【デッキ編成】</div>
                <ul>
                  <li>デッキに同じカードは4枚まで入れられます。</li>
                </ul>
              </div>
              <div className="rule-section">
                <div className="rule-category">【バトル】</div>
                <ul>
                  <li>毎ターン、手札から1枚を自分のレーンに召喚します。<span style={{ color: '#94a3b8' }}>（先攻1ターン目は中央のみ）</span></li>
                  <li>置き直しの場合、下のカードは破棄されます。</li>
                  <li><b>ターン開始時</b>に、場のカードが一斉に正面へ<b>攻撃</b>します。</li>
                  <li>正面に敵がいれば戦闘となり、お互いにパワー分ダメージを与えます。</li>
                  <li>正面が空いていれば相手リーダーに直接ダメージ！</li>
                  <li>相手リーダーのHPを0にすれば勝利です。</li>
                </ul>
              </div>
              <div className="rule-section">
                <div className="rule-category">【リーダー能力】</div>
                <ul>
                  <li>毎ターン「SP」が溜まります。<span style={{ color: '#94a3b8' }}>（先攻1ターン目は溜まりません）</span></li>
                  <li>SPがMAXで「リーダースキル」を発動可能！</li>
                </ul>
              </div>
            </div>
            <button className="btn" style={{ marginTop: '20px', width: '100%' }} onClick={window.closeRulesModal}>閉じる</button>
          </div>
        </div>
      )}
    </>
  );
}
