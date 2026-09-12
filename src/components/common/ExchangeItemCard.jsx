import { CARD_MASTER } from '../../utils/constants/cards.js';
import { CHARACTERS } from '../../utils/constants/characters.js';
import {
  appendVersionQuery,
  MAX_CARD_COPIES,
} from '../../utils/constants/config.js';
import {
  getPlaymatImgUrl,
  PLAYMAT_MASTER,
} from '../../utils/constants/playmats.js';
import {
  getPackById,
  PACK_VOL01_CARD_IDS,
} from '../../utils/constants/packs.js';
import {
  getCardImgUrl,
  isTransitioning,
  playSound,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import PackCoverImage from './PackCoverImage.jsx';

/**
 * 交換所アイテムカード表示コンポーネント。
 * カード、プレイマット、アイコン、スキン、パックの表示と詳細モーダル（showExchangeDetailModal）の呼び出しを一元化する。
 *
 * @param {Object} props
 * @param {Object} props.item - 交換所アイテムオブジェクト ({ id, type, cost, name, description, charId, coverCardId, packObj })
 * @param {number} props.currentPoints - プレイヤーの現在所持ポイント
 * @param {Object} [props.inventory={}] - プレイヤーのカード所持数マップ
 * @param {Array<string>} [props.unlockedSkins=[]] - 解放済みスキンID配列
 * @param {Array<string>} [props.unlockedPlaymats=[]] - 解放済みプレイマットID配列
 * @param {Array<string>} [props.unlockedIcons=[]] - 解放済みアイコンID配列
 * @param {Array<string>} [props.unlockedPremium=[]] - 解放済みプレミアムカードID配列
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
  unlockedPremium = [],
  onExchange,
}) {
  const isCard = item.type === 'card';
  const isPremium = item.type === 'premium';
  const isPlaymat = item.type === 'playmat';
  const isIcon = item.type === 'icon';
  const isPack = item.type === 'pack';

  // アンロック/最大所持状態の判定（パックは全封入カードが上限カンストしている場合に最大到達）
  let isUnlocked = false;
  if (isPack) {
    const pack = getPackById(item.packObj || item.id || item.packId || item);
    const cardIds = pack?.cardIds || item.cardIds || PACK_VOL01_CARD_IDS;
    let totalMissing = 0;
    cardIds.forEach((cId) => {
      const owned = Number(inventory[cId]) || 0;
      totalMissing += Math.max(0, MAX_CARD_COPIES - owned);
    });
    isUnlocked = totalMissing <= 0;
  } else if (isCard) {
    isUnlocked = (inventory[item.id] || 0) >= MAX_CARD_COPIES;
  } else if (isPremium) {
    isUnlocked = unlockedPremium.includes(item.id);
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
  if (isCard || isPremium) {
    masterClass = CARD_MASTER.find((c) => c.id === item.id) || {};
  } else if (isPlaymat) {
    masterClass = PLAYMAT_MASTER.find((p) => p.id === item.id) || {};
  }

  const rarityClass =
    (isCard || isPremium) && masterClass.rarity
      ? ` rarity-${masterClass.rarity}`
      : '';

  // 画像URLおよびテキスト情報の解決
  let imgUrl = '';
  let originalImgUrl = '';
  let displayName = item.name;
  let displayDesc = item.description;

  if (isPack) {
    displayName = item.name || 'vol1:ビギニング';
    displayDesc = item.description || '';
  } else if (isCard || isPremium) {
    const cardTarget = isPremium
      ? { ...masterClass, isPremium: true }
      : masterClass;
    imgUrl =
      masterClass.imgUrl ||
      (typeof getCardImgUrl === 'function'
        ? getCardImgUrl(cardTarget, true)
        : `assets/cards/card_${masterClass.id || item.id}_thumb.webp`);
    originalImgUrl =
      masterClass.imgUrl ||
      (typeof getCardImgUrl === 'function'
        ? getCardImgUrl(cardTarget, false)
        : `assets/cards/card_${masterClass.id || item.id}.webp`);
    displayName = masterClass.name || item.name;
    displayDesc = masterClass.flavor || item.description;
  } else if (isPlaymat) {
    imgUrl = getPlaymatImgUrl(masterClass.id || item.id, true);
    originalImgUrl = getPlaymatImgUrl(masterClass.id || item.id, false);
    displayName = masterClass.name || item.name;
    displayDesc = masterClass.description || item.description;
    if (!displayDesc && String(item.id).startsWith('pm_card_')) {
      const cardId = String(item.id).replace('pm_card_', '');
      const card = CARD_MASTER.find((c) => c.id === cardId);
      if (card) displayDesc = card.flavor;
    }
  } else if (isIcon) {
    imgUrl = appendVersionQuery(`assets/icons/icon_${item.id}.webp`);
    originalImgUrl = imgUrl;
    displayName = item.name;
    displayDesc = item.description;
    if (!displayDesc && String(item.id).startsWith('card_')) {
      const cardId = String(item.id).replace('card_', '');
      const card = CARD_MASTER.find((c) => c.id === cardId);
      if (card) displayDesc = card.flavor;
    }
  } else {
    // スキンの場合（一覧はサムネイル、詳細はフルサイズ）
    imgUrl = appendVersionQuery(`assets/characters/char_${item.id}_thumb.webp`);
    originalImgUrl = appendVersionQuery(
      `assets/characters/char_${item.id}.webp`
    );
  }

  imgUrl = appendVersionQuery(imgUrl);
  originalImgUrl = appendVersionQuery(originalImgUrl);

  const displayTypeLabel = isPack
    ? 'パック'
    : isCard
      ? 'カード'
      : isPremium
        ? 'プレミアム特典'
        : isPlaymat
          ? 'プレイマット'
          : isIcon
            ? 'アイコン'
            : 'スキン';

  /**
   * アイテムカードクリック時の詳細モーダル表示処理
   */
  const handleClick = () => {
    if (isTransitioning) return;
    playSound(SOUNDS?.seClick);
    if (window.showExchangeDetailModal) {
      window.showExchangeDetailModal({
        id: item.id,
        type: item.type,
        cost: item.cost,
        itemObj: isCard || isPremium ? masterClass : {},
        packObj: isPack ? item.packObj || item : null,
        titleColor: isPack
          ? '#facc15'
          : isCard || isPremium
            ? null
            : isPlaymat || isIcon
              ? '#facc15'
              : charObj
                ? charObj.color
                : '#fff',
        canExchange: canAfford && !isUnlocked,
        isMaxed: isUnlocked,
        titleName: displayName,
        displayType: displayTypeLabel,
        displayFlavor: displayDesc,
        coverCardId: item.coverCardId || 'catastrophe',
        logoUrl: item.logoUrl || item.packObj?.logoUrl,
        packCardIds: item.packObj?.cardIds || item.cardIds || [],
        packCardCount:
          (item.packObj?.cardIds || item.cardIds || []).length || 43,
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
          backgroundColor:
            isPlaymat || isIcon || isPack ? '#0f172a' : undefined,
        }}
      >
        {isPack ? (
          <PackCoverImage
            coverCardId={item.coverCardId || 'catastrophe'}
            logoUrl={item.logoUrl || item.packObj?.logoUrl}
          />
        ) : (
          imgUrl && (
            <img
              className="card-bg"
              src={imgUrl}
              alt={displayName}
              loading="lazy"
              decoding="async"
              style={{
                objectFit:
                  isCard || isPremium
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
                pointerEvents: 'none',
              }}
            />
          )
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

        {(isCard || isPremium) && (
          <>
            {isCard && (
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
                {inventory[item.id] || 0}/{MAX_CARD_COPIES}
              </div>
            )}
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
}
