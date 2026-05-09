import { useState, useEffect } from 'react';
import { CHARACTERS } from '../utils/constants/characters.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { GameState } from '../hooks/gameState.js';
import { saveDeck } from '../hooks/deck.js';
import { playSound, getOrCreateUUID } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { showConfirmModal, showAlertModal } from '../hooks/uiModals.js';
import { TOURNAMENT_EXCHANGE_LINEUP } from '../utils/constants/config.js';
import { PLAYMAT_MASTER } from '../utils/constants/playmats.js';

export default function TournamentExchangeScreen() {
  const [tournamentPoints, setTournamentPoints] = useState({
    current: 0,
    total: 0,
  });
  const [unlockedSkins, setUnlockedSkins] = useState([]);
  const [unlockedPlaymats, setUnlockedPlaymats] = useState([]);
  const [inventory, setInventory] = useState({});
  const [pointsUpdated, setPointsUpdated] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  let debugClickCount = 0;

  useEffect(() => {
    // Init Points
    const currentPts =
      parseInt(localStorage.getItem('mini_card_battle_tournament_points')) || 0;
    const totalPts =
      parseInt(
        localStorage.getItem('mini_card_battle_tournament_total_points')
      ) || 0;
    setTournamentPoints({ current: currentPts, total: totalPts });

    // Init Unlocked
    const userUnlocked =
      JSON.parse(localStorage.getItem('mini_card_battle_unlocked_skins')) || [];
    setUnlockedSkins(userUnlocked);
    const userPlaymats =
      JSON.parse(localStorage.getItem('mini_card_battle_owned_playmats')) || [];
    setUnlockedPlaymats(userPlaymats);

    // Init Inventory
    setInventory(GameState.playerInventory || {});

    // API Fetch to sync points
    const fetchPoints = async () => {
      try {
        const response = await fetch(
          `api/get_player_decks.php?t=${Date.now()}`
        );
        if (!response.ok) return;

        const text = await response.text();
        if (text.trim().startsWith('<')) return; // ignore HTML responses (e.g. 404/index fallback)

        const result = JSON.parse(text);
        if (result.success && getOrCreateUUID) {
          const myUuid = getOrCreateUUID();
          const myData = result.players.find((p) => p.uuid === myUuid);
          if (myData) {
            const pts = myData.challenge_points || 0;
            const tPts = myData.challenge_total_points || pts || 0;

            const finalPts = pts === 0 && currentPts > 0 ? currentPts : pts;
            const finalTotalPts = tPts === 0 && totalPts > 0 ? totalPts : tPts;

            if (finalPts > 0 || currentPts === 0) {
              setTournamentPoints({ current: finalPts, total: finalTotalPts });
              localStorage.setItem(
                'mini_card_battle_tournament_points',
                finalPts
              );
              localStorage.setItem(
                'mini_card_battle_tournament_total_points',
                finalTotalPts
              );

              // サーバーが未初期化(0)でローカルにデータがある場合は、サーバーにアップロードしてマスタを正す
              if (pts === 0 && currentPts > 0) {
                fetch('api/update_tournament_points.php', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    uuid: myUuid,
                    points: finalPts,
                    total_points: finalTotalPts,
                  }),
                }).catch(() => {});
              }
            }
          }
        }
      } catch (e) {
        // Ignore fetch errors in pure frontend modes
      }
    };
    fetchPoints();
  }, [pointsUpdated]);

  const savePointsToServer = (newPts, newTotal) => {
    const uuid = getOrCreateUUID();
    const playerName =
      localStorage.getItem('mini_card_battle_player_name') || 'Player';
    fetch('api/update_tournament_points.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uuid: uuid,
        name: playerName,
        points: newPts,
        total_points: newTotal,
      }),
    }).catch(() => {
      /* ignore */
    });
  };

  const handleExchange = (item) => {
    playSound(SOUNDS?.seCardPlace);

    const newPts = tournamentPoints.current - item.cost;
    localStorage.setItem('mini_card_battle_tournament_points', newPts);
    setTournamentPoints((prev) => ({ ...prev, current: newPts }));

    // サーバーと同期
    savePointsToServer(newPts, tournamentPoints.total);

    if (item.type === 'card') {
      const currentCount = inventory[item.id] || 0;
      const newInventory = { ...inventory, [item.id]: currentCount + 1 };
      setInventory(newInventory);
      GameState.playerInventory = newInventory;
      if (typeof saveDeck === 'function') saveDeck();
      showAlertModal(`「${item.displayName || item.id}」を1枚交換しました！`);
    } else if (item.type === 'playmat') {
      const newUnlocked = [...unlockedPlaymats, item.id];
      localStorage.setItem(
        'mini_card_battle_owned_playmats',
        JSON.stringify(newUnlocked)
      );
      setUnlockedPlaymats(newUnlocked);
      showAlertModal(
        `「${item.name}」を交換しました！\nデッキ編成画面等でプレイマットを変更できます。`
      );
    } else {
      const newUnlocked = [...unlockedSkins, item.id];
      localStorage.setItem(
        'mini_card_battle_unlocked_skins',
        JSON.stringify(newUnlocked)
      );
      GameState.unlockedSkins = newUnlocked;
      setUnlockedSkins(newUnlocked);
      showAlertModal(
        `「${item.name}」を交換しました！\nキャラクター選択画面でスキンを変更できます。`
      );
    }

    setPointsUpdated((prev) => !prev);
    setPreviewItem(null); // Close modal
  };

  const handleBack = () => {
    playSound(SOUNDS?.seClick);
    if (window.switchScreen) window.switchScreen('screen-tournament-menu');
  };

  const handleTitleClick = () => {
    debugClickCount++;
    if (debugClickCount >= 10) {
      debugClickCount = 0;
      if (showConfirmModal) {
        showConfirmModal(
          'デバッグモードを起動して大会ポイントを100Pt獲得しますか？',
          () => {
            playSound(SOUNDS?.seSkill);
            const currentPts =
              parseInt(
                localStorage.getItem('mini_card_battle_tournament_points')
              ) || 0;
            const totalPts =
              parseInt(
                localStorage.getItem('mini_card_battle_tournament_total_points')
              ) || 0;
            const newPts = currentPts + 100;
            const newTotalPts = totalPts + 100;

            localStorage.setItem('mini_card_battle_tournament_points', newPts);
            localStorage.setItem(
              'mini_card_battle_tournament_total_points',
              newTotalPts
            );
            setTournamentPoints({ current: newPts, total: newTotalPts });
            savePointsToServer(newPts, newTotalPts);

            if (showAlertModal) {
              showAlertModal('【デバッグ】大会ポイントを100Pt獲得しました！');
            }
          }
        );
      }
    }
  };

  return (
    <div
      id="screen-tournament-exchange"
      className="screen active"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.95)), url('assets/backgrounds/background_tournament01.png')`,
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
        style={{
          color: '#60a5fa',
          marginBottom: '5px',
          textShadow: '0 0 15px rgba(59, 130, 246, 0.6)',
          cursor: 'pointer',
        }}
        onClick={handleTitleClick}
      >
        交換所
      </h2>

      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {tournamentPoints.current} / 総ポイント:{' '}
        {tournamentPoints.total}
      </div>

      <div className="card-list-container">
        <div id="exchange-item-grid" className="card-list-grid-3col">
          {TOURNAMENT_EXCHANGE_LINEUP.map((item) => {
            const isCard = item.type === 'card';
            const isPlaymat = item.type === 'playmat';
            let isUnlocked = false;
            if (isCard) {
              isUnlocked = (inventory[item.id] || 0) >= 4;
            } else if (isPlaymat) {
              isUnlocked = unlockedPlaymats.includes(item.id);
            } else {
              isUnlocked = unlockedSkins.includes(item.id);
            }

            const canAfford = tournamentPoints.current >= item.cost;
            const opacity = isUnlocked ? '0.3' : canAfford ? '1.0' : '0.6';
            const charObj =
              CHARACTERS[item.charId || item.id] || CHARACTERS.android;

            let masterClass = {};
            if (isCard)
              masterClass = CARD_MASTER.find((c) => c.id === item.id) || {};
            if (isPlaymat)
              masterClass = PLAYMAT_MASTER.find((p) => p.id === item.id) || {};
            const rarityClass =
              isCard && masterClass.rarity
                ? ` rarity-${masterClass.rarity}`
                : '';

            let imgUrl = '';
            let displayName = item.name;
            let displayDesc = item.description;

            if (isCard) {
              imgUrl =
                masterClass.imgUrl ||
                (typeof getCardImgUrl === 'function'
                  ? getCardImgUrl(masterClass)
                  : `assets/cards/card_${masterClass.id || item.id}.jpg`);
              displayName = masterClass.name || item.name;
              displayDesc = masterClass.flavor || item.description;
            } else if (isPlaymat) {
              imgUrl =
                masterClass.image ||
                `assets/boards/board_${item.id.replace('pm_', '')}.png`;
              displayName = masterClass.name || item.name;
            } else {
              // スキンの場合
              imgUrl = `assets/characters/char_${item.id}.png`;
            }

            const displayTypeLabel = isCard
              ? 'カード'
              : isPlaymat
                ? 'プレイマット'
                : 'スキン';

            return (
              <div
                key={item.id}
                className="deck-card-item"
                style={{ opacity, cursor: 'pointer' }}
                onClick={() => {
                  playSound(SOUNDS?.seClick);
                  if (window.showExchangeDetailModal) {
                    window.showExchangeDetailModal({
                      id: item.id,
                      type: item.type,
                      cost: item.cost,
                      itemObj: isCard ? masterClass : {},
                      titleColor: isCard
                        ? null
                        : isPlaymat
                          ? '#facc15'
                          : charObj
                            ? charObj.color
                            : '#fff',
                      canExchange: canAfford,
                      isMaxed: isUnlocked,
                      titleName: displayName,
                      displayType: displayTypeLabel,
                      displayFlavor: displayDesc,
                      imgUrl: imgUrl,
                      onConfirm: () => {
                        handleExchange({
                          ...item,
                          isUnlocked,
                          canAfford,
                          imgUrl,
                          displayName,
                          displayDesc,
                          itemObj: masterClass,
                        });
                        window.closeExchangeDetailModal?.();
                      },
                    });
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
                    overflow: 'hidden',
                  }}
                >
                  <div
                    className="card-bg"
                    style={{
                      backgroundImage: `url('${imgUrl}')`,
                      backgroundSize: isCard
                        ? 'cover'
                        : isPlaymat
                          ? 'contain'
                          : '200%',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: isPlaymat ? 'center' : 'top center',
                      backgroundColor: isPlaymat ? '#000' : '',
                    }}
                  ></div>

                  {isCard && (
                    <>
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
                        {inventory[item.id] || 0}/4
                      </div>
                      <div
                        className="card-power"
                        style={{ fontSize: '1.4rem', bottom: 0, right: '4px' }}
                      >
                        {masterClass.power}
                      </div>
                      {window.renderSkillTag && (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: window.renderSkillTag(masterClass),
                          }}
                        ></div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        className="btn"
        style={{
          background: '#475569',
          padding: '10px 40px',
          marginTop: '15px',
        }}
        onClick={handleBack}
      >
        戻る
      </button>
    </div>
  );
}
