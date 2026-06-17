import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadDungeonProgress,
  retireDungeon,
  saveDungeonProgress,
  selectRentalDeck,
  selectRewardCard,
  startDungeonBattle,
} from '../game/battleDungeon.js';
import { setupLongPress } from '../services/uiGallery.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { getRentalDeckOptions } from '../utils/constants/battleDungeon.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { getCardImgUrl, playSound, switchScreen } from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';

const getRarityColor = (rarity) => {
  switch (rarity) {
    case 1:
      return '#b45309'; // Bronze
    case 2:
      return '#94a3b8'; // Silver
    case 3:
      return '#facc15'; // Gold
    case 4:
      return '#c084fc'; // Legend (Purple)
    default:
      return '#475569';
  }
};

export default function BattleDungeonScreen() {
  const [dungeonState, setDungeonState] = useState(GameState.dungeonState);
  const [_renderTick, setRenderTick] = useState(0);

  useEffect(() => {
    window.renderBattleDungeonReact = () => {
      setDungeonState(GameState.dungeonState);
      setRenderTick((prev) => prev + 1);
    };
    return () => {
      window.renderBattleDungeonReact = null;
    };
  }, []);

  const handleBack = () => {
    if (
      dungeonState === 'resume_select' ||
      dungeonState === 'select_rental_deck'
    ) {
      // 最初の画面ではセーブデータを消さずに戻る
      playSound(SOUNDS.seClick);
      GameState.gameMode = null;
      if (window.showDungeonMenu) {
        window.showDungeonMenu();
      } else {
        switchScreen('screen-dungeon-menu');
      }
    } else {
      // 進行中はリタイア確認
      showConfirmModal(
        '試練の宮殿をリタイアしますか？\n（現在の進行状況は失われます）',
        () => {
          retireDungeon();
        }
      );
    }
  };

  const handleSuspendAction = () => {
    showConfirmModal(
      '一旦中断してメインメニューに戻りますか？\n（進捗は自動的に保存されています）',
      () => {
        playSound(SOUNDS.seClick);
        saveDungeonProgress();
        switchScreen('screen-mode-select');
        playSound(AUDIO_INSTANCES.bgmTitle);
      }
    );
  };

  const renderContent = () => {
    switch (dungeonState) {
      case 'resume_select':
        return <ResumeSelect />;
      case 'select_rental_deck':
        return <RentalDeckSelect />;
      case 'select_opponent':
        return <OpponentSelect />;
      case 'reward':
        return <RewardSelect />;
      case 'battle':
        return <div style={{ color: '#fff' }}>バトル中...</div>;
      default:
        return (
          <div style={{ color: '#fff' }}>
            読み込み中... (state: {dungeonState})
          </div>
        );
    }
  };

  const getTitle = () => {
    switch (dungeonState) {
      case 'resume_select':
        return '試練の宮殿 再開';
      case 'select_rental_deck':
        return 'リーダー選択';
      case 'select_opponent':
        return '対戦相手選択';
      case 'reward':
        return '報酬選択';
      default:
        return '試練の宮殿';
    }
  };

  // 画面下部のボタン表示を制御
  const renderBottomButton = () => {
    if (dungeonState === 'select_opponent') {
      return (
        <button
          className="btn"
          style={{ background: '#475569' }}
          onClick={handleSuspendAction}
        >
          一時中断して戻る
        </button>
      );
    }
    // 通常の戻るボタン
    return (
      <button
        className="btn"
        style={{ background: '#475569' }}
        onClick={handleBack}
      >
        戻る
      </button>
    );
  };

  return (
    <div
      id="screen-battle-dungeon"
      className="screen active"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0.9)), url('assets/backgrounds/background_challenge.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <h2
        style={{
          color: '#facc15',
          margin: '20px 0',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {getTitle()}
        {dungeonState !== 'resume_select' &&
          dungeonState !== 'select_rental_deck' &&
          ` (${GameState.dungeonWinStreak + 1} 階)`}
      </h2>

      {dungeonState === 'select_rental_deck' && (
        <div
          style={{ textAlign: 'center', flexShrink: 0, marginBottom: '10px' }}
        >
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              padding: '15px',
              borderRadius: '12px',
              border: '1px solid #334155',
              display: 'inline-block',
              minWidth: '200px',
            }}
          >
            <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
              最高到達階: {GameState.dungeonMaxWinStreak + 1} 階
            </div>
          </div>
        </div>
      )}

      <div
        className="dungeon-content"
        style={{
          flex: 1,
          width: '100%',
          overflowY: dungeonState === 'reward' ? 'hidden' : 'auto',
          boxSizing: 'border-box',
          padding: '10px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {renderContent()}
      </div>

      <div
        style={{
          padding: '15px 0 20px 0',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
        {renderBottomButton()}
      </div>
    </div>
  );
}

/**
 * 再開・やり直し選択画面
 */
function ResumeSelect() {
  const [saveData, setSaveData] = useState(null);

  useEffect(() => {
    const json = localStorage.getItem('mini_card_battle_dungeon_save');
    if (json) {
      try {
        setSaveData(JSON.parse(json));
      } catch (e) {
        console.error('ダンジョンセーブデータのパースに失敗しました:', e);
        // 【データ整合性担保】破損セーブデータをクリアし、自動的に最初から開始する導線へ強制リセットする
        localStorage.removeItem('mini_card_battle_dungeon_save');

        GameState.dungeonState = 'select_rental_deck';
        GameState.dungeonWinStreak = 0;
        GameState.dungeonCards = [];
        GameState.dungeonOpponents = [];
        GameState.playerDeckSelection = null;
        delete GameState.dungeonPlayerHP;

        if (window.renderBattleDungeonReact) {
          window.renderBattleDungeonReact();
        }

        if (showAlertModal) {
          showAlertModal(
            '中断セーブデータが破損していたため、消去して最初から開始します。'
          );
        }
      }
    }
  }, []);
  const pConf = saveData?.playerConfig || {
    name: 'Player',
    rarity: 4,
    icon: '',
  };
  const pCurrentHp = saveData?.playerHP !== undefined ? saveData.playerHP : 20;

  const handleResume = () => {
    playSound(SOUNDS.seClick);
    loadDungeonProgress();
  };

  const handleRestart = () => {
    showConfirmModal(
      '中断データを消去して、最初からやり直します。よろしいですか？\n（到達階層に応じた試練ポイントは獲得できます）',
      () => {
        playSound(SOUNDS.seClick);
        if (saveData && typeof saveData.winStreak !== 'undefined') {
          GameState.dungeonWinStreak = saveData.winStreak;
        }
        retireDungeon();
      }
    );
  };

  const handleCheckPocket = () => {
    playSound(SOUNDS.seClick);
    if (saveData) {
      if (saveData.playerConfig) GameState.playerConfig = saveData.playerConfig;
      if (window.showEnemyDeckModal) {
        window.showEnemyDeckModal(saveData.cards || [], '所持カード確認');
      }
    }
  };

  const handleCheckDeck = () => {
    playSound(SOUNDS.seClick);
    if (saveData) {
      if (saveData.playerConfig) GameState.playerConfig = saveData.playerConfig;
      if (window.showEnemyDeckModal) {
        const deck = saveData.deck || saveData.cards?.slice(0, 20) || [];
        window.showEnemyDeckModal(deck, 'デッキ確認');
      }
    }
  };

  return (
    <div style={{ textAlign: 'center', color: '#fff', padding: '20px' }}>
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.8)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #334155',
          marginBottom: '30px',
        }}
      >
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
          到達階:{' '}
          <span style={{ color: '#facc15', fontWeight: 'bold' }}>
            {(saveData?.winStreak || 0) + 1} 階
          </span>
        </div>
        <div
          style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '15px' }}
        >
          最高到達階: {GameState.dungeonMaxWinStreak + 1} 階
        </div>

        {saveData && saveData.playerConfig && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                fontSize: '0.9rem',
                color: '#cbd5e1',
                marginBottom: '8px',
                fontWeight: 'bold',
              }}
            >
              現在のリーダー
            </div>
            <div
              className={pConf.rarity === 4 ? 'rarity-4-border' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                background: 'rgba(15, 23, 42, 0.8)',
                padding: '10px 20px',
                borderRadius: '12px',
                border: `2px solid ${getRarityColor(pConf.rarity)}`,
                minWidth: '250px',
              }}
            >
              <div
                className={pConf.rarity === 4 ? 'rarity-4-border' : ''}
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: `2px solid ${getRarityColor(pConf.rarity)}`,
                }}
              >
                <img
                  src={pConf.icon || pConf.image}
                  alt={pConf.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '50%',
                  }}
                />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div
                  className={pConf.rarity === 4 ? 'rarity-4-text' : ''}
                  style={{
                    fontWeight: 'bold',
                    color: getRarityColor(pConf.rarity),
                    fontSize: '1.1rem',
                  }}
                >
                  {pConf.name}
                </div>
                <div
                  style={{
                    fontSize: '1.1rem',
                    color: pCurrentHp <= 5 ? '#ef4444' : '#f8fafc',
                    fontWeight: 'bold',
                    marginTop: '2px',
                  }}
                >
                  HP: {pCurrentHp} / 20
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            className="btn"
            style={{
              fontSize: '0.8rem',
              padding: '10px 12px',
              width: 'auto',
              margin: 0,
              background: '#475569',
            }}
            onClick={handleCheckPocket}
          >
            所持カード確認
          </button>
          <button
            className="btn"
            style={{
              fontSize: '0.8rem',
              padding: '10px 12px',
              width: 'auto',
              margin: 0,
              background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
            }}
            onClick={handleCheckDeck}
          >
            デッキ確認
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          alignItems: 'center',
        }}
      >
        <button
          className="btn"
          style={{
            width: '220px',
            background: 'linear-gradient(45deg, #10b981, #059669)',
            padding: '12px',
          }}
          onClick={handleResume}
        >
          再開する
        </button>
        <button
          className="btn"
          style={{ width: '220px', background: '#334155', color: '#fff' }}
          onClick={handleRestart}
        >
          リタイア
        </button>
      </div>
    </div>
  );
}

