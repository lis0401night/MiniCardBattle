import { useEffect, useState } from 'react';
import BackButton from '../components/BackButton.jsx';
import { getEventEnemyCharId, safeParseArray } from '../utils/gameUtils.js';
import { GameState } from '../state/gameState.js';
import { CHAR_FORTUNE_HANDICAPS } from '../utils/constants/fortuneHandicaps.js';
import {
  loadFortuneClearedData,
  FORTUNE_GRADE_THRESHOLDS,
} from '../utils/constants/fortuneRewards.js';
import {
  getScreenBackgroundStyle,
  OWNED_PLAYMATS_KEY,
} from '../utils/constants/config.js';
import { setOwnedPlaymats } from '../utils/constants/playmats.js';
import {
  showCharacterAcquisitionModal,
  showStageAcquisitionModal,
  showIconAcquisitionModal,
  showPlaymatAcquisitionModal,
  showPremiumAcquisitionModal,
} from '../services/uiGallery.js';

const unlockAndShowAcquisition = (
  storageKey,
  targetId,
  modalFn,
  displayName
) => {
  try {
    const current = safeParseArray(storageKey);
    if (!current.includes(targetId)) {
      current.push(targetId);
      localStorage.setItem(storageKey, JSON.stringify(current));

      // ゲーム再起動なしで直ちに反映させるため、GameStateの該当配列も更新する
      if (storageKey === 'mini_card_battle_unlocked_icons') {
        if (!GameState.unlockedIcons) GameState.unlockedIcons = [];
        if (!GameState.unlockedIcons.includes(targetId))
          GameState.unlockedIcons.push(targetId);
      } else if (storageKey === 'mini_card_battle_unlocked_characters') {
        if (!GameState.unlockedCharacters) GameState.unlockedCharacters = [];
        if (!GameState.unlockedCharacters.includes(targetId))
          GameState.unlockedCharacters.push(targetId);
      } else if (storageKey === 'mini_card_battle_unlocked_stages') {
        if (!GameState.unlockedStages) GameState.unlockedStages = [];
        if (!GameState.unlockedStages.includes(targetId))
          GameState.unlockedStages.push(targetId);
      } else if (storageKey === OWNED_PLAYMATS_KEY) {
        if (!GameState.ownedPlaymats) GameState.ownedPlaymats = [];
        if (!GameState.ownedPlaymats.includes(targetId))
          GameState.ownedPlaymats.push(targetId);
        setOwnedPlaymats(current);
      }
    } else if (storageKey === OWNED_PLAYMATS_KEY) {
      // 既にLocalStorageに入っている場合でもsetOwnedPlaymatsとGameStateに確実に反映
      if (!GameState.ownedPlaymats) GameState.ownedPlaymats = [];
      if (!GameState.ownedPlaymats.includes(targetId))
        GameState.ownedPlaymats.push(targetId);
      setOwnedPlaymats(current);
    }
  } catch (e) {
    console.error(`Failed to unlock ${targetId} in ${storageKey}:`, e);
  }
  modalFn(displayName, targetId);
};

/**
 * 運命の邂逅：特級目標の達成状況画面
 * 各特級目標の達成済み/未達成と、達成レベルの一覧を表示する
 */
/**
 * キャラクターごとの運命の邂逅レベル報酬定義
 * @type {Object<string, Object>}
 */
const FORTUNE_REWARDS = {
  automata: {
    charName: '廃鉄の声 マキナ',
    shortName: 'マキナ',
    stageName: '鋼の墓標',
    premiumCardId: 'liberator',
  },
  valkyria: {
    charName: '紅蓮の翼 アンジェ',
    shortName: 'アンジェ',
    stageName: '約束の丘',
    premiumCardId: 'dwarf',
  },
};

