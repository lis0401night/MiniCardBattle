import { useExchangeScreen } from '../hooks/useExchangeScreen.js';
import CompactScreenLayout from '../components/common/CompactScreenLayout.jsx';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import {
  FORTUNE_EXCHANGE_LINEUP,
  appendVersionQuery,
} from '../utils/constants/config.js';
import { PLAYMAT_MASTER } from '../utils/constants/playmats.js';
import { getCardImgUrl, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function FortuneExchangeScreen() {
  const {
    points: fortunePoints,
    unlockedSkins,
    unlockedPlaymats,
    unlockedIcons,
    inventory,
    handleExchange,
  } = useExchangeScreen({
    pointsKey: 'fortune',
    apiEndpoint: 'update_fortune_points.php',
  });

  return (
    <CompactScreenLayout
      id="screen-fortune-exchange"
      backgroundImage=""
      title="交換所"
      titleColor="#f97316"
      titleGlow={true}
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
        className="card-list-container"
        style={{ flex: 1, minHeight: 0, maxHeight: '500px' }}
      >
        {FORTUNE_EXCHANGE_LINEUP && FORTUNE_EXCHANGE_LINEUP.length > 0 ? (
          <div id="exchange-item-grid" className="card-list-grid-3col">
            {FORTUNE_EXCHANGE_LINEUP.map((item) => {
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
                imgUrl =
                  masterClass.image ||
                  `assets/boards/board_${item.id.replace('pm_', '')}.webp`;
                originalImgUrl = imgUrl;
                displayName = masterClass.name || item.name;
              } else if (isIcon) {
                imgUrl = `assets/icons/icon_${item.id}.webp`;
                originalImgUrl = imgUrl;
              } else {
                // スキンの場合
                imgUrl = `assets/characters/char_${item.id}.webp`;
                originalImgUrl = imgUrl;
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
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor: isPlaymat || isIcon ? '#0f172a' : '',
                      }}
                    >
                      <img
                        src={imgUrl}
                        alt={displayName}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: isCard
                            ? 'cover'
                            : isPlaymat || isIcon
                              ? 'contain'
                              : 'cover',
                          objectPosition:
                            isPlaymat || isIcon ? 'center' : 'top center',
                          display: 'block',
                        }}
                      />
                    </div>

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