/**
 * カードプレビュー対応のミニカードコンポーネント
 */
function DungeonMiniCard({
  id,
  onClick,
  isSelected,
  count,
  showCount = true,
  scale = 1,
}) {
  const card = CARD_MASTER.find((c) => c.id === id);
  const cardRef = useRef(null);

  useEffect(() => {
    if (cardRef.current && card) {
      const cleanup = setupLongPress(cardRef.current, card);
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }
  }, [card]);

  if (!card) return null;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className="dungeon-mini-card-wrapper"
      style={{
        position: 'relative',
        width: `${60 * scale}px`,
        height: `${84 * scale}px`,
        cursor: 'pointer',
        border: isSelected
          ? `${3 * scale}px solid #facc15`
          : `${1 * scale}px solid #475569`,
        boxSizing: 'border-box',
        borderRadius: `${4 * scale}px`,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <img
        src={getCardImgUrl(card)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        alt={card.name}
      />
      {showCount && count > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            background: 'rgba(0,0,0,0.8)',
            padding: '1px 3px',
            fontSize: '9px',
            color: '#fff',
            borderTopLeftRadius: '4px',
          }}
        >
          x{count}
        </div>
      )}
      {isSelected && (
        <div
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            background: '#facc15',
            color: '#000',
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '12px',
            borderBottomLeftRadius: '6px',
          }}
        >
          ✓
        </div>
      )}
    </div>
  );
}

