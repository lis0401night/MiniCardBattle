import { CARD_MASTER } from '../../utils/constants/cards.js';
import { CHARACTERS } from '../../utils/constants/characters.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import {
  getPlaymatImgUrl,
  PLAYMAT_MASTER,
} from '../../utils/constants/playmats.js';
import { getCardImgUrl, playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * 交換所アイテムカード表示コンポーネント。
 * カード、プレイマット、アイコン、スキンの表示と詳細モーダル（showExchangeDetailModal）の呼び出しを一元化する。
 *
 * @param {Object} props
 * @param {Object} props.item - 交換所アイテムオブジェクト ({ id, type, cost, name, description, charId })
 * @param {number} props.currentPoints - プレイヤーの現在所持ポイント
 * @param {Object} [props.inventory={}] - プレイヤーのカード所持数マップ
 * @param {Array<string>} [props.unlockedSkins=[]] - 解放済みスキンID配列
 * @param {Array<string>} [props.unlockedPlaymats=[]] - 解放済みプレイマットID配列
 * @param {Array<string>} [props.unlockedIcons=[]] - 解放済みアイコンID配列
 * @param {Function} props.onExchange - 交換確定時コールバック
 * @returns {JSX.Element} 交換所アイテムカード要素
 */
export default function ExchangeItemCard({
  item,
  currentPoints,
  inventory = {},
  unlockedSkins = [],
  unlockedPlaymats = [],
  unlockedIcons = [],
  onExchange,
}) {
  const isCard = item.type === 'card';
  const isPlaymat = item.type === 'playmat';
  const isIcon = item.type === 'icon';

  // アンロック/最大所持状態の判定
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

  const canAfford = currentPoints >= item.cost;
  const opacity = isUnlocked ? '0.3' : canAfford ? '1.0' : '0.6';

  const charObj = CHARACTERS[item.charId || item.id] || CHARACTERS.android;

  // マスターデータ情報の取得
  let masterClass = {};
  if (isCard) {
    masterClass = CARD_MASTER.find((c) => c.id === item.id) || {};
  } else if (isPlaymat) {
    masterClass = PLAYMAT_MASTER.find((p) => p.id === item.id) || {};
  }

  const rarityClass =
    isCard && masterClass.rarity ? ` rarity-${masterClass.rarity}` : '';

  // 画像URLおよびテキスト情報の解決
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
    imgUrl = getPlaymatImgUrl(masterClass.id || item.id, true);
    originalImgUrl = getPlaymatImgUrl(masterClass.id || item.id, false);
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

  /**
   * アイテムカードクリック時の詳細モーダル表示処理
   */
  const handleClick = () => {
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
          onExchange?.({
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
  };

  return (
    <div
      className="deck-card-item"
      style={{ opacity, cursor: 'pointer' }}
      onClick={handleClick}
    >
      <div
        className={`card blue${rarityClass}`}
        style={{
          backgroundColor: isPlaymat || isIcon ? '#0f172a' : undefined,
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
              objectPosition: isPlaymat || isIcon ? 'center' : 'top center',
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
            src={appendVersionQuery('assets/icons/iconframe_gold.webp')}
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
          </>
        )}
      </div>

      <div
        className="card-name"
        style={{
          fontSize: '0.8rem',
          marginTop: '4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: '#cbd5e1',
          textAlign: 'center',
        }}
      >
        {displayName}
      </div>
      <div
        style={{
          fontSize: '0.75rem',
          color: isUnlocked ? '#94a3b8' : canAfford ? '#facc15' : '#ef4444',
          fontWeight: 'bold',
          textAlign: 'center',
        }}
      >
        {isUnlocked ? '交換完了' : `${item.cost} Pt`}
      </div>
    </div>
  );
}
