import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEasterEgg } from '../hooks/useEasterEgg.js';
import { useExchangeScreen } from '../hooks/useExchangeScreen.js';
import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import { showAlertModal, showConfirmModal } from '../services/uiModals.js';
import { savePointsToServer } from '../utils/apiUtils.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import {
  FORTUNE_EXCHANGE_LINEUP,
  appendVersionQuery,
  FORTUNE_POINTS_KEY,
  FORTUNE_TOTAL_POINTS_KEY,
} from '../utils/constants/config.js';
import {
  PLAYMAT_MASTER,
  getPlaymatImgUrl,
} from '../utils/constants/playmats.js';
import { getCardImgUrl, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function FortuneExchangeScreen() {
  const {
    points: fortunePoints,
    setPoints: setFortunePoints,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    inventory,
    handleExchange,
  } = useExchangeScreen({
    pointsKey: 'fortune',
    pointsLocalKey: FORTUNE_POINTS_KEY,
    pointsTotalLocalKey: FORTUNE_TOTAL_POINTS_KEY,
    apiEndpoint: 'update_fortune_points.php',
  });

  // タイトルを10回クリックで運命の邂逅ポイントを100Pt獲得するイースターエッグ
  const handleTitleClick = useEasterEgg(() => {
    if (showConfirmModal) {
      showConfirmModal(
        'デバッグモードを起動して運命の邂逅ポイントを100Pt獲得しますか？',
        () => {
          playSound(SOUNDS?.seSkill);
          const currentPts =
            parseInt(localStorage.getItem(FORTUNE_POINTS_KEY), 10) || 0;
          const totalPts =
            parseInt(localStorage.getItem(FORTUNE_TOTAL_POINTS_KEY), 10) || 0;
          const newPts = currentPts + 100;
          const newTotalPts = totalPts + 100;

          localStorage.setItem(FORTUNE_POINTS_KEY, newPts);
          localStorage.setItem(FORTUNE_TOTAL_POINTS_KEY, newTotalPts);
          setFortunePoints({ current: newPts, total: newTotalPts });

          // 共通APIユーティリティを介してサーバーと同期
          savePointsToServer('update_fortune_points.php', newPts, newTotalPts);

          if (showAlertModal) {
            showAlertModal(
              '【デバッグ】運命の邂逅ポイントを100Pt獲得しました！'
            );
          }
        }
      );
    }
  });

  const listContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(() => {
    if (typeof window === 'undefined') return 400;
    return Math.min(Math.round(window.innerWidth * 0.95), 440);
  });

  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return undefined;
    const updateSize = () => {
      const width = el.clientWidth;
      setContainerWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 交換アイテムを3列ごとに行配列へ分割
  const itemRows = useMemo(() => {
    const rows = [];
    const cols = 3;
    const lineup = FORTUNE_EXCHANGE_LINEUP || [];
    for (let i = 0; i < lineup.length; i += cols) {
      rows.push(lineup.slice(i, i + cols));
    }
    return rows;
  }, []);

  // 3列表示用の正確な1行高さを事前計算（アスペクト比 1:1.5、gapはuseVirtualizerが管理）
  const estimatedRowHeight = useMemo(() => {
    const innerWidth = Math.max(0, containerWidth - 10); // 左右padding 5pxずつ分
    const cols = 3;
    const gap = 15;
    const cardWidthPx = Math.max(0, (innerWidth - gap * (cols - 1)) / cols);
    return cardWidthPx > 0 ? cardWidthPx * 1.5 : 200;
  }, [containerWidth]);

  // @tanstack/react-virtual による行単位仮想化
  const rowVirtualizer = useVirtualizer({
    count: itemRows.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    gap: 15,
    overscan: 6,
  });

  // 初回マウント時および幅変更時に仮想スクロールキャッシュを即時再計算
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, containerWidth, estimatedRowHeight]);

  return (
    <CompactScreenLayout
      id="screen-fortune-exchange"
      backgroundImage="background_fortune01.webp"
      title="交換所"
      titleColor="#f97316"
      titleGlow={true}
      onTitleClick={handleTitleClick}
      backTo="screen-fortune-menu"
    >
      <div
        id="exchange-points-display"
        style={{ fontSize: '0.9rem', marginBottom: '10px', color: '#cbd5e1' }}
      >
        所持ポイント: {fortunePoints.current} / 総ポイント:{' '}
        {fortunePoints.total}
      </div>

      <div
        ref={listContainerRef}
        className="card-list-container"
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: '500px',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {itemRows.length > 0 ? (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = itemRows[virtualRow.index] || [];
              return (
                <div
                  key={virtualRow.key}
                  className="card-list-grid-3col"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '15px',
                  }}
                >
                  {row.map((item) => {
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

                    const canAfford = fortunePoints.current >= item.cost;
                    const opacity = isUnlocked
                      ? '0.3'
                      : canAfford
                        ? '1.0'
                        : '0.6';
                    const charObj =
                      CHARACTERS[item.charId || item.id] || CHARACTERS.android;

                    let masterClass = {};
                    if (isCard)
                      masterClass =
                        CARD_MASTER.find((c) => c.id === item.id) || {};
                    if (isPlaymat)
                      masterClass =
                        PLAYMAT_MASTER.find((p) => p.id === item.id) || {};
                    const rarityClass =
                      isCard && masterClass.rarity
                        ? ` rarity-${masterClass.rarity}`
                        : '';

                    let imgUrl = '';
                    let originalImgUrl = '';
                    let displayName = item.name;
                    let displayDesc = item.description;

                    if (isCard) {
                      imgUrl =
                        masterClass.imgUrl ||
                        (typeof getCardImgUrl === 'function'
                          ? getCardImgUrl(masterClass, true)
                          : `assets/cards/card_${masterClass.id || item.id}_thumb.webp`);
                      originalImgUrl =
                        masterClass.imgUrl ||
                        (typeof getCardImgUrl === 'function'
                          ? getCardImgUrl(masterClass, false)
                          : `assets/cards/card_${masterClass.id || item.id}.webp`);
                      displayName = masterClass.name || item.name;
                      displayDesc = masterClass.flavor || item.description;
                    } else if (isPlaymat) {
                      imgUrl = getPlaymatImgUrl(
                        masterClass.id || item.id,
                        true
                      );
                      originalImgUrl = getPlaymatImgUrl(
                        masterClass.id || item.id,
                        false
                      );
                      displayName = masterClass.name || item.name;
                    } else if (isIcon) {
                      imgUrl = `assets/icons/icon_${item.id}.webp`;
                      originalImgUrl = imgUrl;
                    } else {
                      // スキンの場合（一覧はサムネイル、詳細はフルサイズ）
                      imgUrl = `assets/characters/char_${item.id}_thumb.webp`;
                      originalImgUrl = `assets/characters/char_${item.id}.webp`;
                    }

                    imgUrl = appendVersionQuery(imgUrl);
                    originalImgUrl = appendVersionQuery(originalImgUrl);

                    const displayTypeLabel = isCard
                      ? 'カード'
                      : isPlaymat
                        ? 'プレイマット'
                        : isIcon
                          ? 'アイコン'
                          : 'スキン';

                    return (
                      <div
                        key={`${item.type}_${item.id}`}
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
                              imgUrl: originalImgUrl,
                              onConfirm: () => {
                                handleExchange({
                                  ...item,
                                  isUnlocked,
                                  canAfford,
                                  imgUrl: originalImgUrl,
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
                            backgroundColor:
                              isPlaymat || isIcon ? '#0f172a' : undefined,
                          }}
                        >
                          {imgUrl && (
                            <img
                              className="card-bg"
                              src={imgUrl}
                              alt={displayName}
                              loading="lazy"
                              decoding="async"
                              style={{
                                objectFit: isCard
                                  ? 'cover'
                                  : isPlaymat || isIcon
                                    ? 'contain'
                                    : 'cover',
                                objectPosition:
                                  isPlaymat || isIcon ? 'center' : 'top center',
                                width: '100%',
                                height: '100%',
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                borderRadius: 'inherit',
                                pointerEvents: 'none',
                              }}
                            />
                          )}

                          {isIcon && (
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
                                style={{
                                  fontSize: '1.4rem',
                                  bottom: 0,
                                  right: '4px',
                                }}
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
              );
            })}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              color: '#cbd5e1',
              fontSize: '1.2rem',
              fontWeight: 'bold',
            }}
          >
            準備中です
          </div>
        )}
      </div>
    </CompactScreenLayout>
  );
}