function RentalDeckSelect() {
  // 候補は初回描画時にランダムで3体生成される
  const options = useMemo(() => getRentalDeckOptions(), []);
  const [previewOpt, setPreviewOpt] = useState(null);

  const handleSelectPreview = (opt) => {
    playSound(SOUNDS.seClick);
    setPreviewOpt(opt);
  };

  const handleConfirm = () => {
    playSound(SOUNDS.seClick);
    selectRentalDeck(previewOpt);
  };

  const handleCancel = () => {
    playSound(SOUNDS.seClick);
    setPreviewOpt(null);
  };

  return (
    <div style={{ textAlign: 'center', color: '#fff' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          alignItems: 'center',
        }}
      >
        {options.map((opt, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: '10px',
              width: '100%',
              maxWidth: '400px',
            }}
          >
            <button
              className={`btn-banner ${opt.rarity === 4 && !opt.isCharacterLeader ? 'rarity-4-border' : ''}`}
              style={{
                flex: 1,
                margin: 0,
                borderColor: opt.isCharacterLeader
                  ? 'var(--border-color, #334155)'
                  : getRarityColor(opt.rarity),
                borderWidth: '2px',
              }}
              onClick={() => handleSelectPreview(opt)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  height: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {opt.isCharacterLeader ? (
                    /* プレイヤーキャラのリーダー：共通CSSクラスを適用してアセットの物理サイズ差によるはみ出しを解消 */
                    <div className="banner-icon-wrapper">
                      <img
                        src={opt.icon}
                        className="banner-icon"
                        alt={opt.name}
                      />
                      <img
                        src={`assets/icons/iconframe_${['satan', 'void', 'succubus'].includes(opt.leaderId) ? 'red' : 'gold'}.png`}
                        className="banner-icon-frame"
                        alt="frame"
                      />
                    </div>
                  ) : (
                    /* カードのリーダー：元の美しいレアリティカラーボーダーおよびレインボーボーダーを完璧に維持する */
                    <div
                      className={opt.rarity === 4 ? 'rarity-4-border' : ''}
                      style={{
                        width: '60px',
                        height: '60px',
                        aspectRatio:
                          '1 / 1' /* 絶対に1:1を死守してサブピクセル歪みを防止 */,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: `2px solid ${getRarityColor(opt.rarity)}`,
                        marginRight: '15px',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={opt.icon}
                        alt={opt.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '50%',
                        }}
                      />
                    </div>
                  )}
                  <span
                    className={`banner-text ${opt.rarity === 4 && !opt.isCharacterLeader ? 'rarity-4-text' : ''}`}
                    style={{
                      color: opt.isCharacterLeader
                        ? opt.color || '#fff'
                        : getRarityColor(opt.rarity),
                      textShadow:
                        opt.rarity === 4 && !opt.isCharacterLeader
                          ? 'none'
                          : '0px 0px 4px rgba(0,0,0,0.8)',
                    }}
                  >
                    {opt.name}
                  </span>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* プレビューモーダル */}
      {previewOpt && (
        <div
          className="modal-overlay"
          style={{ zIndex: 2000, display: 'flex' }}
          onClick={handleCancel}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{ width: '95%', maxWidth: '440px', padding: '20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              className={
                previewOpt.rarity === 4 && !previewOpt.isCharacterLeader
                  ? 'rarity-4-text'
                  : ''
              }
              style={{
                color: previewOpt.isCharacterLeader
                  ? previewOpt.color || '#fff'
                  : getRarityColor(previewOpt.rarity),
                marginBottom: '15px',
                textShadow:
                  previewOpt.rarity === 4 && !previewOpt.isCharacterLeader
                    ? 'none'
                    : 'auto',
              }}
            >
              {previewOpt.name}
            </h2>
            <div
              className="card-list-container"
              style={{ maxHeight: '50vh', overflowY: 'auto' }}
            >
              <div className="card-list-grid-3col" style={{ padding: '10px' }}>
                {(() => {
                  const grouped = {};
                  previewOpt.deck.forEach((cardId) => {
                    if (!grouped[cardId]) grouped[cardId] = 0;
                    grouped[cardId]++;
                  });

                  return Object.keys(grouped).map((cardId) => {
                    const count = grouped[cardId];
                    const template = CARD_MASTER?.find((m) => m.id === cardId);
                    if (!template) return null;

                    const displayCard = { ...template, owner: 'red' };
                    const imgUrl = getCardImgUrl
                      ? getCardImgUrl(displayCard)
                      : '';
                    const rarityClass = displayCard.rarity
                      ? ` rarity-${displayCard.rarity}`
                      : '';
                    return (
                      <div
                        key={cardId}
                        className="deck-card-item gallery-card-wrapper"
                        onClick={() =>
                          window.openCardPreview &&
                          window.openCardPreview(displayCard)
                        }
                      >
                        <div className={`card red${rarityClass}`}>
                          <div
                            className="card-bg"
                            style={{ backgroundImage: `url('${imgUrl}')` }}
                          ></div>
                          <div
                            className="card-power"
                            style={{
                              fontSize: '1.4rem',
                              bottom: 0,
                              right: '4px',
                            }}
                          >
                            {displayCard.power}
                          </div>
                          {window.renderSkillTag && (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: window.renderSkillTag(
                                  displayCard,
                                  false
                                ),
                              }}
                            ></div>
                          )}
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
                            x{count}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '100%',
                marginTop: '20px',
              }}
            >
              <button
                className="btn"
                style={{
                  background: '#475569',
                  margin: 0,
                  padding: '8px',
                  fontSize: '1rem',
                }}
                onClick={() => {
                  playSound(SOUNDS.seClick);
                  if (
                    window.showSkillConfirmModalReact &&
                    previewOpt.originalData &&
                    previewOpt.originalData.leaderSkill
                  ) {
                    window.showSkillConfirmModalReact({
                      skill: previewOpt.originalData.leaderSkill,
                      statusText: '',
                      color: '#94a3b8',
                      canExecute: false,
                    });
                  }
                }}
              >
                リーダースキル
              </button>
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <button
                  className="btn"
                  style={{ flex: 1, background: '#475569', margin: 0 }}
                  onClick={(e) => {
                    playSound(SOUNDS.seClick);
                    handleCancel(e);
                  }}
                >
                  戻る
                </button>
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
                    margin: 0,
                  }}
                  onClick={handleConfirm}
                >
                  決定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OpponentSelect() {
  const opps = GameState.dungeonOpponents || [];

  const handleSelect = (idx) => {
    showConfirmModal(`${opps[idx].name} に挑みますか？`, () => {
      startDungeonBattle(idx);
    });
  };

  const handleCheckPocket = () => {
    if (window.showEnemyDeckModal) {
      window.showEnemyDeckModal(GameState.dungeonCards, '所持カード確認');
    }
  };

  const handleCheckDeck = () => {
    if (window.showEnemyDeckModal) {
      const currentDeck = GameState.playerDeckSelection
        ? GameState.playerDeckSelection.filter(Boolean)
        : GameState.dungeonCards.slice(0, 20);
      window.showEnemyDeckModal(currentDeck, 'デッキ確認');
    }
  };

  const pConf = GameState.playerConfig || {
    name: 'Player',
    rarity: 4,
    icon: '',
  };
  const pCurrentHp =
    GameState.dungeonPlayerHP !== undefined ? GameState.dungeonPlayerHP : 20;
  const pMaxHp = 20;

  const getEnemyHp = (r) => {
    const rarity = r || 4;
    return rarity === 1 ? 10 : rarity === 2 ? 15 : 20;
  };

  return (
    <div style={{ color: '#fff', textAlign: 'center' }}>
      <div
        style={{
          background: 'rgba(234, 179, 8, 0.15)',
          padding: '12px',
          borderRadius: '12px',
          marginBottom: '20px',
          border: '1px solid rgba(250, 204, 21, 0.3)',
        }}
      >
        <div
          style={{ color: '#facc15', fontWeight: 'bold', marginBottom: '5px' }}
        >
          現在 {GameState.dungeonWinStreak + 1} 階
        </div>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
          最高到達階: {GameState.dungeonMaxWinStreak + 1} 階
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            fontSize: '0.9rem',
            color: '#cbd5e1',
            marginBottom: '8px',
            fontWeight: 'bold',
          }}
        >
          現在のリーダー
        </div>
        <div
          className={pConf.rarity === 4 ? 'rarity-4-border' : ''}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '10px 20px',
            borderRadius: '12px',
            border: `2px solid ${getRarityColor(pConf.rarity)}`,
            minWidth: '250px',
          }}
        >
          <div
            className={pConf.rarity === 4 ? 'rarity-4-border' : ''}
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: `2px solid ${getRarityColor(pConf.rarity)}`,
            }}
          >
            <img
              src={pConf.icon || pConf.image}
              alt={pConf.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '50%',
              }}
            />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div
              className={pConf.rarity === 4 ? 'rarity-4-text' : ''}
              style={{
                fontWeight: 'bold',
                color: getRarityColor(pConf.rarity),
                fontSize: '1.1rem',
              }}
            >
              {pConf.name}
            </div>
            <div
              style={{
                fontSize: '1.1rem',
                color: pCurrentHp <= 5 ? '#ef4444' : '#f8fafc',
                fontWeight: 'bold',
                marginTop: '2px',
              }}
            >
              HP: {pCurrentHp} / {pMaxHp}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'center',
          marginBottom: '20px',
        }}
      >
        <button
          className="btn"
          style={{
            padding: '8px 12px',
            fontSize: '0.8rem',
            width: 'auto',
            background: '#475569',
          }}
          onClick={handleCheckPocket}
        >
          所持カード確認
        </button>
        <button
          className="btn"
          style={{
            padding: '8px 12px',
            fontSize: '0.8rem',
            width: 'auto',
            background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
          }}
          onClick={handleCheckDeck}
        >
          デッキ確認
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          alignItems: 'center',
        }}
      >
        {opps.map((e, i) => (
          <div
            key={i}
            className={`dungeon-opponent-card ${e.rarity === 4 ? 'rarity-4-border' : ''}`}
            onClick={() => handleSelect(i)}
            style={{
              background: '#1e293b',
              border: `2px solid ${getRarityColor(e.rarity)}`,
              borderRadius: '12px',
              padding: '15px',
              width: '100%',
              maxWidth: '400px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
            }}
          >
            <div
              className={e.rarity === 4 ? 'rarity-4-border' : ''}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: `3px solid ${getRarityColor(e.rarity)}`,
                boxShadow: `0 0 10px ${getRarityColor(e.rarity)}`,
              }}
            >
              <img
                src={e.image}
                alt={e.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%',
                }}
              />
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div
                className={e.rarity === 4 ? 'rarity-4-text' : ''}
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  color: getRarityColor(e.rarity),
                }}
              >
                {e.name}
              </div>
              <div
                style={{
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  marginTop: '4px',
                  fontWeight: 'bold',
                }}
              >
                HP: {getEnemyHp(e.rarity)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardSelect() {
  const uniqueCards = useMemo(
    () => [...new Set(GameState.enemyConfig?.dungeonDeck || [])],
    []
  );

  const handleSelect = (id) => {
    const c = CARD_MASTER.find((m) => m.id === id);
    if (!c) {
      console.error(`カードが見つかりません: ${id}`);
      return;
    }
    showConfirmModal(`${c.name} を獲得しますか？`, () => {
      selectRewardCard(id);
    });
  };

  const handleCheckPocket = () => {
    playSound(SOUNDS.seClick);
    if (window.showEnemyDeckModal) {
      window.showEnemyDeckModal(GameState.dungeonCards, '所持カード確認');
    }
  };

  const handleCheckDeck = () => {
    playSound(SOUNDS.seClick);
    if (window.showEnemyDeckModal) {
      const currentDeck = GameState.playerDeckSelection
        ? GameState.playerDeckSelection.filter(Boolean)
        : GameState.dungeonCards.slice(0, 20);
      window.showEnemyDeckModal(currentDeck, 'デッキ確認');
    }
  };

  const enemy = GameState.enemyConfig;

  return (
    <div
      id="screen-reward"
      style={{
        color: '#fff',
        textAlign: 'center',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {enemy && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '5px',
            marginTop: '10px',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #64748b',
              marginBottom: '5px',
            }}
          >
            <img
              src={enemy.image}
              alt={enemy.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
            {enemy.name} のデッキ
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '10px',
          justifyContent: 'center',
          marginBottom: '10px',
          flexShrink: 0,
        }}
      >
        <button
          className="btn"
          style={{
            padding: '8px 12px',
            fontSize: '0.8rem',
            width: 'auto',
            background: '#475569',
            margin: 0,
          }}
          onClick={handleCheckPocket}
        >
          所持カード確認
        </button>
        <button
          className="btn"
          style={{
            padding: '8px 12px',
            fontSize: '0.8rem',
            width: 'auto',
            background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
            margin: 0,
          }}
          onClick={handleCheckDeck}
        >
          デッキ確認
        </button>
      </div>

      <p
        style={{
          marginBottom: '10px',
          fontSize: '0.85rem',
          color: '#cbd5e1',
          flexShrink: 0,
        }}
      >
        倒した相手のデッキから1枚選んで獲得できます。
      </p>

      <div
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid #475569',
          borderRadius: '8px',
          padding: '15px 5px',
          margin: '0 auto',
          maxWidth: '380px',
          width: '100%',
          boxSizing: 'border-box',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '15px 5px',
            justifyItems: 'center',
            width: '100%',
          }}
        >
          {uniqueCards.map((id) => {
            const ownedCount = GameState.dungeonCards
              ? GameState.dungeonCards.filter((c) => c === id).length
              : 0;
            const isMaxLimit = ownedCount >= 4;
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '5px',
                  filter: isMaxLimit ? 'brightness(0.5)' : 'none',
                  opacity: isMaxLimit ? 0.7 : 1,
                }}
              >
                <DungeonMiniCard
                  id={id}
                  onClick={() => handleSelect(id)}
                  showCount={false}
                  scale={1.2}
                />
                <div
                  style={{
                    fontSize: '11px',
                    color: '#cbd5e1',
                    width: '70px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {CARD_MASTER.find((c) => c.id === id)?.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
