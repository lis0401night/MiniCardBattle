import { useEffect, useState } from 'react';
import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { saveDeck } from '../services/deck.js';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import {
  CHALLENGE_EXCHANGE_LINEUP,
  appendVersionQuery,
} from '../utils/constants/config.js';
import { PLAYMAT_MASTER } from '../utils/constants/playmats.js';
import {
  getCardImgUrl,
  getOrCreateUUID,
  playSound,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function ChallengeExchangeScreen() {
  const [challengePoints, setChallengePoints] = useState(() => ({
    current:
      parseInt(localStorage.getItem('mini_card_battle_challenge_points'), 10) ||
      0,
    total:
      parseInt(
        localStorage.getItem('mini_card_battle_challenge_total_points'),
        10
      ) || 0,
  }));
  const [unlockedSkins, setUnlockedSkins] = useState(
    () =>
      JSON.parse(localStorage.getItem('mini_card_battle_unlocked_skins')) || []
  );
  const [unlockedPlaymats, setUnlockedPlaymats] = useState(
    () =>
      JSON.parse(localStorage.getItem('mini_card_battle_owned_playmats')) || []
  );
  const [unlockedIcons, setUnlockedIcons] = useState(
    () =>
      JSON.parse(localStorage.getItem('mini_card_battle_unlocked_icons')) || []
  );
  const [inventory, setInventory] = useState(
    () => GameState.playerInventory || {}
  );
  const [pointsUpdated, setPointsUpdated] = useState(false);

  useEffect(() => {
    // API同期のために現在のポイントを取得
    const currentPts =
      parseInt(localStorage.getItem('mini_card_battle_challenge_points'), 10) ||
      0;
    const totalPts =
      parseInt(
        localStorage.getItem('mini_card_battle_challenge_total_points'),
        10
      ) || 0;

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

            // サーバーから取得したポイント(pts)がローカル(currentPts)より小さい場合、
            // ローカルで消費が行われた直後（あるいは未同期）である可能性が高いため、
            // サーバー側の古い値で巻き戻らないようにローカルの値を優先してガードします。
            let finalPts = pts;
            if (currentPts > pts || (pts === 0 && currentPts > 0)) {
              finalPts = currentPts;
            }

            let finalTotalPts = tPts;
            if (totalPts > tPts || (tPts === 0 && totalPts > 0)) {
              finalTotalPts = totalPts;
            }

            if (finalPts > 0 || currentPts === 0) {
              setChallengePoints({ current: finalPts, total: finalTotalPts });
              localStorage.setItem(
                'mini_card_battle_challenge_points',
                finalPts
              );
              localStorage.setItem(
                'mini_card_battle_challenge_total_points',
                finalTotalPts
              );

              // サーバーが未初期化(0)でローカルにデータがある場合は、サーバーにアップロードしてマスタを正す
              // これにより、オフラインで獲得したポイントがサーバーに同期される
              if (pts === 0 && currentPts > 0) {
                fetch('api/update_challenge_points.php', {
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
      } catch {
        // Ignore fetch errors in pure frontend modes
      }
    };
    fetchPoints();
  }, [pointsUpdated]);

  const handleExchange = async (item) => {
    // 最終ガード: 所持上限・アンロック済みのチェック
    const isCard = item.type === 'card';
    const isPlaymat = item.type === 'playmat';
    const isIcon = item.type === 'icon';
    let isAlreadyUnlocked = false;

    if (isCard) {
      isAlreadyUnlocked = (inventory[item.id] || 0) >= 4;
    } else if (isPlaymat) {
      isAlreadyUnlocked = unlockedPlaymats.includes(item.id);
    } else if (isIcon) {
      isAlreadyUnlocked = unlockedIcons.includes(item.id);
    } else {
      isAlreadyUnlocked = unlockedSkins.includes(item.id);
    }

    if (isAlreadyUnlocked) {
      showAlertModal(
        '既に最大数所持しているか、アンロック済みのアイテムです。'
      );
      return;
    }

    // 最終ガード: ポイント残高チェック
    if (challengePoints.current < item.cost) {
      showAlertModal('試練ポイントが不足しています。');
      return;
    }

    playSound(SOUNDS?.seCardPlace);

    const newPts = challengePoints.current - item.cost;

    // 【CodeRabbit指摘水平展開・データ整合性保護】サーバーへの同期完了（成功）を待ってからローカルのポイント減算・アイテム付与を確定させる
    try {
      await savePointsToServer(
        'update_challenge_points.php',
        newPts,
        challengePoints.total
      );
    } catch (e) {
      console.error('Failed to sync challenge points to server:', e);
      showAlertModal(
        'ポイントの同期に失敗しました。通信環境を確認して再試行してください。'
      );
      return;
    }

    localStorage.setItem('mini_card_battle_challenge_points', newPts);
    setChallengePoints((prev) => ({ ...prev, current: newPts }));

    if (item.type === 'card') {
      const currentCount = inventory[item.id] || 0;
      const newInventory = { ...inventory, [item.id]: currentCount + 1 };
      setInventory(newInventory);
      Object.assign(GameState, { playerInventory: newInventory });
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
    } else if (item.type === 'icon') {
      const newUnlocked = [...unlockedIcons, item.id];
      localStorage.setItem(
        'mini_card_battle_unlocked_icons',
        JSON.stringify(newUnlocked)
      );
      Object.assign(GameState, { unlockedIcons: newUnlocked });
      setUnlockedIcons(newUnlocked);
      showAlertModal(
        `「${item.name}」を交換しました！\nプロフィール設定画面でアイコンを変更できます。`
      );
    } else {
      const newUnlocked = [...unlockedSkins, item.id];
      localStorage.setItem(
        'mini_card_battle_unlocked_skins',
        JSON.stringify(newUnlocked)
      );
      Object.assign(GameState, { unlockedSkins: newUnlocked });
      setUnlockedSkins(newUnlocked);
      showAlertModal(
        `「${item.name}」を交換しました！\nキャラクター選択画面でスキンを変更できます。`
      );
    }

    setPointsUpdated((prev) => !prev);
  };

  // タイトルを10回クリックで試練ポイントを100Pt獲得するイースターエッグ
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して試練ポイントを100Pt獲得しますか？',
        () => {
          playSound(SOUNDS?.seSkill);
          const currentPts =
            parseInt(
              localStorage.getItem('mini_card_battle_challenge_points'),
              10
            ) || 0;
          const totalPts =
            parseInt(
              localStorage.getItem('mini_card_battle_challenge_total_points'),
              10
            ) || 0;
          const newPts = currentPts + 100;
          const newTotalPts = totalPts + 100;

          localStorage.setItem('mini_card_battle_challenge_points', newPts);
          localStorage.setItem(
            'mini_card_battle_challenge_total_points',
            newTotalPts
          );
          setChallengePoints({ current: newPts, total: newTotalPts });

          // 共通APIユーティリティを介してサーバーと同期
          savePointsToServer(
            'update_challenge_points.php',
            newPts,
            newTotalPts
          );

          if (showAlertModal) {
            showAlertModal('【デバッグ】試練ポイントを100Pt獲得しました！');
          }
        }
      );
    }
  });

  return (
    <CompactScreenLayout
      id="screen-challenge-exchange"
      backgroundImage="background_challenge.png"
      title="交換所"
      titleColor="#c084fc"
      titleGlow={true}
      onTitleClick={handleTitleClick}
      backTo="screen-dungeon-menu"
    >
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {challengePoints.current} / 総ポイント:{' '}
        {challengePoints.total}
      </div>

      <div className="card-list-container">
        <div id="exchange-item-grid" className="card-list-grid-3col">
          {CHALLENGE_EXCHANGE_LINEUP.map((item) => {
            const isCard = item.type === 'card';
            const isPlaymat = item.type === 'playmat';
            const isIcon = item.type === 'icon';
            let isUnlocked = false;
            if (isCard) {
              isUnlocked = (inventory[item.id] || 0) >= 4;
            } else if (isPlaymat) {
              isUnlocked = unlockedPlaymats.includes(item.id);
            } else if (isIcon) {
              isUnlocked = unlockedIcons.includes(item.id);
            } else {
              isUnlocked = unlockedSkins.includes(item.id);
            }

            const canAfford = challengePoints.current >= item.cost;
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
            } else if (isIcon) {
              imgUrl = `assets/icons/icon_${item.id}.png`;
            } else {
              // スキンの場合
              imgUrl = `assets/characters/char_${item.id}.png`;
            }

            imgUrl = appendVersionQuery(imgUrl);

            const displayTypeLabel = isCard
              ? 'カード'
              : isPlaymat
                ? 'プレイマット'
                : isIcon
                  ? 'アイコン'
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
                        : isPlaymat || isIcon
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
                        : isPlaymat || isIcon
                          ? 'contain'
                          : '200%',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition:
                        isPlaymat || isIcon ? 'center' : 'top center',
                      backgroundColor: isPlaymat || isIcon ? '#0f172a' : '',
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
    </CompactScreenLayout>
  );
}