export default function FortuneAchievementScreen() {
  const enemyCharId =
    typeof GameState !== 'undefined' && GameState.gameMode
      ? getEventEnemyCharId(GameState.gameMode) || 'automata'
      : 'automata';

  const fortuneHandicapsList = CHAR_FORTUNE_HANDICAPS[enemyCharId] || [];
  const clearedData = loadFortuneClearedData(enemyCharId);

  /** キャラクターごとに報酬受取状況を分離するストレージキー */
  const claimedLevelsKey = `mini_card_battle_fortune_claimed_levels_${enemyCharId}`;

  const [claimedLevels, setClaimedLevels] = useState(() => {
    try {
      const saved = safeParseArray(claimedLevelsKey);
      if (saved.length > 0) return saved;
      // 旧共通キーからのマイグレーション（automataの場合のみ）
      if (enemyCharId === 'automata') {
        const legacy = safeParseArray(
          'mini_card_battle_fortune_claimed_levels'
        );
        if (legacy.length > 0) {
          // 新キーに保存して旧キーは残しておく（他の箇所で参照されている可能性があるため）
          localStorage.setItem(claimedLevelsKey, JSON.stringify(legacy));
          return legacy;
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  /** 現在のキャラクターに対応する報酬定義を取得する */
  const rewards = FORTUNE_REWARDS[enemyCharId] || FORTUNE_REWARDS.automata;

  // 既にLv4報酬受取済みの場合は所持プレイマットの整合性を修復・補填
  useEffect(() => {
    if (claimedLevels.includes(4)) {
      try {
        const key = OWNED_PLAYMATS_KEY;
        const current = safeParseArray(key);
        if (!current.includes(enemyCharId)) {
          current.push(enemyCharId);
          localStorage.setItem(key, JSON.stringify(current));
        }
        if (!GameState.ownedPlaymats) GameState.ownedPlaymats = [];
        if (!GameState.ownedPlaymats.includes(enemyCharId)) {
          GameState.ownedPlaymats.push(enemyCharId);
        }
        setOwnedPlaymats(current);
      } catch (e) {
        console.error('プレイマット自己修復エラー:', e);
      }
    }
  }, [claimedLevels, enemyCharId]);

  /**
   * 達成レベルに応じた報酬を付与する
   * @param {number} level - 達成レベル（1～5）
   */
  const handleClaimReward = (level) => {
    if (claimedLevels.includes(level)) return;

    if (level === 1) {
      unlockAndShowAcquisition(
        'mini_card_battle_unlocked_characters',
        enemyCharId,
        showCharacterAcquisitionModal,
        rewards.charName
      );
    } else if (level === 2) {
      unlockAndShowAcquisition(
        'mini_card_battle_unlocked_stages',
        enemyCharId,
        showStageAcquisitionModal,
        rewards.stageName
      );
    } else if (level === 3) {
      unlockAndShowAcquisition(
        'mini_card_battle_unlocked_icons',
        enemyCharId,
        showIconAcquisitionModal,
        rewards.shortName
      );
    } else if (level === 4) {
      unlockAndShowAcquisition(
        OWNED_PLAYMATS_KEY,
        enemyCharId,
        showPlaymatAcquisitionModal,
        rewards.shortName
      );
    } else if (level === 5) {
      // プレミアムカードのアンロック処理
      const premiumId = rewards.premiumCardId;
      if (!GameState.unlockedPremiumCards) {
        GameState.unlockedPremiumCards = [];
      }
      if (!GameState.premiumCards) {
        GameState.premiumCards = [];
      }
      if (!GameState.unlockedPremiumCards.includes(premiumId)) {
        GameState.unlockedPremiumCards.push(premiumId);
      }
      if (!GameState.premiumCards.includes(premiumId)) {
        GameState.premiumCards.push(premiumId);
      }
      localStorage.setItem(
        'mini_card_battle_unlocked_premium',
        JSON.stringify(GameState.unlockedPremiumCards)
      );
      localStorage.setItem(
        'mini_card_battle_premium_cards',
        JSON.stringify(GameState.premiumCards)
      );
      showPremiumAcquisitionModal(premiumId);
    }

    const nextClaimed = [...claimedLevels, level];
    setClaimedLevels(nextClaimed);
    localStorage.setItem(claimedLevelsKey, JSON.stringify(nextClaimed));
  };

  const getRewardName = (lv) => {
    if (lv === 1) return 'キャラクター';
    if (lv === 2) return 'ステージ';
    if (lv === 3) return 'アイコン';
    if (lv === 4) return 'プレイマット';
    if (lv === 5) return 'プレミアム';
    return '';
  };

  let maxEarnedPoints = clearedData.maxTotalCost || 0;
  let totalPossiblePoints = 0;
  fortuneHandicapsList.forEach((h) => {
    totalPossiblePoints += h.cost || 0;
  });

  const bgStyle = getScreenBackgroundStyle(
    'assets/backgrounds/background_fortune01.webp'
  );

  return (
    <div
      id="screen-fortune-achievement"
      className="screen active"
      style={{
        ...bgStyle,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* 固定タイトル */}
      <h2
        style={{
          color: '#f97316',
          marginBottom: '5px',
          marginTop: '20px',
          textShadow: '0 0 15px rgba(249, 115, 22, 0.6)',
          flexShrink: 0,
        }}
      >
        達成状況
      </h2>

      {/* 2つの独立したスクロール領域（高さを等分し、それぞれでスクロール可能） */}
      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '15px',
          padding: '10px 0',
          boxSizing: 'border-box',
          minHeight: 0,
        }}
      >
        {/* 特級目標の枠 */}
        <div
          style={{
            flex: 1,
            width: 'calc(90% + 30px)',
            maxWidth: '530px',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '12px 15px',
            boxSizing: 'border-box',
            minHeight: 0,
          }}
        >
          <div
            style={{
              color: '#cbd5e1',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              marginBottom: '8px',
              flexShrink: 0,
            }}
          >
            特級目標
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px',
            }}
          >
            {fortuneHandicapsList.map((item) => {
              const isCleared = !!clearedData.clearedHandicaps?.[item.id];
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    border: `1px solid ${isCleared ? '#f97316' : '#334155'}`,
                    boxShadow: isCleared
                      ? '0 0 10px rgba(249, 115, 22, 0.2)'
                      : 'none',
                    borderRadius: '8px',
                    padding: '12px 15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        color: '#f8fafc',
                        fontWeight: 'bold',
                        fontSize: '0.95rem',
                      }}
                    >
                      {item.name}
                    </span>
                  </div>
                  <div
                    style={{
                      color: '#10b981',
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      marginRight: '12px',
                    }}
                  >
                    +{item.cost * 3}pt
                  </div>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: isCleared ? '#10b981' : '#64748b',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isCleared ? '達成済み' : '未達成'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 達成レベルの枠 */}
        <div
          style={{
            flex: 'none',
            height: '310px',
            width: 'calc(90% + 30px)',
            maxWidth: '530px',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '12px 15px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#cbd5e1',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              marginBottom: '10px',
              flexShrink: 0,
            }}
          >
            <span>達成レベル</span>
            <span
              style={{
                fontSize: '1.2rem',
                color: '#facc15',
                textShadow: '0 0 10px rgba(250, 204, 21, 0.4)',
              }}
            >
              {maxEarnedPoints} / {totalPossiblePoints}
            </span>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px',
            }}
          >
            {FORTUNE_GRADE_THRESHOLDS.filter((t) => t.level !== 0).map(
              (threshold) => {
                const isCleared = clearedData.maxGradeLevel >= threshold.level;
                const percentage = isCleared ? 100 : 0;

                const bgColor = isCleared
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(0, 0, 0, 0.5)';
                const borderColor = isCleared ? '#10b981' : '#475569';
                const titleColor = isCleared ? '#34d399' : '#f8fafc';

                return (
                  <div
                    key={threshold.level}
                    style={{
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                      borderRadius: '8px',
                      padding: '10px 15px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          color: titleColor,
                          fontWeight: 'bold',
                          fontSize: '0.95rem',
                        }}
                      >
                        Lv.{threshold.level} ({threshold.min}～{threshold.max})
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#facc15' }}>
                        報酬: {getRewardName(threshold.level)}
                      </span>
                    </div>

                    {/* 実績画面と統一したプログレスバー */}
                    <div
                      style={{
                        width: '100%',
                        background: '#0f172a',
                        borderRadius: '4px',
                        height: '12px',
                        marginBottom: '4px',
                        overflow: 'hidden',
                        border: '1px solid #334155',
                      }}
                    >
                      <div
                        style={{
                          width: `${percentage}%`,
                          height: '100%',
                          background: isCleared ? '#10b981' : '#3b82f6',
                          transition: 'width 0.3s ease',
                        }}
                      ></div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '2px',
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        {isCleared ? '1 / 1' : '0 / 1'}
                      </span>

                      {claimedLevels.includes(threshold.level) ? (
                        <span
                          style={{
                            color: '#94a3b8',
                            fontSize: '0.8rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          (取得済)
                        </span>
                      ) : (
                        <button
                          className="btn"
                          disabled={!isCleared}
                          style={{
                            padding: '2px 8px',
                            fontSize: '0.7rem',
                            minHeight: '20px',
                            margin: 0,
                            background: isCleared ? '' : '#475569',
                            opacity: isCleared ? '1' : '0.6',
                            cursor: isCleared ? 'pointer' : 'not-allowed',
                            whiteSpace: 'nowrap',
                          }}
                          onClick={() =>
                            isCleared && handleClaimReward(threshold.level)
                          }
                        >
                          受け取る
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </div>

      {/* 固定の戻るボタン */}
      <div
        style={{
          flexShrink: 0,
          marginTop: '15px',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '0 0 20px 0',
        }}
      >
        <BackButton
          to="screen-difficulty"
          style={{ padding: '10px 40px', margin: 0 }}
        />
      </div>
    </div>
  );
}
