import { useState, useEffect } from 'react';

import { CARD_MASTER } from '../utils/constants/cards.js';
import { EXCHANGE_LINEUP } from '../utils/constants/config.js';
import {
  playSound,
  isTransitioning,
  switchScreen,
  getCardImgUrl,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { GameState } from '../hooks/gameState.js';
import {
  setRenderExchangeHook,
  showExchangeDetail,
} from '../hooks/uiMainCore.js';
import { showAlertModal, showConfirmModal } from '../hooks/uiModals.js';

export default function ExchangeScreen() {
  const [points, setPoints] = useState({ current: 0, total: 0 });
  const [exchangeItems, setExchangeItems] = useState([]);
  const [inventory, setInventory] = useState({});
  const [unlockedPremium, setUnlockedPremium] = useState([]);
  let debugClickCount = 0;

  const updateExchange = () => {
    const currentPts =
      parseInt(localStorage.getItem('mini_card_battle_defense_points')) || 0;
    const totalPts =
      parseInt(localStorage.getItem('mini_card_battle_defense_total_points')) ||
      0;
    setPoints({ current: currentPts, total: totalPts });

    setInventory(GameState.playerInventory || {});
    setUnlockedPremium(GameState.unlockedPremiumCards || []);
    setExchangeItems(EXCHANGE_LINEUP || []);
  };

  useEffect(() => {
    updateExchange();
    setRenderExchangeHook(updateExchange); // グローバルからの再描画フック
  }, []);

  const handleTitleClick = () => {
    debugClickCount++;
    if (debugClickCount >= 10) {
      debugClickCount = 0;
      if (showConfirmModal) {
        showConfirmModal(
          'デバッグモードを起動して防衛ポイントを100Pt獲得しますか？',
          () => {
            playSound?.(SOUNDS?.seSkill);
            let cPts =
              parseInt(
                localStorage.getItem('mini_card_battle_defense_points')
              ) || 0;
            let tPts =
              parseInt(
                localStorage.getItem('mini_card_battle_defense_total_points')
              ) || 0;
            cPts += 100;
            tPts += 100;
            localStorage.setItem('mini_card_battle_defense_points', cPts);
            localStorage.setItem('mini_card_battle_defense_total_points', tPts);
            if (showAlertModal) {
              showAlertModal(
                '【デバッグ】防衛ポイントを100Pt獲得しました！',
                () => updateExchange()
              );
            } else {
              updateExchange();
            }
          }
        );
      }
    }
  };

  return (
    <div
      id="screen-exchange"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url('assets/backgrounds/background_defense.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        overflowY: 'auto',
      }}
    >
      <h2
        id="exchange-title"
        style={{
          color: '#10b981',
          marginBottom: '5px',
          cursor: 'pointer',
          textShadow: '0 0 15px rgba(16, 185, 129, 0.6)',
        }}
        onClick={handleTitleClick}
      >
        交換所
      </h2>
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {points.current} / 総ポイント: {points.total}
      </div>

      <div className="card-list-container">
        <div id="exchange-item-grid" className="card-list-grid-3col">
          {exchangeItems.map((itemInfo, index) => {
            const cardMaster = CARD_MASTER || [];
            const itemObj =
              cardMaster.find((c) => c.id === itemInfo.id) ||
              cardMaster[0] ||
              {};

            let canExchange = true;
            let isMaxed = false;
            let ownedCount = 0;

            if (itemInfo.type === 'premium') {
              if (unlockedPremium.includes(itemInfo.id)) {
                canExchange = false;
                isMaxed = true;
              }
            } else if (itemInfo.type === 'card') {
              ownedCount = inventory[itemInfo.id] || 0;
              if (ownedCount >= 4) {
                canExchange = false;
                isMaxed = true;
              }
            }

            if (points.current < itemInfo.cost) {
              canExchange = false;
            }

            const opacity = canExchange ? '1.0' : isMaxed ? '0.3' : '0.6';
            const rarityClass = itemObj.rarity
              ? ` rarity-${itemObj.rarity}`
              : '';

            let imgUrl = getCardImgUrl
              ? getCardImgUrl(
                  itemInfo.type === 'premium'
                    ? { ...itemObj, isPremium: true }
                    : itemObj
                )
              : '';

            return (
              <div
                key={index}
                className="deck-card-item"
                style={{
                  opacity,
                  cursor: canExchange ? 'pointer' : 'not-allowed',
                }}
                onClick={() => {
                  if (!isTransitioning && showExchangeDetail) {
                    showExchangeDetail(
                      itemInfo.id,
                      itemInfo.type,
                      itemInfo.cost,
                      itemObj,
                      canExchange,
                      isMaxed
                    );
                  }
                }}
              >
                <div
                  className={`card blue${rarityClass}`}
                  style={{
                    width: '80px',
                    height: '120px',
                    position: 'relative',
                    display: 'block',
                  }}
                >
                  <div
                    className="card-bg"
                    style={{ backgroundImage: `url('${imgUrl}')` }}
                  ></div>

                  {itemInfo.type === 'card' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.85)',
                        color: '#facc15',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        fontSize: '0.75rem',
                        zIndex: 6,
                        border: '1px solid #facc15',
                      }}
                    >
                      {ownedCount}/4
                    </div>
                  )}

                  <div
                    className="card-power"
                    style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}
                  >
                    {itemObj.power}
                  </div>

                  {window.renderSkillTag && (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: window.renderSkillTag(itemObj),
                      }}
                    ></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className="btn"
        style={{ marginTop: '15px', background: '#475569' }}
        onClick={() => {
          if (typeof playSound === 'function' && SOUNDS)
            playSound(SOUNDS.seClick);
          switchScreen?.('screen-defense-menu');
        }}
      >
        戻る
      </button>
    </div>
  );
}
