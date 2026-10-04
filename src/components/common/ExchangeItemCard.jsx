import { CARD_MASTER } from '../../utils/constants/cards.js';
import { CHARACTERS } from '../../utils/constants/characters.js';
import {
  appendVersionQuery,
  MAX_CARD_COPIES,
} from '../../utils/constants/config.js';
import {
  DEFAULT_PACK_COVER_CARD_ID,
  getPackById,
} from '../../utils/constants/packs.js';
import {
  getPlaymatImgUrl,
  PLAYMAT_MASTER,
} from '../../utils/constants/playmats.js';
import {
  getCardImgUrl,
  getShineTicketsCount,
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
  unlockedBattlePasses = [],
  onExchange,
}) {
  const isCard = item.type === 'card';
  const isPremium = item.type === 'premium';
  const isPlaymat = item.type === 'playmat';
  const isIcon = item.type === 'icon';
  const isPack = item.type === 'pack';
  const isBattlePass = item.type === 'battle_pass';
  const isShineTicket = item.type === 'shine_ticket';

  // アンロック/最大所持状態の判定（パックは全封入カードが上限カンストしている場合に最大到達、チケットは常時購入可能）
  let isUnlocked = false;
  const pack = isPack
    ? getPackById(item.packObj || item.id || item.packId || item)
    : null;
  const resolvedPackCardIds = isPack
    ? pack?.cardIds || item.packObj?.cardIds || item.cardIds || []
    : [];

  if (isPack) {
    let totalMissing = 0;
    resolvedPackCardIds.forEach((cId) => {
      const owned = Number(inventory[cId]) || 0;
      totalMissing += Math.max(0, MAX_CARD_COPIES - owned);
    });
    // 収録カードが解決できない場合は最大所持と誤判定しない
    isUnlocked = resolvedPackCardIds.length > 0 && totalMissing <= 0;
  } else if (isCard) {
    isUnlocked = (inventory[item.id] || 0) >= MAX_CARD_COPIES;
  } else if (isPremium) {
    isUnlocked = unlockedPremium.includes(item.id);
  } else if (isPlaymat) {
    isUnlocked = unlockedPlaymats.includes(item.id);
  } else if (isIcon) {
    isUnlocked = unlockedIcons.includes(item.id);
  } else if (isBattlePass) {
    isUnlocked = unlockedBattlePasses.includes(item.id) || !!item.isUnlocked;
  } else if (isShineTicket) {
    isUnlocked = false;
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

  if (isBattlePass) {
    displayName = item.name || 'バトルパス S1';
    displayDesc =
      item.description ||
      'クイックマッチで勝利してポイントを貯め、様々な報酬を獲得できるバトルパス。';
    imgUrl =
      item.thumbUrl ||
      item.imgUrl ||
      item.passObj?.thumbUrl ||
      item.passObj?.imgUrl ||
      'assets/characters/char_knight_assassin_thumb.webp';
    originalImgUrl =
      item.imgUrl ||
      item.passObj?.imgUrl ||
      'assets/characters/char_knight_assassin.webp';
  } else if (isPack) {
    displayName = item.name || 'vol01:ビギニング';
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

  const displayTypeLabel = isBattlePass
    ? 'バトルパス'
    : isShineTicket
      ? 'アイテム'
      : isPack
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
        titleColor:
          isPack || isShineTicket
            ? '#facc15'
            : isBattlePass
              ? '#f59e0b'
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
        coverCardId:
          item.coverCardId || pack?.coverCardId || DEFAULT_PACK_COVER_CARD_ID,
        logoUrl: item.logoUrl || item.packObj?.logoUrl || pack?.logoUrl,
        packCardIds: resolvedPackCardIds,
        packCardCount: resolvedPackCardIds.length,
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
            isPlaymat || isIcon || isPack || isBattlePass || isShineTicket
              ? '#0f172a'
              : undefined,
        }}
      >
        {isShineTicket ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 4px',
              boxSizing: 'border-box',
              position: 'relative',
              textAlign: 'center',
            }}
          >
            {/* 上部バッジ */}
            <div
              style={{
                position: 'absolute',
                top: '4px',
                left: '4px',
                background: 'rgba(234, 179, 8, 0.95)',
                color: '#000000',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '0.65rem',
                zIndex: 2,
                boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
              }}
            >
              アイテム
            </div>

            {/* 右上所持数バッジ */}
            <div
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: 'rgba(0, 0, 0, 0.85)',
                color: '#facc15',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '0.65rem',
                zIndex: 2,
                border: '1px solid #eab308',
              }}
            >
              所持 {getShineTicketsCount()}
            </div>

            {/* アイコン */}
            <div
              style={{
                fontSize: '2.4rem',
                marginBottom: '4px',
                filter: 'drop-shadow(0 2px 8px rgba(234, 179, 8, 0.7))',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              🌟
            </div>

            {/* タイトル */}
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: '#facc15',
                marginBottom: '4px',
                textShadow: '0 1px 4px rgba(0, 0, 0, 0.8)',
                zIndex: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {displayName}
            </div>

            {/* コスト */}
            <div
              style={{
                padding: '2px 8px',
                background: canAfford
                  ? 'linear-gradient(45deg, #eab308, #ca8a04)'
                  : '#334155',
                color: canAfford ? '#000000' : '#64748b',
                borderRadius: '12px',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                zIndex: 1,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
              }}
            >
              {item.cost} Pt
            </div>
          </div>
        ) : isBattlePass ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '8px',
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
                  objectFit: 'cover',
                  objectPosition: 'center 15%',
                  width: '100%',
                  height: '100%',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* 上部バッジ（解放済みの場合のみ表示し、PASS表記は非表示） */}
            {isUnlocked && (
              <div
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '4px',
                  background: '#64748b',
                  color: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  fontSize: '0.65rem',
                  zIndex: 2,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                }}
              >
                解放済
              </div>
            )}
            {/* 下部情報バー（タイトルのみ表示し、コストは非表示） */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 60%, transparent 100%)',
                padding: '16px 4px 6px 4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 2,
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  color: '#fbbf24',
                  textShadow: '0 1px 4px rgba(0, 0, 0, 0.9)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '95%',
                }}
              >
                {displayName}
              </div>
            </div>
          </div>
        ) : isPack ? (
          <PackCoverImage
            coverCardId={
              item.coverCardId ||
              pack?.coverCardId ||
              DEFAULT_PACK_COVER_CARD_ID
            }
            logoUrl={item.logoUrl || item.packObj?.logoUrl || pack?.logoUrl}
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
