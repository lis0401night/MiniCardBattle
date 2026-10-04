import { useState } from 'react';
import { GameState } from '../../state/gameState.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import { getObtainMethodsText } from '../../utils/constants/obtainMethods.js';
import {
  PACK_DEFAULT_RARITY_WEIGHTS,
  DEFAULT_PACK_COVER_CARD_ID,
} from '../../utils/constants/packs.js';
import { SKILLS } from '../../utils/constants/skills.js';
import { STATUSES } from '../../utils/constants/statuses.js';
import {
  getCardActiveStatuses,
  getCardImgUrl,
  getShineTicketsCount,
  getSkillBadgeInfo,
  playSound,
  resolveCardChoices,
  resolveCardSupremacySkills,
} from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import CardShineOverlay from './CardShineOverlay.jsx';
import PackCoverImage from './PackCoverImage.jsx';

/**
 * カード・スキン・プレイマット・アイコン・パックの共通プレビュー表示コンポーネント。
 * styleProps の種別フラグ（isPack, isSkin, isPlaymat, isIcon）や各種設定に応じて、
 * カード画像/パックカバー表示、スキル一覧/アコーディオン、パック排出確率、交換アクション等を切り替えて描画します。
 *
 * @param {Object} props
 * @param {Object} props.card - 表示対象のカードまたはアイテムデータオブジェクト
 * @param {Object} [props.styleProps={}] - 表示制御プロパティオブジェクト（isPack, isSkin, isPlaymat, isIcon, coverCardId, logoUrl, packCardIds, packCardCount, rarityWeights, exchangeData, containerClass 等）
 * @param {boolean} [props.showPremiumTag=false] - プレミアムカード獲得タグを表示するかどうか
 * @param {boolean} [props.isRevealed=true] - カードを表面（公開状態）として表示するか（false時は裏面タップ待機）
 * @param {JSX.Element|null} [props.customActionSlot=null] - プレビュー下部に描画するカスタムアクション領域
 * @param {Function|null} [props.onRevealAreaClick=null] - 未公開エリアタップ時のコールバック関数
 * @param {Function|null} [props.onImageZoom=null] - 画像タップによる拡大表示時のコールバック関数
 * @param {Function|null} [props.onEquipClick=null] - スキン・称号などの装備/解除ボタンクリック時のコールバック関数
 * @param {Function|null} [props.onLinkClick=null] - スキル説明文内のカードリンククリック時のコールバック関数 (targetId: string, segment: object) => void
 * @param {Function|null} [props.onParentBack=null] - トークンや関連カードから親カード詳細へ戻るボタンクリック時のコールバック関数
 * @param {Function|null} [props.onToggleShine=null] - 通常/シャイン表示切り替え時のコールバック関数
 * @param {Function|null} [props.onTogglePremium=null] - 通常/プレミアム表示切り替え時のコールバック関数
 * @param {Function|null} [props.onClosePreview=null] - プレビューモーダルを閉じる際のコールバック関数
 * @param {Function|null} [props.onAcquisitionOk=null] - 報酬獲得確認「OK」ボタンクリック時のコールバック関数
 * @param {Function|null} [props.onExchangeConfirm=null] - 交換所アイテム交換確定ボタンクリック時のコールバック関数
 * @param {Function|null} [props.onExchangeBack=null] - 交換所詳細モーダルから戻る際のコールバック関数
 * @param {Function|null} [props.renderSkillTagReact=null] - スキルタグを描画する外部React関数（互換用）
 * @returns {JSX.Element|null} プレビューモーダルコンテンツ要素、cardがnullの場合はnull
 */
function CardPreviewContent({
  card,
  styleProps = {},
  showPremiumTag = false,

  // UI states & specific props for Reward Overlay override
  isRevealed = true,
  customActionSlot = null,
  onRevealAreaClick = null,

  // Callbacks from GlobalModals
  onImageZoom = null,
  onEquipClick = null,
  onLinkClick = null,
  onParentBack = null,
  onToggleShine = null,
  onTogglePremium = null,
  onClosePreview = null,
  onAcquisitionOk = null,
  onExchangeConfirm = null,
  onExchangeBack = null,

  // External Helpers injected for backwards compatibility or global access
  renderSkillTagReact = null,
}) {
  const [isImageZoomedLocal, setIsImageZoomedLocal] = useState(false);

  if (!card) return null;

  const isSkin = styleProps.isSkin || false;
  const isPack = styleProps.isPack || false;
  const isBattlePass = styleProps.isBattlePass || false;
  const isShineTicket = styleProps.isShineTicket || false;
  const isItemLike = isPack || isBattlePass || isShineTicket;
  const isStandardCard =
    !isSkin && !styleProps.isPlaymat && !styleProps.isIcon && !isItemLike;

  // パックの場合の排出確率を動的に算出（PACK_DEFAULT_RARITY_WEIGHTSフォールバック付き）
  const packWeights = styleProps.rarityWeights || PACK_DEFAULT_RARITY_WEIGHTS;
  const legendWeight = packWeights[4] ?? PACK_DEFAULT_RARITY_WEIGHTS[4] ?? 10;
  const goldWeight = packWeights[3] ?? PACK_DEFAULT_RARITY_WEIGHTS[3] ?? 30;
  const silverWeight = packWeights[2] ?? PACK_DEFAULT_RARITY_WEIGHTS[2] ?? 60;
  const totalWeight = legendWeight + goldWeight + silverWeight || 100;
  const legendPct = Math.round((legendWeight / totalWeight) * 100);
  const goldPct = Math.round((goldWeight / totalWeight) * 100);
  const silverPct = Math.max(0, 100 - legendPct - goldPct);
  const imgUrl =
    styleProps.imgUrl || (!isPack && getCardImgUrl ? getCardImgUrl(card) : '');
  const rarityClass = card.isToken
    ? ' rarity-0'
    : card.rarity !== undefined && card.rarity !== null
      ? ` rarity-${card.rarity}`
      : '';
  const rarityColors = {
    0: '#a3a3a3',
    1: '#cd7f32',
    2: '#e2e8f0',
    3: '#facc15',
    4: '#fde047',
  };
  const nameColor =
    styleProps.titleColor || rarityColors[card.rarity] || '#fff';
  const filter = GameState.playerConfig?.filter || 'none';

  // 盤面カードかどうかの判定：呼び出し元からの明示指定（styleProps.isBoard）を最優先し、
  // 未指定時は「対戦画面中（appState === 'battle'）」かつ盤面配置中（onBoard/lane/盤面配列に含まれる）の場合のみ true とする。
  // ※ 対戦外画面（デッキ確認、デッキ編成、カード一覧等）で owner が付与されたカードが盤面カードと誤認されるのを恒久的に防止する。
  const isBattle =
    typeof GameState !== 'undefined' && GameState.appState === 'battle';
  const isBoardCard = Boolean(
    styleProps.isBoard ??
    (isBattle &&
      (card.onBoard ||
        (card.lane !== undefined && card.lane !== null) ||
        GameState.playerBoard?.includes(card) ||
        GameState.enemyBoard?.includes(card)))
  );
  const activeStatuses = getCardActiveStatuses(card, isBoardCard);
  const statusMap = new Map(activeStatuses.map((st) => [st.id, st]));
  const renderedStatusIds = new Set();

  const skillCandidates = [];
  if (Array.isArray(card.skills)) {
    card.skills.forEach((sk) => {
      if (!sk) return;
      const id = typeof sk === 'string' ? sk : sk?.id;
      if (statusMap.has(id)) {
        if (!renderedStatusIds.has(id)) {
          skillCandidates.push(statusMap.get(id));
          renderedStatusIds.add(id);
        }
      } else {
        skillCandidates.push(typeof sk === 'string' ? { id: sk } : { ...sk });
      }
    });
  }

  // スロット外の直接プロパティ由来の状態（スタン・盤面加護等）を末尾に追加
  activeStatuses.forEach((st) => {
    if (!renderedStatusIds.has(st.id)) {
      skillCandidates.push(st);
      renderedStatusIds.add(st.id);
    }
  });

  const { choices: cardChoices, choices2: cardChoices2 } =
    resolveCardChoices(card);
  // 覇道スキルの選択肢はカード単位で不変のため、ループ外で一度だけ解決する
  const cardSupremacySkills = resolveCardSupremacySkills(card);

  let lookupId = String(card.baseId || card.id || '');
  let isPremiumActive = false;
  let isPremiumUnlocked = false;
  let isShineActive = false;

  // For Reward overlay, ignore premium unlock checks visually unless forced
  if (isRevealed) {
    if (card.isPremium !== undefined) {
      isPremiumActive = card.isPremium;
    } else if (card.owner === 'red') {
      isPremiumActive = false;
    } else {
      isPremiumActive = GameState.premiumCards?.includes(lookupId);
      isPremiumUnlocked = GameState.unlockedPremiumCards?.includes(lookupId);
    }

    if (card.isShine !== undefined) {
      isShineActive = card.isShine;
    } else if (card.owner === 'red') {
      isShineActive = false;
    } else {
      isShineActive = Boolean(
        GameState.shineCards && GameState.shineCards.includes(lookupId)
      );
    }
  }

  /**
   * カードのスキルタグ要素を安全にレンダリングする。
   *
   * @param {Object} c - 対象カードオブジェクト
   * @returns {JSX.Element|null} スキルタグ要素
   */
  const safeRenderSkillTag = (c) => {
    if (renderSkillTagReact) return renderSkillTagReact(c);
    if (window.renderSkillTag)
      return (
        <div
          dangerouslySetInnerHTML={{ __html: window.renderSkillTag(c, false) }}
        ></div>
      );
    return null;
  };

  // 各アイテム種別の実アセット比率に基づいたプレビュー領域の寸法定義
  // - プレイマット: 400x200 (2:1 比率)
  // - アイコン: 正方形 (1:1 比率)
  // - パック: packimg01.png 298x500 (155:260 = 約 0.596 比率)
  // - バトルパス / カード / スキン / チケット: 400x600・800x1200 (2:3 = 160:240 比率)
  const cardDims = styleProps.isPlaymat
    ? { width: 280, height: 140 }
    : styleProps.isIcon
      ? { width: 140, height: 140 }
      : styleProps.isPack
        ? { width: 155, height: 260 }
        : { width: 160, height: 240 };

  const hasPackCards = Boolean(styleProps?.packCardIds?.length > 0);

  /**
   * スキル説明文（文字列またはリンクセグメント配列）をJSX要素に変換して描画する。
   *
   * @param {string|Array<Object>} descContent - 説明文またはセグメント配列
   * @returns {React.ReactNode} レンダリングされた説明文要素
   */
  const renderDescContent = (descContent) => {
    if (Array.isArray(descContent)) {
      return descContent.map((seg, i) => {
        if (seg.type === 'link') {
          return (
            <span
              key={i}
              style={{
                color: '#38bdf8',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onLinkClick) onLinkClick(seg.targetId, seg);
              }}
            >
              {seg.value}
            </span>
          );
        }
        return <span key={i}>{seg.value}</span>;
      });
    }
    return descContent;
  };

  return (
    <>
      <div
        className={`preview-content ${styleProps.containerClass || ''}`}
        style={{
          margin: styleProps.margin,
          cursor: 'default',
          borderColor: styleProps.borderColor,
          boxShadow: styleProps.boxShadow,
          position: 'relative',
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div
          style={{
            padding: '20px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {styleProps.parentCard && (
            <button
              className="btn"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                padding: '5px 10px',
                fontSize: '0.8rem',
                zIndex: 20,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onParentBack) onParentBack();
              }}
            >
              ⬅ 戻る
            </button>
          )}
          <div
            style={{
              position: 'relative',
              width: `${cardDims.width}px`,
              height: `${cardDims.height}px`,
            }}
          >
            <div
              className={
                styleProps.isPlaymat ||
                styleProps.isIcon ||
                styleProps.isPack ||
                isBattlePass ||
                isShineTicket
                  ? ''
                  : `card blue${!isSkin ? rarityClass : ''}`
              }
              style={
                styleProps.isPack || isBattlePass || isShineTicket
                  ? {
                      width: `${cardDims.width}px`,
                      height: `${cardDims.height}px`,
                      position: 'relative',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: isBattlePass
                        ? '2px solid rgba(245, 158, 11, 0.6)'
                        : isShineTicket
                          ? '2px solid rgba(234, 179, 8, 0.6)'
                          : '2px solid rgba(250, 204, 21, 0.6)',
                      borderRadius: '8px',
                      boxShadow: isBattlePass
                        ? '0 4px 15px rgba(245, 158, 11, 0.3)'
                        : isShineTicket
                          ? '0 4px 15px rgba(234, 179, 8, 0.3)'
                          : '0 4px 15px rgba(250, 204, 21, 0.3)',
                      backgroundColor: '#0f172a',
                    }
                  : styleProps.isPlaymat
                    ? {
                        width: `${cardDims.width}px`,
                        height: `${cardDims.height}px`,
                        position: 'relative',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: '2px solid #38bdf8',
                        borderRadius: '8px',
                        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.6)',
                        backgroundColor: '#000',
                      }
                    : styleProps.isIcon
                      ? {
                          width: `${cardDims.width}px`,
                          height: `${cardDims.height}px`,
                          position: 'relative',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: 'none',
                          borderRadius: '50%',
                          boxShadow: 'none',
                          backgroundColor: '#0f172a',
                        }
                      : {
                          width: `${cardDims.width}px`,
                          height: `${cardDims.height}px`,
                          position: 'relative',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          backgroundColor: 'transparent',
                        }
              }
              onClick={(e) => {
                e.stopPropagation();
                if (isRevealed) {
                  setIsImageZoomedLocal(true);
                  playSound?.(SOUNDS?.seClick);
                  if (onImageZoom) onImageZoom();
                }
              }}
            >
              {isRevealed ? (
                <>
                  {isPack ? (
                    <div
                      className="card-bg"
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor: '#0f172a',
                      }}
                    >
                      <PackCoverImage
                        coverCardId={
                          styleProps.coverCardId || DEFAULT_PACK_COVER_CARD_ID
                        }
                        logoUrl={styleProps.logoUrl || card.logoUrl}
                      />
                    </div>
                  ) : isBattlePass ? (
                    <div
                      className="card-bg"
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor: '#0f172a',
                      }}
                    >
                      {imgUrl && (
                        <img
                          src={imgUrl}
                          alt={card.name}
                          decoding="sync"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center 15%',
                            filter: filter,
                            display: 'block',
                          }}
                        />
                      )}
                    </div>
                  ) : isShineTicket ? (
                    <div
                      className="card-bg"
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor: '#0f172a',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          background: 'rgba(234, 179, 8, 0.95)',
                          color: '#000000',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontWeight: 'bold',
                          fontSize: '0.7rem',
                          zIndex: 2,
                        }}
                      >
                        アイテム
                      </div>
                      <div
                        style={{
                          fontSize: '3.6rem',
                          marginBottom: '8px',
                          filter:
                            'drop-shadow(0 2px 10px rgba(234, 179, 8, 0.8))',
                          lineHeight: 1,
                          zIndex: 1,
                        }}
                      >
                        🌟
                      </div>
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          color: '#facc15',
                          marginBottom: '6px',
                          textShadow: '0 2px 6px rgba(0, 0, 0, 0.8)',
                          textAlign: 'center',
                          zIndex: 1,
                        }}
                      >
                        {styleProps.titleName ||
                          card.name ||
                          'シャインチケット'}
                      </div>
                      <CardShineOverlay />
                    </div>
                  ) : (
                    <div
                      className="card-bg"
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor:
                          styleProps.isPlaymat || styleProps.isIcon
                            ? '#0f172a'
                            : '',
                      }}
                    >
                      <img
                        src={imgUrl}
                        alt={card.name}
                        decoding="sync"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: isSkin
                            ? 'contain'
                            : styleProps.isPlaymat
                              ? 'cover'
                              : styleProps.isIcon
                                ? 'contain'
                                : 'cover',
                          objectPosition: isSkin
                            ? 'top center'
                            : styleProps.isPlaymat || styleProps.isIcon
                              ? 'center'
                              : 'center center',
                          filter: filter,
                          display: 'block',
                        }}
                      />
                    </div>
                  )}
                  {styleProps.isIcon && (
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
                  {isStandardCard && isShineActive && <CardShineOverlay />}
                  {isStandardCard && (
                    <div
                      className="card-power"
                      style={{ fontSize: '2.5rem', bottom: '0', right: '5px' }}
                    >
                      {card.currentPower !== undefined
                        ? card.currentPower
                        : card.power}
                    </div>
                  )}
                  {isStandardCard && safeRenderSkillTag(card)}
                  {isStandardCard &&
                    card.equippedCards &&
                    card.equippedCards.length > 0 && (
                      <div
                        className="card-skill-tag equip-badge"
                        style={{
                          position: 'absolute',
                          top: '-5px',
                          left: '-5px',
                          background: '#64748b',
                          color: '#fff',
                          borderColor: '#94a3b8',
                          transform: 'scale(0.9)',
                          zIndex: 10,
                        }}
                      >
                        ⚔️装備中
                      </div>
                    )}
                </>
              ) : (
                <div
                  className="card-bg"
                  style={{ background: '#334155' }}
                ></div>
              )}
            </div>
            {isRevealed &&
              isStandardCard &&
              card.equippedCards &&
              card.equippedCards.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: '0',
                    marginLeft: '15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    zIndex: 15,
                  }}
                >
                  {card.equippedCards.map((eqCard, idx) => {
                    const eqImgUrl = getCardImgUrl
                      ? getCardImgUrl(eqCard, true)
                      : '';
                    return (
                      <div
                        key={idx}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundImage: `url('${eqImgUrl}')`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          cursor: 'pointer',
                          border: '2px solid #94a3b8',
                          boxShadow: '0 0 5px rgba(0,0,0,0.5)',
                        }}
                        title={`装備：${eqCard.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onEquipClick) onEquipClick(eqCard);
                        }}
                      ></div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>

        <div className="preview-details">
          {showPremiumTag && isRevealed && (
            <div
              style={{
                background: 'linear-gradient(45deg, #d946ef, #9333ea)',
                color: 'white',
                padding: '2px 10px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                marginBottom: '5px',
                alignSelf: 'center',
                display: 'inline-block',
              }}
            >
              PREMIUM UNLOCK
            </div>
          )}
          <h2
            className={
              isRevealed && card.rarity === 4 && !isSkin ? 'rarity-4-text' : ''
            }
            style={{
              color: isRevealed ? nameColor : '#fff',
              marginTop: showPremiumTag ? '5px' : '0',
            }}
          >
            {isRevealed ? styleProps.titleName || card.name : '? ? ?'}
            {isRevealed && styleProps.displayType && (
              <span
                className="skip-rarity-text"
                style={{
                  color: '#3b82f6',
                  marginLeft: '5px',
                  WebkitBackgroundClip: 'border-box',
                  WebkitTextFillColor: 'initial',
                }}
              >
                ({styleProps.displayType})
              </span>
            )}
          </h2>

          <div className="preview-scroll-area">
            {isPack && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {/* パック説明文 */}
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#cbd5e1',
                    lineHeight: '1.5',
                    background: 'rgba(15, 23, 42, 0.4)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                  }}
                >
                  {styleProps.flavorOverride ||
                    styleProps.packDescription ||
                    card?.description ||
                    ''}
                </div>

                {/* 確率表記 */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(250, 204, 21, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: '#facc15',
                      marginBottom: '6px',
                    }}
                  >
                    排出確率
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        className="rarity-4-text"
                        style={{ fontWeight: 'bold' }}
                      >
                        ★4 レジェンド
                      </span>
                      <span>{legendPct}%</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#facc15', fontWeight: 'bold' }}>
                        ★3 ゴールド
                      </span>
                      <span>{goldPct}%</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>
                        ★2 シルバー
                      </span>
                      <span>{silverPct}%</span>
                    </div>
                  </div>
                </div>

                {/* 収録カード（x枚）横に虫眼鏡アイコン */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: '#e2e8f0',
                      fontWeight: 'bold',
                    }}
                  >
                    収録カード（
                    {styleProps.packCardCount ||
                      styleProps.packCardIds?.length ||
                      0}
                    種類）
                  </div>
                  <button
                    type="button"
                    aria-label="収録カード一覧を確認"
                    disabled={!hasPackCards}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid #38bdf8',
                      borderRadius: '6px',
                      color: '#38bdf8',
                      cursor: hasPackCards ? 'pointer' : 'not-allowed',
                      opacity: hasPackCards ? 1 : 0.4,
                      padding: '4px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      transition: 'all 0.2s ease',
                      userSelect: 'none',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!hasPackCards) return;
                      playSound?.(SOUNDS?.seClick);
                      // 収録カードIDが1件以上ある場合のみ一覧モーダルを開く
                      if (
                        window.showEnemyDeckModal &&
                        styleProps.packCardIds?.length > 0
                      ) {
                        window.showEnemyDeckModal(
                          styleProps.packCardIds,
                          `${styleProps.titleName || card?.name || 'パック'} 収録カード`,
                          null,
                          {
                            isPlayerDeck: true,
                            zIndex: 4500,
                            hideCount: true,
                            hideLeaderSkill: true,
                          }
                        );
                      }
                    }}
                  >
                    🔍
                  </button>
                </div>
              </div>
            )}
            {isBattlePass && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {/* パック説明文と統一された枠内説明 */}
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#cbd5e1',
                    lineHeight: '1.5',
                    background: 'rgba(15, 23, 42, 0.4)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {styleProps.flavorOverride ||
                    card?.flavor ||
                    card?.description ||
                    'クイックマッチで勝利してポイントを貯め、様々な報酬を獲得できるバトルパス。'}
                </div>

                {/* パス情報 */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: '#f59e0b',
                      marginBottom: '6px',
                    }}
                  >
                    バトルパス特典
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>
                        最大レベル
                      </span>
                      <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                        {card?.levels?.length
                          ? `Lv.${card.levels.length}`
                          : 'Lv.15'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 遊び方 */}
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    lineHeight: '1.4',
                  }}
                >
                  クイックマッチで勝利することでパスポイントが蓄積され、各レベルの限定報酬が解放されます。
                </div>
              </div>
            )}
            {isShineTicket && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {/* パック説明文と統一された枠内説明 */}
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: '#cbd5e1',
                    lineHeight: '1.5',
                    background: 'rgba(15, 23, 42, 0.4)',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(148, 163, 184, 0.1)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {styleProps.flavorOverride ||
                    card?.flavor ||
                    card?.description ||
                    'カード一覧画面またはデッキ編集画面から、お好きなカードをシャイン化（ホログラム加工）できる専用チケット。'}
                </div>

                {/* アイテム情報 */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: '#facc15',
                      marginBottom: '6px',
                    }}
                  >
                    アイテム情報
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#cbd5e1',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>
                        現在所持数
                      </span>
                      <span style={{ color: '#facc15', fontWeight: 'bold' }}>
                        {getShineTicketsCount()} 枚
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>
                        交換レート
                      </span>
                      <span>共通 10 Pt</span>
                    </div>
                  </div>
                </div>

                {/* 使い方 */}
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    lineHeight: '1.4',
                  }}
                >
                  カード一覧画面またはデッキ編集画面で、各カードの「🌟」アイコンをクリックすることでチケットを1枚消費してシャイン加工を解放できます。
                </div>
              </div>
            )}
            {isStandardCard && (
              <div className="preview-skills-list">
                {!isRevealed ? (
                  <p className="preview-skill-desc">クリックしてカードを公開</p>
                ) : skillCandidates.length > 0 ? (
                  skillCandidates.map((sk, idx) => {
                    // 状態エントリ（isStatus: true または STATUSES に定義されている）の描画
                    const statusDef = STATUSES?.[sk.id];
                    if (sk.isStatus || statusDef) {
                      const def = statusDef || STATUSES[sk.id];
                      if (!def) return null;
                      const val =
                        def.id === 'valkyria_guard' &&
                        (!sk.value || sk.value === 1) &&
                        !card.valkyriaGuardTurns
                          ? ''
                          : sk.value !== null && sk.value !== undefined
                            ? sk.value
                            : '';
                      const desc =
                        typeof def.desc === 'function'
                          ? def.desc(sk.value)
                          : def.desc;
                      const badgeClass = def.badgeClass || '';

                      return (
                        <div key={idx} className="preview-skill-item">
                          <div className={`preview-skill-badge ${badgeClass}`}>
                            {def.icon ? `${def.icon} ` : ''}
                            {def.name}
                            {val}
                          </div>
                          <p className="preview-skill-desc">
                            {renderDescContent(desc)}
                          </p>
                        </div>
                      );
                    }

                    const s = SKILLS?.[sk.id];
                    if (!s) return null;
                    const val =
                      sk.value === null || sk.value === undefined
                        ? ''
                        : sk.value;
                    const desc =
                      typeof s.desc === 'function'
                        ? s.desc(sk.value, sk)
                        : s.desc;

                    const isAccordionSkill =
                      sk.id === 'choice' ||
                      sk.id === 'force' ||
                      sk.id === 'supremacy';

                    const targetChoices =
                      sk.id === 'supremacy'
                        ? cardSupremacySkills
                        : sk.choiceGroup === 2
                          ? cardChoices2
                          : cardChoices;

                    if (
                      isAccordionSkill &&
                      Array.isArray(targetChoices) &&
                      targetChoices.length > 0
                    ) {
                      return (
                        <div key={idx} className="preview-skill-item">
                          <details
                            className="choice-accordion"
                            style={{ width: '100%' }}
                          >
                            <summary
                              style={{
                                listStyle: 'none',
                                cursor: 'pointer',
                                outline: 'none',
                                width: '100%',
                              }}
                            >
                              <div
                                className="preview-skill-badge"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '10px',
                                  width: '110px',
                                  position: 'relative',
                                  margin: '0 auto',
                                }}
                              >
                                <span>
                                  {s.icon} {s.name}
                                  {val}
                                </span>
                                <span
                                  className="accordion-icon"
                                  style={{
                                    fontSize: '0.8rem',
                                    transition: 'transform 0.2s',
                                    position: 'absolute',
                                    right: '8px',
                                  }}
                                >
                                  ▼
                                </span>
                              </div>
                              <p
                                className="preview-skill-desc"
                                style={{
                                  marginTop: '6px',
                                  marginBottom: '8px',
                                  color: '#f8fafc',
                                  textAlign: 'center',
                                }}
                              >
                                {renderDescContent(desc)}
                              </p>
                            </summary>
                            <div
                              className="accordion-content"
                              style={{ marginTop: '5px' }}
                            >
                              {targetChoices.map((cho, cIdx) => {
                                const cs = SKILLS?.[cho.id];
                                if (!cs) return null;
                                const cDesc =
                                  typeof cs.desc === 'function'
                                    ? cs.desc(cho.value, cho)
                                    : cs.desc;
                                return (
                                  <div
                                    key={cIdx}
                                    style={{
                                      marginLeft: '10px',
                                      borderLeft: '2px solid #475569',
                                      paddingLeft: '10px',
                                      marginTop: '8px',
                                      marginBottom: '8px',
                                    }}
                                  >
                                    <div
                                      className="preview-skill-badge"
                                      style={{
                                        background: 'rgba(148, 163, 184, 0.2)',
                                        borderColor: '#94a3b8',
                                        color: '#94a3b8',
                                        fontSize: '0.75rem',
                                      }}
                                    >
                                      {(() => {
                                        const cInfo = getSkillBadgeInfo(cho);
                                        return `${cInfo.icon} ${cInfo.fullName}`;
                                      })()}
                                    </div>
                                    <p
                                      className="preview-skill-desc"
                                      style={{
                                        fontSize: '0.8rem',
                                        color: '#94a3b8',
                                        margin: '4px 0 0 0',
                                      }}
                                    >
                                      {renderDescContent(cDesc)}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        </div>
                      );
                    }

                    const badgeInfo = getSkillBadgeInfo(sk);

                    return (
                      <div key={idx} className="preview-skill-item">
                        <div className="preview-skill-badge">
                          {badgeInfo.icon} {badgeInfo.fullName}
                        </div>
                        <p className="preview-skill-desc">
                          {renderDescContent(desc)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="preview-skill-desc">能力なし</p>
                )}
              </div>
            )}
            {isRevealed && !isPack && !isBattlePass && !isShineTicket && (
              <p className="preview-flavor-text" style={{ display: 'block' }}>
                {styleProps.flavorOverride || card.flavor || '...'}
              </p>
            )}
            {isRevealed && styleProps.fromCardList && (
              <p
                className="preview-obtain-info"
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  color: '#eab308',
                  marginTop: '10px',
                  padding: '6px 10px',
                  background: 'rgba(234, 179, 8, 0.08)',
                  borderRadius: '4px',
                  borderLeft: '3px solid #eab308',
                  textAlign: 'left',
                  lineHeight: '1.4',
                }}
              >
                <strong style={{ color: '#facc15' }}>入手方法：</strong>{' '}
                {getObtainMethodsText(card.obtain, card.isToken)}
              </p>
            )}
          </div>

          {/* User Custom Override Actions */}
          {customActionSlot}

          {/* Preview Modal Actions */}
          {styleProps.showPreviewActions &&
            isRevealed &&
            isStandardCard &&
            card.owner !== 'red' && (
              <button
                className="btn"
                style={{
                  marginTop: '10px',
                  width: '100%',
                  flexShrink: 0,
                  background: isShineActive
                    ? 'linear-gradient(45deg, #eab308, #ca8a04)'
                    : '#475569',
                  fontSize: '0.9rem',
                  padding: '10px 5px',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onToggleShine) onToggleShine(card.id);
                }}
              >
                {isShineActive ? '🌟 シャインON' : '🌟 シャインOFF'}
              </button>
            )}
          {styleProps.showPreviewActions &&
            isRevealed &&
            isPremiumUnlocked &&
            card.owner !== 'red' && (
              <button
                className="btn"
                style={{
                  marginTop: '10px',
                  width: '100%',
                  flexShrink: 0,
                  background: isPremiumActive
                    ? 'linear-gradient(45deg, #d946ef, #9333ea)'
                    : '#475569',
                  fontSize: '0.9rem',
                  padding: '10px 5px',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTogglePremium) onTogglePremium(card.id);
                }}
              >
                {isPremiumActive ? '✨ プレミアムON' : '✨ プレミアムOFF'}
              </button>
            )}
          {styleProps.showPreviewActions && (
            <button
              className="btn"
              style={{ marginTop: '15px', width: '100%', flexShrink: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                if (onClosePreview) onClosePreview();
              }}
            >
              閉じる
            </button>
          )}

          {/* Acquisition Action */}
          {styleProps.showAcquisitionOk && (
            <button
              className="btn ok-button"
              style={{
                marginTop: '15px',
                width: '110px',
                alignSelf: 'center',
                background:
                  styleProps.okBg || 'linear-gradient(45deg, #facc15, #eab308)',
                color: styleProps.okColor || '#000',
                fontWeight: 'bold',
                pointerEvents: styleProps.canClose ? 'auto' : 'none',
                opacity: styleProps.canClose ? 1 : 0.5,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onAcquisitionOk) onAcquisitionOk();
              }}
            >
              OK
            </button>
          )}

          {/* Exchange Action */}
          {styleProps.showExchangeActions &&
            styleProps.exchangeData &&
            isRevealed && (
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  width: '100%',
                  marginTop: '10px',
                  flexShrink: 0,
                }}
              >
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    minHeight: '40px',
                    padding: '5px',
                    background: '#475569',
                    marginTop: 0,
                    fontSize: '0.9rem',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onExchangeBack) onExchangeBack();
                  }}
                >
                  戻る
                </button>
                <button
                  className="btn"
                  disabled={
                    styleProps.exchangeData.isMaxed ||
                    !styleProps.exchangeData.canExchange
                  }
                  style={{
                    flex: 1,
                    minHeight: '40px',
                    padding: '5px',
                    background:
                      styleProps.exchangeData.isMaxed ||
                      !styleProps.exchangeData.canExchange
                        ? '#475569'
                        : 'linear-gradient(45deg, #f97316, #ea580c)',
                    color:
                      styleProps.exchangeData.isMaxed ||
                      !styleProps.exchangeData.canExchange
                        ? '#94a3b8'
                        : '#ffffff',
                    marginTop: 0,
                    fontSize: '0.9rem',
                    textTransform: 'none',
                    cursor:
                      styleProps.exchangeData.isMaxed ||
                      !styleProps.exchangeData.canExchange
                        ? 'not-allowed'
                        : 'pointer',
                    opacity: styleProps.exchangeData.isMaxed ? 0.5 : 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onExchangeConfirm)
                      onExchangeConfirm(styleProps.exchangeData);
                  }}
                >
                  {styleProps.exchangeData.isMaxed
                    ? '交換済み'
                    : `交換 ${styleProps.exchangeData.cost} pt`}
                </button>
              </div>
            )}
        </div>

        {!isRevealed && onRevealAreaClick && (
          <div
            id="reward-mask"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(15, 23, 42, 0.95)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRevealAreaClick();
            }}
          >
            <h2
              className="reward-title"
              style={{
                marginBottom: '20px',
                color: '#facc15',
                textShadow: '0 0 10px rgba(250, 204, 21, 0.5)',
              }}
            >
              カードを獲得！
            </h2>
            <div style={{ fontSize: '5rem', color: '#334155' }}>?</div>
            <div
              style={{
                fontSize: '1rem',
                color: '#cbd5e1',
                marginTop: '15px',
                animation: 'pulse 1.5s infinite',
              }}
            >
              タップして表を開く
            </div>
          </div>
        )}
      </div>

      {isImageZoomedLocal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.9)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsImageZoomedLocal(false);
            playSound?.(SOUNDS?.seClick);
          }}
        >
          {isPack ? (
            <div
              style={{
                width: 'min(85vw, calc(85dvh * 298 / 500))',
                height: 'min(85dvh, calc(85vw * 500 / 298))',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                filter: 'drop-shadow(0 0 30px rgba(0,0,0,0.9))',
              }}
            >
              <PackCoverImage
                coverCardId={
                  styleProps.coverCardId || DEFAULT_PACK_COVER_CARD_ID
                }
                logoUrl={styleProps.logoUrl || card.logoUrl}
              />
            </div>
          ) : (
            <div
              style={{
                position: 'relative',
                display: 'inline-block',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              <img
                src={imgUrl}
                decoding="sync"
                style={{
                  width: 'min(95vw, calc(95dvh * 2 / 3))',
                  height: 'min(95dvh, calc(95vw * 3 / 2))',
                  objectFit: 'contain',
                  borderRadius: '12px',
                  boxShadow: '0 0 40px rgba(0,0,0,0.8)',
                  backgroundColor: isSkin ? 'transparent' : '#000',
                  display: 'block',
                }}
                alt="Enlarged"
              />
              {isStandardCard && isShineActive && <CardShineOverlay />}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default CardPreviewContent;
