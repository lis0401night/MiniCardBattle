import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { filterDiscardSelectionSubmit } from '../game/tutorialEngine.js';
import {
  renderDeckEdit,
  saveDeck,
  submitDefenseDeck,
} from '../services/deck.js';
import {
  openCardPreview,
  renderCardList,
  setCloseCardPreviewHook,
  setOpenCardPreviewHook,
  setShowCardAcquisitionModalHook,
  setShowCharacterAcquisitionModalHook,
  setShowIconAcquisitionModalHook,
  setShowPlaymatAcquisitionModalHook,
  setShowPremiumAcquisitionModalHook,
  setShowSkinAcquisitionModalHook,
  setShowStageAcquisitionModalHook,
} from '../services/uiGallery.js';
import {
  backupDataToXML,
  confirmCharSelect,
  importDataFromXML,
  reloadGame,
  setCloseEnemyDeckModalHook,
} from '../services/uiMainCore.js';
import {
  setShowAlertModalHook,
  setShowConfirmModalHook,
  setShowErrorModalHook,
  setShowPointAcquisitionModalHook,
  setShowProfileModalHook,
  showAlertModal,
} from '../services/uiModals.js';
import { GameState, saveUserProfile } from '../state/gameState.js';
import {
  appendVersionQuery,
  DEFAULT_PLAYER_ICON,
  DEFAULT_PLAYER_NAME,
  OWNED_PLAYMATS_KEY,
  PROFILE_NAME_KEY,
} from '../utils/constants/config.js';

import { AVAILABLE_ICONS, EXTRA_ICONS } from '../utils/constants/avatars.js';
import { STAGES, getStageImgUrl } from '../utils/constants/stages.js';

import { saveDungeonProgress } from '../game/battleDungeon.js';
import { syncUserProfile } from '../utils/apiUtils.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import {
  BOSS_CHARACTER_IDS,
  canShowUnlockableCharacter,
  CHARACTERS,
  getIconFramePath,
  getPlayerIconPath,
  getSkinImage,
} from '../utils/constants/characters.js';
import {
  ownedPlaymats,
  PLAYMAT_MASTER,
  getPlaymatImgUrl,
} from '../utils/constants/playmats.js';
import { SKILLS } from '../utils/constants/skills.js';
import {
  getCardImgUrl,
  getOrCreateUUID,
  playSound,
  resolvePlayerName,
  safeParseArrayOrNull,
  stopAllBGM,
  togglePremiumCard,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import CardPreviewContent from './common/CardPreviewContent.jsx';

const EXCHANGE_DISPLAY_TYPE_LABELS = {
  playmat: 'プレイマット',
  icon: 'アイコン',
  premium: 'プレミアム',
  skin: 'スキン',
};

// ============================================================
// ヘルパー関数定義
// ============================================================

/**
 * スキンIDから画像パスを解決するヘルパー関数
 * @param {string} id - スキンID (例: 'android_summer', 'summer')
 * @returns {string} 画像パス
 */
function resolveSkinImageById(id) {
  if (typeof id !== 'string' || !id) return '';

  let img = '';
  if (CHARACTERS) {
    for (const charKey in CHARACTERS) {
      const char = CHARACTERS[charKey];
      if (!char || !char.skins) continue;

      // 1. スキンキー直接一致
      if (char.skins[id]) {
        img = getSkinImage(char, id, 'image');
        if (img) break;
      }

      // 2. 'charId_skinKey' 形式のプレフィックス除去一致
      if (id.startsWith(charKey + '_')) {
        const skinKey = id.slice(charKey.length + 1);
        if (char.skins[skinKey]) {
          img = getSkinImage(char, skinKey, 'image');
          if (img) break;
        }
      }

      // 3. 各スキンオブジェクトの id プロパティ照合
      for (const sKey in char.skins) {
        const skinObj = char.skins[sKey];
        if (skinObj && (skinObj.id === id || sKey === id)) {
          img = getSkinImage(char, sKey, 'image');
          if (img) break;
        }
      }
      if (img) break;
    }
  }

  // フォールバック: baseId (charId) の画像またはデフォルト画像にフォールバック
  if (!img) {
    const baseCharId =
      typeof id === 'string' && id.includes('_') ? id.split('_')[0] : id;
    if (CHARACTERS[baseCharId]?.image) {
      img = CHARACTERS[baseCharId].image;
    } else {
      img = CHARACTERS.android?.image || 'assets/characters/char_android.webp';
    }
  }
  return appendVersionQuery(img);
}

/**
 * お気に入りカード選択一覧における対象カードのプレミアム状態を判定するヘルパー関数
 */
function determineIsCardPremium(
  cardId,
  hasPremiumUnlocked,
  favCardPremiumMap,
  favoriteCardState,
  globalPremiumCards
) {
  // プレミアムが解禁されていないカードは常に通常版 (false)
  if (!hasPremiumUnlocked) return false;

  // モーダル内でユーザーが手動切り替えした状態があれば最優先
  if (favCardPremiumMap && favCardPremiumMap[cardId] !== undefined) {
    return !!favCardPremiumMap[cardId];
  }

  // 現在選択中のお気に入りカードの設定状態
  if (favoriteCardState?.cardId === cardId) {
    return !!favoriteCardState?.isPremium;
  }

  // グローバルのデッキ/所持プレミアムカード設定を参照
  return (globalPremiumCards || []).includes(cardId);
}

/**
 * favorite_card / favoriteCard のキー表記揺れや文字列/オブジェクト形式を統一オブジェクト { cardId, isPremium } に正規化するヘルパー関数
 */
function normalizeFavoriteCard(input) {
  if (!input) return null;

  let raw = input;
  if (typeof input === 'object') {
    if (input.favoriteCard !== undefined) {
      raw = input.favoriteCard;
    } else if (input.favorite_card !== undefined) {
      raw = input.favorite_card;
    }
  }

  if (!raw) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        return { cardId: trimmed, isPremium: false };
      }
    } else {
      return { cardId: trimmed, isPremium: false };
    }
  }

  if (typeof raw === 'object' && raw !== null) {
    const cardId = raw.cardId || raw.card_id || raw.id;
    if (!cardId) return null;
    return {
      cardId: String(cardId),
      isPremium: !!(raw.isPremium || raw.is_premium),
    };
  }

  return null;
}

/**
 * プロフィール画面でのお気に入りカード表示用コンポーネント (DRY共通化)
 */
function FavoriteCardDisplay({
  favoriteCard,
  onClick,
  placeholderText = 'お気に入りカード未設定',
}) {
  const fav = normalizeFavoriteCard(favoriteCard);
  if (fav && fav.cardId) {
    const masterCard = (CARD_MASTER || []).find((c) => c.id === fav.cardId);
    const rarityClass = masterCard?.rarity
      ? ` rarity-${masterCard.rarity}`
      : '';
    const isPremium = !!fav.isPremium;

    return (
      <div
        className="deck-card-item"
        style={{
          width: '140px',
          height: '210px',
          position: 'relative',
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={onClick}
      >
        <div
          className={`card blue${rarityClass}`}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          <img
            className="card-bg"
            src={getCardImgUrl({
              id: fav.cardId,
              isPremium: isPremium,
            })}
            alt="Favorite Card"
            style={{
              objectFit: 'cover',
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '140px',
        height: '210px',
        border: '2px dashed rgba(255, 255, 255, 0.3)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontSize: '0.85rem',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: 'center',
        padding: '10px',
        boxSizing: 'border-box',
      }}
      onClick={onClick}
    >
      {placeholderText}
    </div>
  );
}

// お気に入りカード選択グリッドのレイアウト定数（計算とスタイルの単一情報源）
const FAV_GRID_COLS = 3;
const FAV_GRID_GAP_PX = 15;
const FAV_GRID_PADDING_PX = 5;
const FAV_CARD_ASPECT_RATIO = 1.5;

/**
 * お気に入りカード選択モーダルコンポーネント
 * @tanstack/react-virtual によるグリッド仮想スクロールとサムネイル画像で超高速・省メモリ表示
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - モーダルが開いているか
 * @param {Function} props.onClose - モーダルを閉じるコールバック
 * @param {Object|null} props.favoriteCardState - 現在選択中のお気に入りカード情報
 * @param {Function} props.setFavoriteCardState - お気に入りカード更新関数
 * @param {Array<Object>} props.ownedMasterCards - プレイヤー所持カード配列
 * @param {Object} props.favCardPremiumMap - プレミアム表示状態マップ
 * @param {Function} props.setFavCardPremiumMap - プレミアム表示状態更新関数
 * @returns {JSX.Element|null}
 */
function FavoriteCardSelectionModal({
  isOpen,
  onClose,
  favoriteCardState,
  setFavoriteCardState,
  ownedMasterCards,
  favCardPremiumMap,
  setFavCardPremiumMap,
}) {
  const listContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(380);

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
  }, [isOpen]);

  // 全アイテム配列（先頭に未設定枠）
  const allItems = useMemo(() => {
    return [{ id: 'none', isNone: true }, ...(ownedMasterCards || [])];
  }, [ownedMasterCards]);

  // 3列ごとに行配列へ分割
  const itemRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < allItems.length; i += FAV_GRID_COLS) {
      rows.push(allItems.slice(i, i + FAV_GRID_COLS));
    }
    return rows;
  }, [allItems]);

  // 3列表示用の正確な1行高さを事前計算
  const estimatedRowHeight = useMemo(() => {
    const innerWidth = Math.max(0, containerWidth - FAV_GRID_PADDING_PX * 2);
    const cardWidthPx = Math.max(
      0,
      (innerWidth - FAV_GRID_GAP_PX * (FAV_GRID_COLS - 1)) / FAV_GRID_COLS
    );
    return cardWidthPx > 0 ? cardWidthPx * FAV_CARD_ASPECT_RATIO : 180;
  }, [containerWidth]);

  // @tanstack/react-virtual による行単位仮想化
  const rowVirtualizer = useVirtualizer({
    count: itemRows.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    gap: FAV_GRID_GAP_PX,
    overscan: 4,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, containerWidth, estimatedRowHeight]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 2100, display: 'flex' }}
      onClick={onClose}
    >
      <div
        className="skill-modal-box modal-pop-animation"
        style={{
          width: '95%',
          maxWidth: '440px',
          padding: '20px',
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          background: '#1e293b',
          borderRadius: '16px',
          border: '2px solid #334155',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: '#eab308',
            margin: '0 0 15px 0',
            fontSize: '1.15rem',
            textAlign: 'center',
          }}
        >
          お気に入りカード選択
        </h3>

        {/* 仮想化カード一覧グリッド */}
        <div
          ref={listContainerRef}
          className="card-list-container"
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '380px',
            padding: `${FAV_GRID_PADDING_PX}px`,
            position: 'relative',
          }}
        >
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
                    gridTemplateColumns: `repeat(${FAV_GRID_COLS}, 1fr)`,
                    gap: `${FAV_GRID_GAP_PX}px`,
                  }}
                >
                  {row.map((item) => {
                    if (item.isNone) {
                      const isNoneSelected =
                        !favoriteCardState || !favoriteCardState.cardId;
                      return (
                        <div
                          key="none"
                          className="deck-card-item gallery-card-wrapper"
                          style={{
                            position: 'relative',
                            cursor: 'pointer',
                            borderRadius: '8px',
                            border: isNoneSelected
                              ? '3px solid #eab308'
                              : 'none',
                            boxShadow: isNoneSelected
                              ? '0 0 12px #eab308'
                              : 'none',
                            transform: isNoneSelected ? 'scale(1.03)' : 'none',
                            transition: 'transform 0.15s',
                          }}
                          onClick={() => {
                            playSound?.(SOUNDS?.seClick);
                            setFavoriteCardState(null);
                            onClose();
                          }}
                        >
                          <div
                            className="card blue"
                            style={{
                              background: 'rgba(15, 23, 42, 0.85)',
                              position: 'relative',
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                color: '#cbd5e1',
                                textAlign: 'center',
                                width: '100%',
                                lineHeight: '1',
                                margin: 0,
                                padding: 0,
                                pointerEvents: 'none',
                              }}
                            >
                              未設定
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const card = item;
                    const unlockedPremiumList =
                      GameState.unlockedPremiumCards || [];
                    const hasPremiumUnlocked = unlockedPremiumList.includes(
                      card.id
                    );

                    const isCardPremium = determineIsCardPremium(
                      card.id,
                      hasPremiumUnlocked,
                      favCardPremiumMap,
                      favoriteCardState,
                      GameState.premiumCards
                    );

                    const isSelected =
                      favoriteCardState?.cardId === card.id &&
                      !!favoriteCardState?.isPremium === isCardPremium;

                    const rarityClass = card.rarity
                      ? ` rarity-${card.rarity}`
                      : '';

                    return (
                      <div
                        key={card.id}
                        className="deck-card-item gallery-card-wrapper"
                        style={{
                          position: 'relative',
                          cursor: 'pointer',
                          borderRadius: '8px',
                          border: isSelected ? '3px solid #eab308' : 'none',
                          boxShadow: isSelected ? '0 0 12px #eab308' : 'none',
                          transform: isSelected ? 'scale(1.03)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                        onClick={() => {
                          playSound?.(SOUNDS?.seClick);
                          setFavoriteCardState({
                            cardId: card.id,
                            isPremium: isCardPremium,
                          });
                          onClose();
                        }}
                      >
                        <div className={`card blue${rarityClass}`}>
                          <img
                            className="card-bg"
                            src={getCardImgUrl(
                              {
                                ...card,
                                isPremium: isCardPremium,
                              },
                              true
                            )}
                            alt={card.name}
                            style={{
                              objectFit: 'cover',
                              width: '100%',
                              height: '100%',
                            }}
                          />

                          {hasPremiumUnlocked && (
                            <div
                              className="premium-toggle-icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                playSound?.(SOUNDS?.seClick);
                                const nextPremium = !isCardPremium;
                                setFavCardPremiumMap((prev) => ({
                                  ...prev,
                                  [card.id]: nextPremium,
                                }));
                                if (favoriteCardState?.cardId === card.id) {
                                  setFavoriteCardState({
                                    cardId: card.id,
                                    isPremium: nextPremium,
                                  });
                                }
                              }}
                              style={{
                                position: 'absolute',
                                top: '4px',
                                left: '4px',
                                background: 'rgba(0,0,0,0.85)',
                                color: isCardPremium ? '#d946ef' : '#94a3b8',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                fontSize: '0.8rem',
                                zIndex: 7,
                                border: `1px solid ${isCardPremium ? '#d946ef' : '#475569'}`,
                                cursor: 'pointer',
                              }}
                              title={
                                isCardPremium
                                  ? '通常版に切り替え'
                                  : 'プレミアム版に切り替え'
                              }
                            >
                              ✨
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            marginTop: '15px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            className="btn"
            style={{ background: '#475569', margin: 0 }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              onClose();
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

// 共通の獲得モーダルコンポーネント
function AcquisitionModal({
  title,
  borderColor,
  shadowColor,
  imageSrc,
  imageStyle,
  itemName,
  itemTypeName, // 'プレイマット', 'スキン', 'アイコン' などの日本語名
  btnBg,
  btnColor,
  canClose,
  onClose,
  isIcon,
}) {
  return (
    <div
      style={{
        background: 'var(--panel-bg, #1e293b)',
        border: `2px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '20px',
        width: '90%',
        maxWidth: '400px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: `0 0 30px ${shadowColor}`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 style={{ color: borderColor, marginBottom: '20px' }}>{title}</h2>
      <div style={{ position: 'relative', ...imageStyle }}>
        <img
          src={imageSrc}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          alt={itemTypeName}
        />
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
      </div>
      <p
        style={{
          color: '#fff',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          textAlign: 'center',
          marginBottom: '25px',
        }}
      >
        {itemTypeName}「{itemName}」を入手しました！
      </p>
      <button
        className="btn ok-button"
        style={{
          background: btnBg,
          color: btnColor,
          fontWeight: 'bold',
          width: '110px',
          alignSelf: 'center',
          margin: 0,
          pointerEvents: canClose ? 'auto' : 'none',
          opacity: canClose ? 1 : 0.5,
        }}
        onClick={() => {
          playSound?.(SOUNDS?.seClick);
          onClose();
        }}
      >
        OK
      </button>
    </div>
  );
}

const syncPlayerConfigImages = (charDetailData, skinId) => {
  if (
    GameState.playerConfig &&
    GameState.playerConfig.id === charDetailData.id
  ) {
    const charObj =
      Object.values(CHARACTERS || {}).find((c) => c.id === charDetailData.id) ||
      charDetailData;
    GameState.playerConfig.image =
      getSkinImage(charObj, skinId, 'image') || charObj.image;
    GameState.playerConfig.imageLose =
      getSkinImage(charObj, skinId, 'imageLose') ||
      charObj.imageLose ||
      charObj.image;
    GameState.playerConfig.icon =
      getSkinImage(charObj, skinId, 'icon') || charObj.icon;
    GameState.playerConfig.iconDamage =
      getSkinImage(charObj, skinId, 'iconDamage') ||
      charObj.iconDamage ||
      charObj.icon;
  }
};

export default function GlobalModals({ rulesVisible, setRulesVisible }) {
  const discardLongPressTimerRef = useRef(null);
  const discardHasLongPressedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (discardLongPressTimerRef.current) {
        clearTimeout(discardLongPressTimerRef.current);
      }
    };
  }, []);

  const [confirmData, setConfirmData] = useState(null);
  const [errorData, setErrorData] = useState(null);
  const [enemyDeckData, setEnemyDeckData] = useState(null);
  const [cardPreviewData, setCardPreviewData] = useState(null);
  const [acquisitionData, setAcquisitionData] = useState(null); // card, premium, playmat
  const [pointAcquisitionData, setPointAcquisitionData] = useState(null);
  const [charDetailData, setCharDetailData] = useState(null);
  const [syncDataVisible, setSyncDataVisible] = useState(false);
  const [playerNameVisible, setPlayerNameVisible] = useState(false);
  const [playerNameCallback, setPlayerNameCallback] = useState(null);
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [playmatSelectionVisible, setPlaymatSelectionVisible] = useState(false);
  const [selectedPlaymatState, setSelectedPlaymatState] = useState(null);
  const [skillConfirmData, setSkillConfirmData] = useState(null);
  const [skillChoiceData, setSkillChoiceData] = useState(null);
  const [discardSelectionData, setDiscardSelectionData] = useState(null);
  const [skinSelectionVisible, setSkinSelectionVisible] = useState(false);
  const [leaderSelectVisible, setLeaderSelectVisible] = useState(false);
  const [selectedSkinState, setSelectedSkinState] = useState(null);
  const [simpleImagePreview, setSimpleImagePreview] = useState(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileIconInput, setProfileIconInput] = useState('');
  const [favoriteCardState, setFavoriteCardState] = useState(null);
  const [iconSelectModalOpen, setIconSelectModalOpen] = useState(false);
  const [favCardModalOpen, setFavCardModalOpen] = useState(false);
  const [favCardPremiumMap, setFavCardPremiumMap] = useState({});
  const [viewProfileData, setViewProfileData] = useState(null);

  const ownedMasterCards = useMemo(() => {
    const inventory = GameState.playerInventory || {};
    const hasInventoryData = Object.keys(inventory).length > 0;
    return (CARD_MASTER || []).filter((c) => {
      if (c.isToken) return false;
      if (!hasInventoryData) return true;
      return (inventory[c.id] || 0) > 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favCardModalOpen, profileModalVisible]);

  const handleCloseCardPreview = (e) => {
    if (e && e.target.classList.contains('preview-content')) return;
    playSound?.(SOUNDS?.seClick);
    setCardPreviewData(null);
  };

  const closeEnemyDeckModal = () => {
    playSound?.(SOUNDS?.seClick);
    setEnemyDeckData(null);
  };

  useEffect(() => {
    setShowConfirmModalHook((message, onConfirm, onCancel, isAlert = false) => {
      playSound?.(SOUNDS?.seClick);
      setConfirmData({ message, onConfirm, onCancel, isAlert });
    });

    setShowAlertModalHook((message, onClose) => {
      playSound?.(SOUNDS?.seClick);
      setConfirmData({
        message,
        onConfirm: onClose,
        onCancel: null,
        isAlert: true,
      });
    });

    setShowErrorModalHook((message) => {
      if (typeof stopAllBGM === 'function') stopAllBGM();
      setErrorData({ message });
    });

    setShowPointAcquisitionModalHook((data) => {
      playSound?.(SOUNDS?.seGet); // 獲得時の効果音（仮にseGetとするか、seSkill等）
      setPointAcquisitionData(data);
    });

    setShowProfileModalHook(() => {
      playSound?.(SOUNDS?.seClick);
      setProfileNameInput(GameState.userProfile?.name || DEFAULT_PLAYER_NAME);
      setProfileIconInput(GameState.userProfile?.icon || DEFAULT_PLAYER_ICON);
      setFavoriteCardState(GameState.userProfile?.favoriteCard || null);
      // プロフィール編集モーダルオープン時にお気に入りカードのプレミアム一時表示マップをリセット
      setFavCardPremiumMap({});
      setProfileModalVisible(true);
    });

    window.showPlayerProfileModal = (playerData) => {
      playSound?.(SOUNDS?.seClick);
      setViewProfileData(playerData || null);
    };

    window.showEnemyDeckModal = (
      deck,
      title,
      leaderSkill = null,
      extraOpts = {}
    ) => {
      playSound?.(SOUNDS?.seClick);
      setEnemyDeckData({
        deck: deck || [],
        title: title || '敵デッキ確認',
        leaderSkill,
        premiumCards: extraOpts.premiumCards || extraOpts.premium || [],
        isPlayerDeck: !!extraOpts.isPlayerDeck,
      });
    };

    setCloseEnemyDeckModalHook(closeEnemyDeckModal);

    setOpenCardPreviewHook((card, styleProps = {}) => {
      playSound?.(SOUNDS?.seClick);
      setCardPreviewData({
        card,
        styleProps: { ...styleProps, showPreviewActions: true },
      });
    });

    setCloseCardPreviewHook(handleCloseCardPreview);

    const triggerCloseTimer = (type, uniqueId) => {
      setTimeout(() => {
        setAcquisitionData((prev) => {
          if (!prev) return null;
          let currentId;
          if (prev.type === 'card' || prev.type === 'premium') {
            currentId = prev.card?.id;
          } else if (prev.type === 'playmat') {
            currentId = prev.playmat?.id;
          } else {
            currentId = prev.id;
          }
          if (prev.type === type && currentId === uniqueId) {
            return { ...prev, canClose: true };
          }
          return prev;
        });
      }, 500);
    };

    setShowCardAcquisitionModalHook((cardId, onClose) => {
      const card = CARD_MASTER?.find((c) => c.id === cardId);
      if (card) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({ type: 'card', card, canClose: false, onClose });
        triggerCloseTimer('card', cardId);
      }
    });

    setShowPremiumAcquisitionModalHook((cardId) => {
      const card = CARD_MASTER?.find((c) => c.id === cardId);
      if (card) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({
          type: 'premium',
          card: { ...card, isPremium: true },
          canClose: false,
        });
        triggerCloseTimer('premium', cardId);
      }
    });

    setShowPlaymatAcquisitionModalHook((name, id) => {
      const playmat = PLAYMAT_MASTER?.find((p) => p.id === id);
      if (playmat) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({ type: 'playmat', name, playmat, canClose: false });
        triggerCloseTimer('playmat', id);
      }
    });

    setShowSkinAcquisitionModalHook((name, id) => {
      const img = resolveSkinImageById(id);

      playSound?.(SOUNDS?.seSkill);
      setAcquisitionData({
        type: 'skin',
        name,
        id,
        image: img,
        canClose: false,
      });
      triggerCloseTimer('skin', id);
    });

    setShowIconAcquisitionModalHook((name, id) => {
      const iconDef = [...AVAILABLE_ICONS, ...EXTRA_ICONS].find(
        (i) => i.id === id
      );
      const img = appendVersionQuery(
        iconDef?.path || `assets/icons/icon_${id}.webp`
      );
      playSound?.(SOUNDS?.seSkill);
      setAcquisitionData({
        type: 'icon',
        name,
        id,
        image: img,
        canClose: false,
      });
      triggerCloseTimer('icon', id);
    });

    setShowCharacterAcquisitionModalHook((name, id) => {
      const char = CHARACTERS[id];
      if (char) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({
          type: 'character',
          name,
          id,
          image: char.image,
          canClose: false,
        });
        triggerCloseTimer('character', id);
      }
    });

    setShowStageAcquisitionModalHook((name, id) => {
      const stage = STAGES[id];
      if (stage) {
        playSound?.(SOUNDS?.seSkill);
        setAcquisitionData({
          type: 'stage',
          name,
          id,
          image: getStageImgUrl(id, false),
          canClose: false,
        });
        triggerCloseTimer('stage', id);
      }
    });

    window.showCharDetailModal = (char) => {
      playSound?.(SOUNDS?.seClick);
      setCharDetailData(char);
    };

    window.closeCharDetailModal = () => {
      playSound?.(SOUNDS?.seClick);
      setCharDetailData(null);
    };

    window.showExchangeDetailModal = (data) => {
      playSound?.(SOUNDS?.seClick);
      let autoImgUrl = data.imgUrl;
      const validItemObj =
        data.itemObj && Object.keys(data.itemObj).length > 0
          ? data.itemObj
          : null;

      if (!autoImgUrl && validItemObj && typeof getCardImgUrl === 'function') {
        autoImgUrl = getCardImgUrl(
          data.type === 'premium'
            ? { ...validItemObj, isPremium: true }
            : validItemObj
        );
      }

      setCardPreviewData({
        card: validItemObj || {
          id: data.id,
          name: data.titleName,
          flavor: data.displayFlavor,
          skills: [],
        },
        styleProps: {
          titleName: data.titleName || data.itemObj?.name || data.id,
          displayType:
            data.displayType ||
            EXCHANGE_DISPLAY_TYPE_LABELS[data.type] ||
            'カード',
          imgUrl: autoImgUrl,
          isSkin: data.type === 'skin',
          isPlaymat: data.type === 'playmat',
          isIcon: data.type === 'icon',
          flavorOverride: data.displayFlavor,
          showPreviewActions: false,
          showExchangeActions: true,
          exchangeData: {
            cost: data.cost,
            isMaxed: data.isMaxed,
            canExchange: data.canExchange,
            type: data.type,
            onConfirm: data.onConfirm,
          },
        },
      });
    };

    window.closeExchangeDetailModal = () => {
      playSound?.(SOUNDS?.seClick);
      setCardPreviewData(null);
    };

    window.showSyncDataModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setSyncDataVisible(true);
    };

    window.closeSyncDataModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setSyncDataVisible(false);
    };

    window.showPlayerNameModalState = (callback) => {
      playSound?.(SOUNDS?.seClick);
      const savedName = localStorage.getItem(PROFILE_NAME_KEY);
      setPlayerNameInput(savedName || '');
      setPlayerNameCallback(() => callback);
      setPlayerNameVisible(true);
    };

    window.closePlayerNameModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setPlayerNameCallback(null);
      setPlayerNameVisible(false);
    };

    window.showPlaymatSelectionModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setSelectedPlaymatState(GameState.selectedPlaymatId || null);
      setPlaymatSelectionVisible(true);
    };

    window.closePlaymatSelectionModalState = () => {
      playSound?.(SOUNDS?.seClick);
      setPlaymatSelectionVisible(false);
      saveDeck?.();
    };

    window.showSkillConfirmModalReact = (data) => {
      setSkillConfirmData(data);
    };

    window.closeSkillConfirmModalReact = () => {
      playSound?.(SOUNDS?.seClick);
      setSkillConfirmData(null);
    };

    window.showSkillChoiceModalReact = (
      choices,
      onSelect,
      maxChoices = 1,
      isForce = false
    ) => {
      setSkillChoiceData({
        choices,
        onSelect,
        maxChoices,
        selectedIndices: [],
        isForce,
      });
    };

    window.closeSkillChoiceModalReact = () => {
      setSkillChoiceData(null);
    };

    window.showDiscardSelectionModalReact = (
      cards,
      maxPow,
      onSelect,
      options = {}
    ) => {
      playSound?.(SOUNDS?.seClick);
      const optArgs =
        typeof options === 'boolean' ? { isViewOnly: options } : options;
      setDiscardSelectionData({
        cards,
        maxPow,
        onSelect,
        selectedIndex: null,
        selectedItems: [],
        currentTab: 'blue',
        ...optArgs,
      });
    };

    return () => {
      // アンマウント時にサービス側のモーダルフックを解除
      setShowConfirmModalHook(null);
      setShowAlertModalHook(null);
      setShowErrorModalHook(null);
      setShowPointAcquisitionModalHook(null);
      setOpenCardPreviewHook(null);
      setCloseCardPreviewHook(null);
      setShowCardAcquisitionModalHook(null);
      setShowPremiumAcquisitionModalHook(null);
      setShowPlaymatAcquisitionModalHook(null);
      setShowSkinAcquisitionModalHook(null);
      setShowIconAcquisitionModalHook(null);
      setShowCharacterAcquisitionModalHook(null);
      setShowStageAcquisitionModalHook(null);
      setCloseEnemyDeckModalHook(null);

      delete window.showPlayerProfileModal;
      delete window.showEnemyDeckModal;
      delete window.showCharDetailModal;
      delete window.closeCharDetailModal;
      delete window.showExchangeDetailModal;
      delete window.closeExchangeDetailModal;
      delete window.showSyncDataModalState;
      delete window.closeSyncDataModalState;
      delete window.showPlayerNameModalState;
      delete window.closePlayerNameModalState;
      delete window.showPlaymatSelectionModalState;
      delete window.closePlaymatSelectionModalState;
      delete window.showSkillConfirmModalReact;
      delete window.closeSkillConfirmModalReact;
      delete window.showSkillChoiceModalReact;
      delete window.closeSkillChoiceModalReact;
      delete window.showDiscardSelectionModalReact;
    };
  }, []);

  const handleConfirmOk = () => {
    playSound?.(SOUNDS?.seClick);
    const cb = confirmData?.onConfirm;
    setConfirmData(null);
    if (cb) cb();
  };

  const handleConfirmCancel = () => {
    playSound?.(SOUNDS?.seClick);
    const cb = confirmData?.onCancel;
    setConfirmData(null);
    if (cb) cb();
  };

  // reloadGame is now imported from uiMainCore.js to ensure cache is cleared

  const handleTogglePremium = (e, cardId) => {
    e.stopPropagation();
    playSound?.(SOUNDS?.seClick);

    const isCardListScreen = !!document
      .getElementById('screen-card-list')
      ?.classList.contains('active');
    togglePremiumCard?.(cardId, isCardListScreen);

    if (!isCardListScreen && window.saveCurrentEditDeck) {
      window.saveCurrentEditDeck();
    }

    if (typeof renderCardList === 'function' && isCardListScreen) {
      renderCardList();
    }
    if (
      typeof renderDeckEdit === 'function' &&
      document.getElementById('screen-deck-edit')?.classList.contains('active')
    ) {
      renderDeckEdit();
    }
    setCardPreviewData((prev) => ({ ...prev }));
  };

  const renderSkillTagReact = (card) => {
    if (!window.renderSkillTag) return null;
    return (
      <div
        dangerouslySetInnerHTML={{ __html: window.renderSkillTag(card, false) }}
      ></div>
    );
  };

  const renderCardPreviewContent = (
    card,
    styleProps = {},
    showPremiumTag = false
  ) => {
    return (
      <CardPreviewContent
        card={card}
        styleProps={styleProps}
        showPremiumTag={showPremiumTag}
        isRevealed={true}
        onEquipClick={(eqCard) => {
          playSound?.(SOUNDS?.seClick);
          setCardPreviewData({ card: eqCard, parentCard: card });
        }}
        onLinkClick={(targetId) => {
          playSound?.(SOUNDS?.seClick);
          const tObj = CARD_MASTER.find((c) => c.id === targetId);
          if (tObj) setCardPreviewData({ card: tObj, parentCard: card });
        }}
        onParentBack={() => {
          setCardPreviewData({ card: cardPreviewData.parentCard });
          playSound?.(SOUNDS?.seClick);
        }}
        onTogglePremium={(cardId) => {
          handleTogglePremium({ stopPropagation: () => {} }, cardId);
        }}
        onClosePreview={handleCloseCardPreview}
        onAcquisitionOk={() => {
          playSound?.(SOUNDS?.seClick);
          const cb = acquisitionData?.onClose;
          setAcquisitionData(null);
          if (cb) cb();
        }}
        onExchangeConfirm={(exchangeData) => {
          // 交換済み・ポイント不足はボタン自体が非活性のため到達しないが、安全のためガード
          if (exchangeData.isMaxed || !exchangeData.canExchange) return;
          if (exchangeData.onConfirm) {
            exchangeData.onConfirm();
          }
        }}
        onExchangeBack={() => {
          playSound?.(SOUNDS?.seClick);
          setCardPreviewData(null);
        }}
        renderSkillTagReact={renderSkillTagReact}
      />
    );
  };

  return (
    <>
      {/* Confirm Modal */}
      {confirmData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            zIndex: 6000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div className="skill-modal-box modal-pop-animation">
            <h2 style={{ color: '#facc15', marginBottom: '10px' }}>
              {confirmData.isAlert ? 'お知らせ' : '確認'}
            </h2>
            <p
              style={{
                color: '#cbd5e1',
                fontSize: '0.9rem',
                textAlign: 'center',
                marginBottom: '15px',
                lineHeight: 1.6,
                whiteSpace: 'pre-line',
              }}
            >
              {confirmData.message}
            </p>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              {!confirmData.isAlert && (
                <button
                  className="btn"
                  style={{ flex: 1, background: '#475569', margin: 0 }}
                  onClick={handleConfirmCancel}
                >
                  キャンセル
                </button>
              )}
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: 'linear-gradient(45deg, #0ea5e9, #0284c7)',
                  margin: 0,
                }}
                onClick={handleConfirmOk}
              >
                {confirmData.isAlert ? '閉じる' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.95)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{ borderColor: '#ef4444', maxWidth: '400px' }}
          >
            <h2 style={{ color: '#ef4444', marginBottom: '15px' }}>
              エラーが発生しました
            </h2>
            <p
              style={{
                color: '#cbd5e1',
                fontSize: '0.9rem',
                textAlign: 'left',
                marginBottom: '25px',
                lineHeight: 1.6,
                width: '100%',
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'rgba(0,0,0,0.3)',
                padding: '10px',
                borderRadius: '8px',
              }}
            >
              {errorData.message || '予期しないエラーが発生しました。'}
            </p>
            <p
              style={{
                color: '#94a3b8',
                fontSize: '0.75rem',
                marginBottom: '20px',
                textAlign: 'center',
              }}
            >
              ブラウザのキャッシュにより問題が継続する場合があります。
              <br />
              下のボタンから最新状態で再読み込みしてください。
            </p>
            <button
              className="btn"
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              }}
              onClick={reloadGame}
            >
              更新してタイトルへ
            </button>
          </div>
        </div>
      )}

      {/* Enemy Deck Modal */}
      {enemyDeckData && (
        <div
          className="modal-overlay"
          style={{ zIndex: 2000, display: 'flex' }}
          onClick={closeEnemyDeckModal}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{ width: '95%', maxWidth: '440px', padding: '20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                color: '#facc15',
                fontSize: '1.1rem',
                marginBottom: '12px',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {enemyDeckData.title}
            </h2>
            <div className="card-list-container">
              <div className="card-list-grid-3col" style={{ padding: '10px' }}>
                {(() => {
                  const grouped = {};
                  enemyDeckData.deck.forEach((cardItem) => {
                    let cardId =
                      typeof cardItem === 'object' ? cardItem.id : cardItem;
                    if (!grouped[cardId]) grouped[cardId] = 0;
                    grouped[cardId]++;
                  });

                  return Object.keys(grouped).map((cardId) => {
                    const count = grouped[cardId];
                    const template = CARD_MASTER?.find((m) => m.id === cardId);
                    if (!template) return null;

                    const originalItem = enemyDeckData.deck.find((c) =>
                      typeof c === 'object' ? c.id === cardId : c === cardId
                    );
                    let isPremium = false;
                    if (
                      typeof originalItem === 'object' &&
                      originalItem?.isPremium !== undefined
                    ) {
                      isPremium = !!originalItem.isPremium;
                    } else if (
                      Array.isArray(enemyDeckData.premiumCards) &&
                      enemyDeckData.premiumCards.includes(cardId)
                    ) {
                      isPremium = true;
                    } else if (
                      enemyDeckData.isPlayerDeck &&
                      Array.isArray(GameState.premiumCards) &&
                      GameState.premiumCards.includes(cardId)
                    ) {
                      isPremium = true;
                    }

                    const displayCard = {
                      ...template,
                      owner: enemyDeckData.isPlayerDeck ? 'blue' : 'red',
                      isPremium,
                    };

                    const imgUrl = getCardImgUrl
                      ? getCardImgUrl(displayCard, true)
                      : '';
                    const rarityClass = displayCard.rarity
                      ? ` rarity-${displayCard.rarity}`
                      : '';
                    const cardThemeClass = enemyDeckData.isPlayerDeck
                      ? 'blue'
                      : 'red';
                    return (
                      <div
                        key={cardId}
                        className="deck-card-item gallery-card-wrapper"
                        onClick={() => openCardPreview?.(displayCard)}
                      >
                        <div
                          className={`card ${cardThemeClass}${rarityClass}${
                            isPremium ? ' premium' : ''
                          }`}
                        >
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
                          {renderSkillTagReact(displayCard)}
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
            {(() => {
              const cfg = enemyDeckData.isPlayerDeck
                ? GameState.playerConfig
                : GameState.enemyConfig;
              const charId =
                cfg?.id ||
                cfg?.charId ||
                cfg?.leaderCardId ||
                cfg?.leaderId ||
                'android';
              const targetSkill =
                enemyDeckData.leaderSkill ||
                cfg?.leaderSkill ||
                CHARACTERS[charId]?.leaderSkill ||
                CHARACTERS.android.leaderSkill;

              if (!targetSkill) return null;

              return (
                <button
                  className="btn"
                  style={{
                    marginTop: '20px',
                    width: '100%',
                    background: '#475569',
                    fontSize: '1rem',
                    padding: '8px',
                    marginBottom: '0',
                  }}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    if (window.showSkillConfirmModalReact) {
                      window.showSkillConfirmModalReact({
                        skill: targetSkill,
                        statusText: '',
                        color: '#94a3b8',
                        canExecute: false,
                      });
                    }
                  }}
                >
                  リーダースキル
                </button>
              );
            })()}
            <button
              className="btn"
              style={{ marginTop: '10px', width: '100%' }}
              onClick={closeEnemyDeckModal}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* Card Preview Modal */}
      {cardPreviewData && (
        <div
          className="modal-overlay"
          style={{ zIndex: 4000, display: 'flex' }}
          onClick={handleCloseCardPreview}
        >
          {renderCardPreviewContent(
            cardPreviewData.card,
            cardPreviewData.styleProps || { showPreviewActions: true }
          )}
        </div>
      )}

      {/* Acquisition Modals (Card, Premium, Playmat) */}
      {acquisitionData && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 3000,
            display: 'flex',
            background: 'rgba(0,0,0,0.9)',
            animation: 'fadeIn 0.4s',
          }}
        >
          {acquisitionData.type === 'card' &&
            renderCardPreviewContent(acquisitionData.card, {
              containerClass: 'acquisition-glow',
              margin: '0 !important',
              showAcquisitionOk: true,
              canClose: acquisitionData.canClose,
            })}

          {acquisitionData.type === 'premium' &&
            renderCardPreviewContent(
              acquisitionData.card,
              {
                containerClass: 'acquisition-glow',
                margin: '0 !important',
                borderColor: '#d946ef',
                boxShadow: '0 0 30px rgba(217, 70, 239, 0.5)',
                showAcquisitionOk: true,
                okBg: 'linear-gradient(45deg, #d946ef, #9333ea)',
                okColor: '#fff',
                canClose: acquisitionData.canClose,
              },
              true
            )}

          {acquisitionData.type === 'playmat' && (
            <AcquisitionModal
              title="プレイマット獲得！"
              borderColor="#eab308"
              shadowColor="rgba(234, 179, 8, 0.5)"
              imageSrc={acquisitionData.playmat.image}
              imageStyle={{
                width: '100%',
                height: '160px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid #eab308',
                marginBottom: '20px',
                boxShadow: '0 0 15px rgba(234, 179, 8, 0.3)',
              }}
              itemName={acquisitionData.name}
              itemTypeName="プレイマット"
              btnBg="linear-gradient(45deg, #eab308, #ca8a04)"
              btnColor="#fff"
              canClose={acquisitionData.canClose}
              onClose={() => setAcquisitionData(null)}
            />
          )}

          {acquisitionData.type === 'skin' && (
            <AcquisitionModal
              title="スキン獲得！"
              borderColor="#eab308"
              shadowColor="rgba(234, 179, 8, 0.5)"
              imageSrc={acquisitionData.image}
              imageStyle={{
                width: '160px',
                height: '220px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid #eab308',
                marginBottom: '20px',
                boxShadow: '0 0 15px rgba(234, 179, 8, 0.3)',
              }}
              itemName={acquisitionData.name}
              itemTypeName="スキン"
              btnBg="linear-gradient(45deg, #eab308, #ca8a04)"
              btnColor="#fff"
              canClose={acquisitionData.canClose}
              onClose={() => setAcquisitionData(null)}
            />
          )}

          {acquisitionData.type === 'icon' && (
            <AcquisitionModal
              title="アイコン獲得！"
              borderColor="#eab308"
              shadowColor="rgba(234, 179, 8, 0.5)"
              imageSrc={acquisitionData.image}
              imageStyle={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                overflow: 'hidden',
                marginBottom: '20px',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              itemName={acquisitionData.name}
              itemTypeName="アイコン"
              btnBg="linear-gradient(45deg, #eab308, #ca8a04)"
              btnColor="#fff"
              isIcon={true}
              canClose={acquisitionData.canClose}
              onClose={() => setAcquisitionData(null)}
            />
          )}

          {acquisitionData.type === 'character' && (
            <AcquisitionModal
              title="キャラクター獲得！"
              borderColor="#eab308"
              shadowColor="rgba(234, 179, 8, 0.5)"
              imageSrc={acquisitionData.image}
              imageStyle={{
                width: '160px',
                height: '220px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid #eab308',
                marginBottom: '20px',
                boxShadow: '0 0 15px rgba(234, 179, 8, 0.3)',
              }}
              itemName={acquisitionData.name}
              itemTypeName="キャラクター"
              btnBg="linear-gradient(45deg, #eab308, #ca8a04)"
              btnColor="#fff"
              canClose={acquisitionData.canClose}
              onClose={() => setAcquisitionData(null)}
            />
          )}

          {acquisitionData.type === 'stage' && (
            <AcquisitionModal
              title="ステージ獲得！"
              borderColor="#eab308"
              shadowColor="rgba(234, 179, 8, 0.5)"
              imageSrc={acquisitionData.image}
              imageStyle={{
                width: '100%',
                height: '160px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid #eab308',
                marginBottom: '20px',
                boxShadow: '0 0 15px rgba(234, 179, 8, 0.3)',
              }}
              itemName={acquisitionData.name}
              itemTypeName="ステージ"
              btnBg="linear-gradient(45deg, #eab308, #ca8a04)"
              btnColor="#fff"
              canClose={acquisitionData.canClose}
              onClose={() => setAcquisitionData(null)}
            />
          )}
        </div>
      )}

      {/* Point Acquisition Modal */}
      {pointAcquisitionData && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 3200,
            display: 'flex',
            background: 'rgba(0,0,0,0.85)',
            animation: 'fadeIn 0.3s',
          }}
          onClick={() =>
            pointAcquisitionData.onClose && pointAcquisitionData.onClose()
          }
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{
              border: `2px solid ${pointAcquisitionData.color || '#facc15'}`,
              textAlign: 'center',
              maxWidth: '400px',
              width: '90%',
              padding: '30px 20px',
              boxShadow: `0 0 40px ${pointAcquisitionData.color || '#facc15'}66`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                color: pointAcquisitionData.color || '#facc15',
                marginBottom: '20px',
                fontSize: '1.4rem',
                textShadow: '1px 1px 2px #000',
              }}
            >
              {pointAcquisitionData.title}
            </h2>

            <p
              style={{
                color: '#fff',
                fontSize: '1rem',
                marginBottom: '10px',
                whiteSpace: 'pre-line',
                lineHeight: '1.5',
              }}
            >
              {pointAcquisitionData.message}
            </p>

            <div
              style={{
                fontSize: '3.5rem',
                margin: '20px 0',
                fontWeight: 'bold',
                color: '#fff',
                textShadow: `0 0 20px ${pointAcquisitionData.color || '#facc15'}`,
              }}
            >
              ✨{' '}
              <span style={{ color: pointAcquisitionData.color || '#facc15' }}>
                {pointAcquisitionData.points}
              </span>{' '}
              <span style={{ fontSize: '1.5rem' }}>Pt</span>
            </div>

            {pointAcquisitionData.totalPoints !== undefined && (
              <p
                style={{
                  color: '#94a3b8',
                  fontSize: '0.95rem',
                  marginBottom: '30px',
                }}
              >
                現在の累計: {pointAcquisitionData.totalPoints} Pt
              </p>
            )}

            <button
              className="btn ok-button"
              style={{
                width: '150px',
                margin: '0 auto',
                background: `linear-gradient(45deg, ${pointAcquisitionData.color || '#facc15'}, ${pointAcquisitionData.darkColor || '#eab308'})`,
                color: '#000',
                fontWeight: 'bold',
              }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                if (pointAcquisitionData.onClose)
                  pointAcquisitionData.onClose();
                setPointAcquisitionData(null);
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Character Detail Modal */}
      {charDetailData && (
        <div
          className="screen"
          style={{
            background: 'rgba(0,0,0,0.85)',
            zIndex: 50,
            display: 'flex',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--panel-bg, #1e293b)',
              border: '2px solid #facc15',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '350px',
              maxHeight: '95vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 0 30px rgba(0,0,0,0.8)',
              boxSizing: 'border-box',
            }}
          >
            {(() => {
              const isEnemySelection =
                GameState.appState === 'select_enemy' ||
                charDetailData.isDungeonEnemy;
              let skinIdToUse;
              if (isEnemySelection) {
                skinIdToUse = 'default';
              } else if (GameState.gameMode === 'battle_dungeon') {
                skinIdToUse =
                  GameState.playerSkins?.[charDetailData.id] || 'default';
              } else if (
                charDetailData.targetDeckIndex !== undefined &&
                GameState.decks &&
                GameState.decks[charDetailData.targetDeckIndex]
              ) {
                skinIdToUse =
                  GameState.decks[charDetailData.targetDeckIndex].playerSkins?.[
                    charDetailData.id
                  ] || 'default';
              } else {
                skinIdToUse =
                  GameState.playerSkins?.[charDetailData.id] || 'default';
              }
              const imgSrc = getSkinImage(
                charDetailData.id,
                skinIdToUse,
                'image'
              );
              return (
                <img
                  src={imgSrc}
                  style={{
                    width: '140px',
                    height: '175px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '2px solid #334155',
                    marginBottom: '10px',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                  alt={charDetailData.name}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    setSimpleImagePreview(imgSrc);
                  }}
                />
              );
            })()}

            <h2
              style={{
                marginBottom: '5px',
                color: charDetailData.color || '#facc15',
                fontSize: '1.3rem',
                textAlign: 'center',
                flexShrink: 0,
              }}
            >
              {charDetailData.name}
            </h2>

            {charDetailData.easeOfUse && (
              <div
                style={{
                  color: '#fbd38d',
                  fontSize: '0.95rem',
                  marginBottom: '5px',
                  textShadow: '1px 1px 2px #000',
                  flexShrink: 0,
                }}
              >
                使いやすさ: {'★'.repeat(charDetailData.easeOfUse)}
                {'☆'.repeat(3 - charDetailData.easeOfUse)}
              </div>
            )}

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                width: '100%',
                padding: '0 5px',
                marginBottom: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <p
                style={{
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {charDetailData.desc}
              </p>

              {charDetailData.leaderSkill && (
                <div
                  style={{
                    background: 'rgba(0,0,0,0.5)',
                    padding: '10px',
                    borderRadius: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid #475569',
                  }}
                >
                  <div
                    style={{
                      color: '#facc15',
                      fontWeight: 'bold',
                      fontSize: '0.8rem',
                      marginBottom: '5px',
                    }}
                  >
                    【リーダースキル】
                  </div>
                  <div
                    style={{
                      fontWeight: 'bold',
                      marginBottom: '3px',
                      color: '#fff',
                    }}
                  >
                    {charDetailData.leaderSkill.name}{' '}
                    {charDetailData.leaderSkill.cost
                      ? `(必要SP: ${charDetailData.leaderSkill.cost})`
                      : ''}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      lineHeight: 1.3,
                    }}
                  >
                    {charDetailData.leaderSkill.desc}
                  </div>
                </div>
              )}
            </div>

            {/* リーダー変更ボタン（デッキ編成画面経由かつ変更許可モードの場合のみ表示） */}
            {charDetailData.allowLeaderChange && (
              <button
                className="btn"
                style={{
                  width: '100%',
                  margin: 0,
                  marginBottom: '10px',
                  background: 'linear-gradient(45deg, #f59e0b, #d97706)',
                  border: 'none',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  textShadow: '1px 1px 2px #000',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setLeaderSelectVisible(true);
                }}
              >
                リーダー変更
              </button>
            )}

            {!(
              GameState.appState === 'select_enemy' ||
              charDetailData.isDungeonEnemy
            ) && (
              <button
                className="btn"
                style={{
                  width: '100%',
                  margin: 0,
                  marginBottom: '10px',
                  background: 'linear-gradient(45deg, #c084fc, #9333ea)',
                  border: 'none',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  textShadow: '1px 1px 2px #000',
                }}
                onClick={() => {
                  let initialSkin = 'default';
                  const isEnemySelection =
                    GameState.appState === 'select_enemy' ||
                    charDetailData.isDungeonEnemy;

                  if (isEnemySelection) {
                    initialSkin = 'default';
                  } else if (GameState.gameMode === 'battle_dungeon') {
                    initialSkin =
                      GameState.playerSkins?.[charDetailData.id] || 'default';
                  } else if (
                    charDetailData.targetDeckIndex !== undefined &&
                    GameState.decks &&
                    GameState.decks[charDetailData.targetDeckIndex]
                  ) {
                    initialSkin =
                      GameState.decks[charDetailData.targetDeckIndex]
                        .playerSkins?.[charDetailData.id] || 'default';
                  } else {
                    initialSkin =
                      GameState.playerSkins?.[charDetailData.id] || 'default';
                  }
                  setSelectedSkinState(initialSkin);
                  playSound?.(SOUNDS?.seClick);
                  setSkinSelectionVisible(true);
                }}
              >
                ✨ スキン変更
              </button>
            )}

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                className="btn"
                style={{ flex: 1, background: '#475569', margin: 0 }}
                onClick={(e) => {
                  window.closeCharDetailModal(e);
                }}
              >
                戻る
              </button>
              {!charDetailData.hideDecideButton && (
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
                    margin: 0,
                  }}
                  onClick={() => {
                    setCharDetailData(null);
                    confirmCharSelect?.();
                  }}
                >
                  決定
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Exchange Detail Modal (Deleted, now unified with Card Preview Modal) */}

      {/* Sync Data Modal */}
      {syncDataVisible && (
        <div
          className="screen"
          style={{
            background: 'rgba(0,0,0,0.85)',
            zIndex: 70,
            display: 'flex',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--panel-bg, #1e293b)',
              border: '2px solid #94a3b8',
              borderRadius: '12px',
              padding: '30px',
              width: '90%',
              maxWidth: '350px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 0 30px rgba(0,0,0,0.8)',
            }}
          >
            <h2 style={{ color: '#f8fafc', marginBottom: '20px' }}>
              データ連携
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                width: '100%',
              }}
            >
              <button
                className="btn"
                style={{
                  background: 'linear-gradient(45deg, #0ea5e9, #2563eb)',
                  margin: 0,
                }}
                onClick={backupDataToXML}
              >
                バックアップ
              </button>
              <button
                className="btn"
                style={{
                  background: 'linear-gradient(45deg, #10b981, #059669)',
                  margin: 0,
                }}
                onClick={importDataFromXML}
              >
                データ取込
              </button>
              <button
                className="btn"
                style={{ background: '#475569', marginTop: '5px' }}
                onClick={(e) => {
                  window.closeSyncDataModalState(e);
                }}
              >
                戻る
              </button>
            </div>
            <p
              style={{
                color: '#94a3b8',
                fontSize: '0.75rem',
                marginTop: '20px',
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              バックアップしたXMLファイルを保存するか、保存したファイルからデータを復元できます。
            </p>
          </div>
        </div>
      )}

      {/* Player Name Modal */}
      {playerNameVisible && (
        <div
          className="screen"
          style={{
            background: 'rgba(0,0,0,0.85)',
            zIndex: 2200,
            display: 'flex',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--panel-bg, #1e293b)',
              border: '2px solid #10b981',
              borderRadius: '12px',
              padding: '30px',
              width: '90%',
              maxWidth: '350px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 0 30px rgba(0,0,0,0.8)',
            }}
          >
            <h2
              style={{
                color: '#10b981',
                marginBottom: '20px',
                fontSize: '1.2rem',
              }}
            >
              プレイヤーネーム登録
            </h2>
            <p
              style={{
                color: '#cbd5e1',
                fontSize: '0.85rem',
                marginBottom: '15px',
                textAlign: 'center',
              }}
            >
              プレイヤーネームを入力してください。
            </p>
            <input
              type="text"
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              placeholder="名前を入力..."
              maxLength="12"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#fff',
                fontSize: '1rem',
                marginBottom: '25px',
                outline: 'none',
                textAlign: 'center',
              }}
            />
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: '#475569',
                  margin: 0,
                  fontSize: '0.85rem',
                  paddingLeft: '10px',
                  paddingRight: '10px',
                  whiteSpace: 'nowrap',
                }}
                onClick={window.closePlayerNameModalState}
              >
                キャンセル
              </button>
              <button
                className="btn"
                style={{
                  flex: 1,
                  background: 'linear-gradient(45deg, #10b981, #059669)',
                  margin: 0,
                  fontSize: '0.85rem',
                  paddingLeft: '10px',
                  paddingRight: '10px',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  // コールバック指定時は呼び出し元（プロフィール等）が保存責任を持つため、ここでは永続化しない
                  if (playerNameInput && !playerNameCallback) {
                    localStorage.setItem(PROFILE_NAME_KEY, playerNameInput);
                  }
                  if (playerNameCallback) {
                    playerNameCallback(playerNameInput);
                  } else if (window.submitDefenseDeckWrapper) {
                    window.submitDefenseDeckWrapper(playerNameInput);
                  } else if (submitDefenseDeck) {
                    submitDefenseDeck(playerNameInput);
                  }
                  if (window.closePlayerNameModalState) {
                    window.closePlayerNameModalState();
                  }
                }}
              >
                完了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Playmat Selection Modal */}
      {playmatSelectionVisible && (
        <div
          className="screen"
          style={{
            background: 'rgba(0,0,0,0.85)',
            zIndex: 80,
            display: 'flex',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--panel-bg, #1e293b)',
              border: '2px solid #facc15',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '400px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 0 30px rgba(0,0,0,0.8)',
            }}
          >
            <h2
              style={{
                color: '#facc15',
                marginBottom: '15px',
                fontSize: '1.2rem',
              }}
            >
              プレイマット設定
            </h2>

            <div
              style={{
                width: '100%',
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '5px',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  padding: '12px',
                  background:
                    !selectedPlaymatState || selectedPlaymatState === 'null'
                      ? 'rgba(242, 201, 76, 0.2)'
                      : 'rgba(0, 0, 0, 0.3)',
                  border: `2px solid ${!selectedPlaymatState || selectedPlaymatState === 'null' ? '#facc15' : '#475569'}`,
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  transition: 'all 0.2s',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  GameState.selectedPlaymatId = null;
                  setSelectedPlaymatState(null);
                  if (GameState.gameMode === 'battle_dungeon') {
                    saveDungeonProgress();
                  }
                }}
              >
                未選択
              </div>

              {(() => {
                // 所持情報は永続化済みデータ（LocalStorage）を最優先とする。
                // 未保存時（null）のみ実行中の GameState、最後にモジュール初期所持データ（ownedPlaymats）へフォールバックする。
                const storedOwned = safeParseArrayOrNull(OWNED_PLAYMATS_KEY);
                const currentOwned = Array.isArray(storedOwned)
                  ? storedOwned
                  : Array.isArray(GameState.ownedPlaymats)
                    ? GameState.ownedPlaymats
                    : Array.isArray(ownedPlaymats)
                      ? ownedPlaymats
                      : [];
                const filtered = PLAYMAT_MASTER?.filter((p) =>
                  currentOwned.includes(p.id)
                );

                if (!filtered || filtered.length === 0) {
                  return (
                    <div
                      style={{
                        color: '#94a3b8',
                        fontSize: '0.8rem',
                        textAlign: 'center',
                        marginTop: '20px',
                      }}
                    >
                      解放済みのプレイマットがありません。
                      <br />
                      実績を達成して入手しましょう！
                    </div>
                  );
                }

                return filtered.map((p) => {
                  const isSelected = selectedPlaymatState === p.id;
                  return (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px',
                        background: isSelected
                          ? 'rgba(242, 201, 76, 0.2)'
                          : 'rgba(0, 0, 0, 0.3)',
                        border: `2px solid ${isSelected ? '#facc15' : '#475569'}`,
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => {
                        playSound?.(SOUNDS?.seClick);
                        GameState.selectedPlaymatId = p.id;
                        setSelectedPlaymatState(p.id);
                        if (GameState.gameMode === 'battle_dungeon') {
                          saveDungeonProgress();
                        }
                      }}
                    >
                      <div
                        style={{
                          width: '80px',
                          height: '40px',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          border: '1px solid #475569',
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={getPlaymatImgUrl(p, true)}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          alt={p.name}
                        />
                      </div>
                      <div
                        style={{
                          flex: 1,
                          fontWeight: 'bold',
                          fontSize: '0.9rem',
                        }}
                      >
                        {p.name}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div
              style={{
                marginTop: '15px',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <button
                className="btn"
                style={{ background: '#475569', margin: 0 }}
                onClick={(e) => {
                  window.closePlaymatSelectionModalState(e);
                }}
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skin Selection Modal */}
      {skinSelectionVisible && (
        <div
          className="screen"
          style={{
            background: 'rgba(0,0,0,0.85)',
            zIndex: 80,
            display: 'flex',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--panel-bg, #1e293b)',
              border: '2px solid #c084fc',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '400px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 0 30px rgba(0,0,0,0.8)',
            }}
          >
            <h2
              style={{
                color: '#c084fc',
                marginBottom: '15px',
                fontSize: '1.2rem',
              }}
            >
              スキン変更
            </h2>

            <div
              style={{
                width: '100%',
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '5px',
                boxSizing: 'border-box',
              }}
            >
              {charDetailData &&
                charDetailData.skins &&
                Object.keys(charDetailData.skins).map((skinId) => {
                  const skinDef = charDetailData.skins[skinId];
                  const isSelected = selectedSkinState === skinId;
                  const isUnlocked =
                    skinId === 'default' ||
                    (GameState.unlockedSkins &&
                      (GameState.unlockedSkins.includes(
                        `${charDetailData.id}_${skinId}`
                      ) ||
                        GameState.unlockedSkins.includes(skinId)));

                  return (
                    <div
                      key={skinId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px',
                        background: isSelected
                          ? 'rgba(192, 132, 252, 0.2)'
                          : 'rgba(0, 0, 0, 0.3)',
                        border: `2px solid ${isSelected ? '#c084fc' : '#475569'}`,
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: isUnlocked ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                        opacity: isUnlocked ? 1 : 0.5,
                      }}
                      onClick={() => {
                        if (!isUnlocked) return;
                        playSound?.(SOUNDS?.seClick);

                        const hasTargetDeck =
                          charDetailData.targetDeckIndex !== undefined &&
                          GameState.decks &&
                          GameState.decks[charDetailData.targetDeckIndex];

                        if (GameState.gameMode === 'battle_dungeon') {
                          // 試練の宮殿（ダンジョン）モード時は通常デッキの汚染を防ぐため分岐
                          if (!GameState.playerSkins) {
                            GameState.playerSkins = {};
                          }
                          GameState.playerSkins[charDetailData.id] = skinId;
                          syncPlayerConfigImages(charDetailData, skinId);

                          // 宮殿デッキオブジェクト (GameState.decks[0]) の playerSkins も同期更新
                          if (GameState.decks && GameState.decks[0]) {
                            if (!GameState.decks[0].playerSkins) {
                              GameState.decks[0].playerSkins = {};
                            }
                            GameState.decks[0].playerSkins[charDetailData.id] =
                              skinId;
                          }

                          // デッキ一時キャッシュと宮殿セーブデータを自動更新
                          if (window.saveCurrentEditDeck) {
                            window.saveCurrentEditDeck();
                          }
                          saveDungeonProgress();

                          // 画面再描画
                          if (window.forceUpdateDeckList) {
                            window.forceUpdateDeckList();
                          }
                          if (typeof renderDeckEdit === 'function') {
                            renderDeckEdit();
                          }
                        } else if (hasTargetDeck) {
                          const targetDeck =
                            GameState.decks[charDetailData.targetDeckIndex];
                          if (!targetDeck.playerSkins)
                            targetDeck.playerSkins = {};
                          targetDeck.playerSkins[charDetailData.id] = skinId;

                          const isActiveDeck =
                            GameState.currentDeckIndex ===
                            charDetailData.targetDeckIndex;
                          if (isActiveDeck) {
                            if (!GameState.playerSkins)
                              GameState.playerSkins = {};
                            GameState.playerSkins[charDetailData.id] = skinId;
                            syncPlayerConfigImages(charDetailData, skinId);
                          }

                          // 各モードに応じたLocalStorageセーブ
                          if (GameState.gameMode === 'defense_register') {
                            localStorage.setItem(
                              'mini_card_battle_defense_deck_obj',
                              JSON.stringify(targetDeck)
                            );
                          } else {
                            localStorage.setItem(
                              'mini_card_battle_decks',
                              JSON.stringify(GameState.decks)
                            );
                          }

                          // 画面再描画
                          if (window.forceUpdateDeckList)
                            window.forceUpdateDeckList();
                          if (typeof renderDeckEdit === 'function')
                            renderDeckEdit();
                        } else {
                          // 指定がない場合（キャラ選択画面など）の既存フロー
                          if (!GameState.playerSkins) {
                            GameState.playerSkins = {};
                          }
                          GameState.playerSkins[charDetailData.id] = skinId;

                          syncPlayerConfigImages(charDetailData, skinId);

                          if (window.saveCurrentEditDeck)
                            window.saveCurrentEditDeck();
                          if (window.saveDeck) window.saveDeck();
                          if (typeof renderDeckEdit === 'function')
                            renderDeckEdit();
                        }

                        setSelectedSkinState(skinId);
                        setSkinSelectionVisible(false); // スキン選択モーダルを閉じる
                        if (charDetailData) {
                          // キャラクター詳細モーダルの画像更新のため再レンダリングをトリガー
                          setCharDetailData({ ...charDetailData });
                        }
                        if (window.closeSkinSelectionModalState)
                          window.closeSkinSelectionModalState();
                        if (window.forceUpdateSelectScreen)
                          window.forceUpdateSelectScreen();
                      }}
                    >
                      {/* スキンアイコン（フレーム付き） */}
                      <div
                        className="banner-icon-wrapper"
                        style={{
                          width: '48px',
                          height: '48px',
                          marginRight: 0,
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={getSkinImage(charDetailData.id, skinId, 'icon')}
                          className="banner-icon"
                          alt={skinDef.name}
                        />
                        <img
                          src={getIconFramePath(charDetailData.id)}
                          className="banner-icon-frame"
                          alt="frame"
                        />
                      </div>
                      <div
                        style={{
                          flex: 1,
                          fontWeight: 'bold',
                          fontSize: '0.9rem',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <span>{skinDef.name}</span>
                        {!isUnlocked && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#f87171',
                              fontWeight: 'normal',
                            }}
                          >
                            未解放 (
                            {skinDef.unlockCondition || '試練交換所で入手'})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {(!charDetailData || !charDetailData.skins) && (
                <div
                  style={{
                    color: '#94a3b8',
                    fontSize: '0.8rem',
                    textAlign: 'center',
                    marginTop: '20px',
                  }}
                >
                  このキャラクターには変更可能なスキンがありません。
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: '15px',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <button
                className="btn"
                style={{ background: '#475569', margin: 0 }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setSkinSelectionVisible(false);
                }}
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leader Select Modal（リーダー変更用キャラクター選択モーダル） */}
      {leaderSelectVisible && (
        <div
          className="screen"
          style={{
            background: 'rgba(0,0,0,0.85)',
            zIndex: 80,
            display: 'flex',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--panel-bg, #1e293b)',
              border: '2px solid #facc15',
              borderRadius: '12px',
              padding: '20px',
              width: '90%',
              maxWidth: '400px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 0 30px rgba(0,0,0,0.8)',
            }}
          >
            <h2
              style={{
                color: '#facc15',
                marginBottom: '15px',
                fontSize: '1.2rem',
              }}
            >
              リーダー変更
            </h2>

            <div
              style={{
                width: '100%',
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '5px',
                boxSizing: 'border-box',
              }}
            >
              {(() => {
                /**
                 * リーダー変更候補のキャラクター一覧を生成する
                 * ボスキャラクターは除外し、automataは解放済みの場合のみ表示する
                 * @returns {Array<Object>} フィルタリング済みのキャラクターオブジェクト配列
                 */
                const getLeaderCandidates = () => {
                  const charsObj = CHARACTERS || {};
                  return Object.values(charsObj).filter((c) => {
                    // ボスキャラクターは選択不可
                    if (BOSS_CHARACTER_IDS.includes(c.id)) return false;
                    // 解放制キャラクター（automata, valkyria等）は解放済みの場合のみ表示
                    if (!canShowUnlockableCharacter(c.id)) return false;
                    return true;
                  });
                };

                const currentLeaderId = charDetailData?.id;
                const candidates = getLeaderCandidates();

                return candidates.map((char) => {
                  const isCurrentLeader = char.id === currentLeaderId;
                  return (
                    <div
                      key={char.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px',
                        background: isCurrentLeader
                          ? 'rgba(250, 204, 21, 0.2)'
                          : 'rgba(0, 0, 0, 0.3)',
                        border: `2px solid ${isCurrentLeader ? '#facc15' : '#475569'}`,
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: isCurrentLeader ? 'default' : 'pointer',
                        transition: 'all 0.2s',
                        opacity: isCurrentLeader ? 0.6 : 1,
                      }}
                      onClick={() => {
                        // 現在のリーダーと同じ場合は何もしない
                        if (isCurrentLeader) return;
                        playSound?.(SOUNDS?.seClick);

                        const targetDeckIndex = charDetailData?.targetDeckIndex;

                        // デッキのリーダーIDを更新
                        if (
                          targetDeckIndex !== undefined &&
                          GameState.decks &&
                          GameState.decks[targetDeckIndex]
                        ) {
                          GameState.decks[targetDeckIndex].leaderId = char.id;

                          // 各モードに応じたLocalStorageへの永続化
                          if (GameState.gameMode === 'defense_register') {
                            localStorage.setItem(
                              'mini_card_battle_defense_deck_obj',
                              JSON.stringify(GameState.decks[targetDeckIndex])
                            );
                          } else {
                            localStorage.setItem(
                              'mini_card_battle_decks',
                              JSON.stringify(GameState.decks)
                            );
                          }

                          // 現在アクティブなデッキの場合、playerConfigも同期する
                          const isActiveDeck =
                            GameState.currentDeckIndex === targetDeckIndex;
                          if (isActiveDeck) {
                            GameState.playerConfig = {
                              ...CHARACTERS[char.id],
                            };
                          }
                        }

                        // モーダルを閉じる
                        setLeaderSelectVisible(false);
                        setCharDetailData(null);

                        // デッキ編集画面・デッキ一覧画面を再描画
                        if (typeof renderDeckEdit === 'function') {
                          renderDeckEdit();
                        }
                        if (window.forceUpdateDeckList) {
                          window.forceUpdateDeckList();
                        }
                      }}
                    >
                      {/* リーダーアイコン（フレーム付き・スキン反映対応） */}
                      <div
                        className="banner-icon-wrapper"
                        style={{
                          width: '48px',
                          height: '48px',
                          marginRight: 0,
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={
                            (getSkinImage
                              ? getSkinImage(
                                  char,
                                  (charDetailData?.targetDeckIndex !==
                                    undefined &&
                                    GameState.decks?.[
                                      charDetailData.targetDeckIndex
                                    ]?.playerSkins?.[char.id]) ||
                                    GameState.playerSkins?.[char.id] ||
                                    'default',
                                  'icon'
                                )
                              : char.icon) || char.icon
                          }
                          className="banner-icon"
                          alt={char.name}
                        />
                        <img
                          src={getIconFramePath(char.id)}
                          className="banner-icon-frame"
                          alt="frame"
                        />
                      </div>
                      <div
                        style={{
                          flex: 1,
                          fontWeight: 'bold',
                          fontSize: '0.9rem',
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        <span>{char.name}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div
              style={{
                marginTop: '15px',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <button
                className="btn"
                style={{ background: '#475569', margin: 0 }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setLeaderSelectVisible(false);
                }}
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skill Confirm Modal */}
      {skillConfirmData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            zIndex: 2500,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
          }}
          onClick={window.closeSkillConfirmModalReact}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="skill-confirm-name"
              style={{ color: '#facc15', marginBottom: '10px' }}
            >
              {skillConfirmData.skill.name}
            </h2>
            <p
              id="skill-confirm-desc"
              style={{
                color: '#cbd5e1',
                fontSize: '0.9rem',
                textAlign: 'center',
                marginBottom: '15px',
                lineHeight: 1.4,
              }}
            >
              {skillConfirmData.skill.desc}
            </p>
            <div
              id="skill-confirm-status"
              style={{
                margin: '10px 0 20px 0',
                fontWeight: 'bold',
                fontSize: '1.1rem',
                color: skillConfirmData.color,
              }}
            >
              {skillConfirmData.statusText}
            </div>
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button
                className="btn"
                style={{ flex: 1, background: '#475569', marginTop: 0 }}
                onClick={window.closeSkillConfirmModalReact}
              >
                閉じる
              </button>
              {skillConfirmData.canExecute && (
                <button
                  id="btn-execute-skill"
                  className="btn"
                  style={{
                    flex: 1,
                    background: 'linear-gradient(45deg, #ef4444, #b91c1c)',
                    marginTop: 0,
                  }}
                  onClick={() => {
                    window.closeSkillConfirmModalReact();
                    if (skillConfirmData.onExecute)
                      skillConfirmData.onExecute();
                  }}
                >
                  使用する
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Skill Choice Modal */}
      {skillChoiceData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h2
              style={{
                color: '#facc15',
                marginBottom: '20px',
                textAlign: 'center',
                flexShrink: 0,
              }}
            >
              {skillChoiceData.isForce ? '相手のスキルを選択' : 'スキルを選択'}{' '}
              {skillChoiceData.maxChoices > 1
                ? `(${skillChoiceData.selectedIndices.length}/${skillChoiceData.maxChoices})`
                : ''}
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                width: '100%',
                overflowY:
                  skillChoiceData.choices.length > 3 ? 'auto' : 'visible',
                paddingRight: skillChoiceData.choices.length > 3 ? '5px' : '0',
              }}
            >
              {skillChoiceData.choices.map((sk, idx) => {
                const skillDef = SKILLS[sk.id] || {
                  name: '不明',
                  icon: '❓',
                  desc: () => '',
                };
                const val = sk.value || '';
                const isSelected =
                  skillChoiceData.selectedIndices.includes(idx);

                return (
                  <div
                    key={idx}
                    className="preview-skill-item"
                    style={{
                      cursor: 'pointer',
                      transition:
                        'transform 0.2s, border-color 0.2s, background-color 0.2s',
                      border: `2px solid ${isSelected ? '#facc15' : 'rgba(250, 204, 21, 0.1)'}`,
                      backgroundColor: isSelected
                        ? 'rgba(250, 204, 21, 0.1)'
                        : 'transparent',
                      borderRadius: '8px',
                      padding: '10px',
                    }}
                    onClick={() => {
                      playSound?.(SOUNDS?.seClick);
                      setSkillChoiceData((prev) => {
                        let newIndices = [...prev.selectedIndices];
                        if (newIndices.includes(idx)) {
                          // すでに選択されていれば解除
                          newIndices = newIndices.filter((i) => i !== idx);
                        } else {
                          if (prev.maxChoices === 1) {
                            // maxChoicesが1なら、前に選んだものを上書きしてこれだけにする
                            newIndices = [idx];
                          } else if (newIndices.length < prev.maxChoices) {
                            newIndices.push(idx);
                          }
                        }
                        return { ...prev, selectedIndices: newIndices };
                      });
                    }}
                    onMouseOver={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'scale(1.02)';
                        e.currentTarget.style.borderColor = '#facc15';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.borderColor =
                          'rgba(250, 204, 21, 0.1)';
                      }
                    }}
                  >
                    <div
                      className="preview-skill-badge"
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '8px',
                        margin: '0 auto 10px auto',
                        width: 'fit-content',
                        minWidth: '120px',
                      }}
                    >
                      {skillDef.icon} {skillDef.name} {val}
                    </div>
                    <p
                      className="preview-skill-desc"
                      style={{
                        textAlign: 'center',
                        margin: 0,
                        fontSize: '0.85rem',
                      }}
                    >
                      {(() => {
                        const rawDesc =
                          typeof skillDef.desc === 'function'
                            ? skillDef.desc(sk.value, sk)
                            : skillDef.desc;
                        if (Array.isArray(rawDesc)) {
                          return rawDesc.map((part, i) => {
                            if (part.type === 'link') {
                              return (
                                <span
                                  key={i}
                                  style={{
                                    color: '#60a5fa',
                                    textDecoration: 'underline',
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playSound?.(SOUNDS?.seClick);
                                    const tObj = CARD_MASTER.find(
                                      (c) => c.id === part.targetId
                                    );
                                    if (tObj)
                                      setCardPreviewData({ card: tObj });
                                  }}
                                >
                                  {part.value}
                                </span>
                              );
                            }
                            return <span key={i}>{part.value}</span>;
                          });
                        }
                        return rawDesc;
                      })()}
                    </p>
                  </div>
                );
              })}
            </div>
            <button
              className="btn ok-button"
              style={{
                marginTop: '20px',
                width: '100%',
                background:
                  skillChoiceData.selectedIndices.length ===
                  Math.min(
                    skillChoiceData.maxChoices,
                    skillChoiceData.choices.length
                  )
                    ? 'linear-gradient(45deg, #10b981, #059669)'
                    : '#475569',
                color:
                  skillChoiceData.selectedIndices.length ===
                  Math.min(
                    skillChoiceData.maxChoices,
                    skillChoiceData.choices.length
                  )
                    ? '#fff'
                    : '#94a3b8',
                pointerEvents:
                  skillChoiceData.selectedIndices.length ===
                  Math.min(
                    skillChoiceData.maxChoices,
                    skillChoiceData.choices.length
                  )
                    ? 'auto'
                    : 'none',
                flexShrink: 0,
              }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                const selectedSkills = skillChoiceData.selectedIndices.map(
                  (i) => skillChoiceData.choices[i]
                );
                const { onSelect } = skillChoiceData;
                setSkillChoiceData(null);
                if (onSelect) onSelect(selectedSkills);
              }}
            >
              決定
            </button>
          </div>
        </div>
      )}

      {/* Discard Selection Modal */}
      {discardSelectionData && (
        <div
          className="modal-overlay"
          style={{ zIndex: 3500, display: 'flex' }}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{ width: '95%', maxWidth: '440px', padding: '20px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#facc15', marginBottom: '10px' }}>
              {discardSelectionData.isViewOnly
                ? '墓地一覧'
                : discardSelectionData.title || '復活させるカードを選択'}
            </h2>
            {!discardSelectionData.isViewOnly && (
              <p
                style={{
                  color: '#cbd5e1',
                  fontSize: '0.85rem',
                  marginBottom: '15px',
                }}
              >
                {discardSelectionData.desc ||
                  `パワー${discardSelectionData.maxPow}以下のカードを1枚場に出します。`}
              </p>
            )}
            {discardSelectionData.isDual && (
              <div
                style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}
              >
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    margin: 0,
                    padding: '8px',
                    background:
                      discardSelectionData.currentTab === 'blue'
                        ? 'linear-gradient(45deg, #38bdf8, #0284c7)'
                        : '#475569',
                  }}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    setDiscardSelectionData((prev) => ({
                      ...prev,
                      currentTab: 'blue',
                    }));
                  }}
                >
                  自分の墓地
                </button>
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    margin: 0,
                    padding: '8px',
                    background:
                      discardSelectionData.currentTab === 'red'
                        ? 'linear-gradient(45deg, #ef4444, #b91c1c)'
                        : '#475569',
                  }}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    setDiscardSelectionData((prev) => ({
                      ...prev,
                      currentTab: 'red',
                    }));
                  }}
                >
                  相手の墓地
                </button>
              </div>
            )}
            <div
              className="card-list-container"
              style={{ maxHeight: '50vh', overflowY: 'auto' }}
            >
              <div id="gallery-card-grid" className="card-list-grid-3col">
                {(() => {
                  const currentCards =
                    discardSelectionData.isDual &&
                    discardSelectionData.currentTab === 'red'
                      ? discardSelectionData.redCards
                      : discardSelectionData.cards;
                  const isMulti = discardSelectionData.maxChoices > 1;

                  return (
                    <>
                      {currentCards.map((cardItem, idx) => {
                        const imgUrl = getCardImgUrl
                          ? getCardImgUrl(cardItem)
                          : '';
                        const rarityClass = cardItem.rarity
                          ? ` rarity-${cardItem.rarity}`
                          : '';

                        let isSelected = false;
                        if (isMulti) {
                          const itemKey = `${discardSelectionData.currentTab}_${cardItem.uid || cardItem.id}_${idx}`;
                          isSelected = discardSelectionData.selectedItems.some(
                            (item) => item.key === itemKey
                          );
                        } else {
                          isSelected =
                            discardSelectionData.selectedIndex === idx &&
                            (!discardSelectionData.isDual ||
                              discardSelectionData.currentTab === 'blue');
                        }

                        return (
                          <div
                            key={idx}
                            className="deck-card-item gallery-card-wrapper"
                            onPointerDown={(e) => {
                              if (e.pointerType === 'mouse' && e.button !== 0)
                                return;
                              discardHasLongPressedRef.current = false;
                              discardLongPressTimerRef.current = setTimeout(
                                () => {
                                  discardHasLongPressedRef.current = true;
                                  setCardPreviewData({ card: cardItem });
                                },
                                600
                              );
                            }}
                            onPointerUp={() => {
                              if (discardLongPressTimerRef.current)
                                clearTimeout(discardLongPressTimerRef.current);
                            }}
                            onPointerLeave={() => {
                              if (discardLongPressTimerRef.current)
                                clearTimeout(discardLongPressTimerRef.current);
                            }}
                            onPointerCancel={() => {
                              if (discardLongPressTimerRef.current)
                                clearTimeout(discardLongPressTimerRef.current);
                            }}
                            onContextMenu={(e) => e.preventDefault()}
                            onClick={() => {
                              if (discardHasLongPressedRef.current) return;
                              playSound?.(SOUNDS?.seClick);
                              if (discardSelectionData.isViewOnly) {
                                setCardPreviewData({ card: cardItem });
                                return;
                              }
                              // 選択状態をセットする
                              if (isMulti) {
                                const itemKey = `${discardSelectionData.currentTab}_${cardItem.uid || cardItem.id}_${idx}`;
                                setDiscardSelectionData((prev) => {
                                  let newSelected = [...prev.selectedItems];
                                  const existingIdx = newSelected.findIndex(
                                    (item) => item.key === itemKey
                                  );
                                  if (existingIdx >= 0) {
                                    newSelected.splice(existingIdx, 1);
                                  } else if (
                                    newSelected.length < prev.maxChoices
                                  ) {
                                    newSelected.push({
                                      key: itemKey,
                                      tab: prev.currentTab,
                                      card: cardItem,
                                      idx,
                                    });
                                  }
                                  return {
                                    ...prev,
                                    selectedItems: newSelected,
                                  };
                                });
                              } else {
                                setDiscardSelectionData((prev) => ({
                                  ...prev,
                                  selectedIndex: idx,
                                }));
                              }
                            }}
                            style={{
                              cursor: 'pointer',
                              transition: 'transform 0.2s',
                              flexShrink: 0,
                              minWidth: '90px',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            <div
                              className={`card ${discardSelectionData.isDual && discardSelectionData.currentTab === 'red' ? 'red' : 'blue'}${rarityClass}`}
                              style={{
                                transition: 'box-shadow 0.2s',
                                boxShadow: isSelected
                                  ? '0 0 15px 5px #facc15'
                                  : cardItem.rarity >= 3
                                    ? '0 0 10px rgba(255, 215, 0, 0.5)'
                                    : 'none',
                              }}
                            >
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
                                {cardItem.power}
                              </div>
                              {renderSkillTagReact(cardItem)}
                            </div>
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: '#fff',
                                textAlign: 'center',
                                marginTop: '4px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {cardItem.name}
                            </div>
                          </div>
                        );
                      })}
                      {currentCards.length === 0 && (
                        <div
                          style={{
                            gridColumn: '1 / -1',
                            color: '#94a3b8',
                            textAlign: 'center',
                            padding: '20px',
                          }}
                        >
                          墓地にはカードがありません
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            {/* 閲覧モーダルでない場合は決定ボタンを表示 */}
            {!discardSelectionData.isViewOnly &&
              (() => {
                const isMulti = discardSelectionData.maxChoices > 1;
                const canSubmit = isMulti
                  ? true
                  : discardSelectionData.selectedIndex != null;
                const btnColor = canSubmit
                  ? 'linear-gradient(45deg, #10b981, #059669)'
                  : '#475569';
                const btnTextColor = canSubmit ? '#fff' : '#94a3b8';

                return (
                  <button
                    className="btn ok-button"
                    style={{
                      marginTop: '15px',
                      width: '100%',
                      background: btnColor,
                      color: btnTextColor,
                      pointerEvents: canSubmit ? 'auto' : 'none',
                    }}
                    onClick={() => {
                      playSound?.(SOUNDS?.seClick);

                      let result = null;
                      const isMulti = discardSelectionData.maxChoices > 1;
                      if (isMulti) {
                        result = discardSelectionData.selectedItems.map(
                          (item) => ({ ...item.card, fromTab: item.tab })
                        );
                      } else {
                        result =
                          discardSelectionData.cards[
                            discardSelectionData.selectedIndex
                          ];
                      }

                      // チュートリアルのフィルタリング
                      if (
                        !isMulti &&
                        result &&
                        filterDiscardSelectionSubmit(result.baseId || result.id)
                      ) {
                        return;
                      }

                      const cb = discardSelectionData.onSelect;
                      setDiscardSelectionData(null);
                      if (cb) cb(result);
                    }}
                  >
                    {isMulti
                      ? `決定 (${discardSelectionData.selectedItems.length}/${discardSelectionData.maxChoices})`
                      : '決定'}
                  </button>
                );
              })()}
            {!discardSelectionData.isViewOnly &&
              discardSelectionData.canCancel !== false && (
                <button
                  className="btn"
                  style={{
                    marginTop: '10px',
                    width: '100%',
                    background: '#475569',
                  }}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    if (filterDiscardSelectionSubmit(null)) return;

                    const cb = discardSelectionData.onSelect;
                    setDiscardSelectionData(null);
                    if (cb) cb(null);
                  }}
                >
                  キャンセル
                </button>
              )}
            {discardSelectionData.isViewOnly && (
              <button
                className="btn"
                style={{
                  marginTop: '10px',
                  width: '100%',
                  background: '#475569',
                }}
                onClick={() => {
                  setDiscardSelectionData(null);
                }}
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {rulesVisible && (
        <div
          id="modal-rules"
          className="rules-modal-overlay"
          style={{
            display: 'flex',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.85)',
            zIndex: 5000,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            setRulesVisible(false);
          }}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{ width: '90%', maxWidth: '400px', padding: '25px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#facc15', marginBottom: '20px' }}>ルール</h2>
            <div className="rule-box" style={{ maxHeight: '350px' }}>
              <div className="rule-section">
                <div className="rule-category">【デッキ編成】</div>
                <ul>
                  <li>デッキに同じカードは4枚まで入れられます。</li>
                </ul>
              </div>
              <div className="rule-section">
                <div className="rule-category">【バトル】</div>
                <ul>
                  <li>
                    毎ターン、手札から1枚を自分のレーンに召喚します。
                    <span style={{ color: '#94a3b8' }}>
                      （先攻1ターン目は中央のみ）
                    </span>
                  </li>
                  <li>置き直しの場合、下のカードは破棄されます。</li>
                  <li>
                    <b>ターン開始時</b>に、場のカードが一斉に正面へ<b>攻撃</b>
                    します。
                  </li>
                  <li>
                    正面に敵がいれば戦闘となり、お互いにパワー分ダメージを与えます。
                  </li>
                  <li>正面が空いていれば相手リーダーに直接ダメージ！</li>
                  <li>相手リーダーのHPを0にすれば勝利です。</li>
                  <li>
                    山札が0枚になると墓地から補充されますが、ペナルティとして
                    <b>体力が半分（切り上げ）になるダメージ</b>を受けます。
                  </li>
                </ul>
              </div>
              <div className="rule-section">
                <div className="rule-category">【リーダースキル】</div>
                <ul>
                  <li>
                    毎ターン「SP」が溜まります。
                    <span style={{ color: '#94a3b8' }}>
                      （先攻1ターン目は溜まりません）
                    </span>
                  </li>
                  <li>SPがMAXで「リーダースキル」を発動可能！</li>
                </ul>
              </div>
            </div>
            <button
              className="btn"
              style={{ marginTop: '20px', width: '100%' }}
              onClick={() => {
                playSound?.(SOUNDS?.seClick);
                setRulesVisible(false);
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* Simple Image Preview Modal */}
      {simpleImagePreview && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 6000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)',
            cursor: 'pointer',
          }}
          onClick={() => {
            playSound?.(SOUNDS?.seClick);
            setSimpleImagePreview(null);
          }}
        >
          <img
            src={simpleImagePreview}
            style={{
              maxWidth: '95%',
              maxHeight: '95%',
              objectFit: 'contain',
              borderRadius: '12px',
              boxShadow: '0 0 30px rgba(0,0,0,1)',
            }}
            alt="Preview"
            onClick={(e) => {
              e.stopPropagation();
              playSound?.(SOUNDS?.seClick);
              setSimpleImagePreview(null);
            }}
          />
        </div>
      )}

      {/* Profile Modal */}
      {profileModalVisible && (
        <div
          className="modal-overlay"
          style={{ zIndex: 2000, display: 'flex' }}
          onClick={() => setProfileModalVisible(false)}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{
              width: '90%',
              maxWidth: '400px',
              padding: '24px 20px',
              maxHeight: '90dvh',
              overflowY: 'auto',
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              borderRadius: '16px',
              border: '2px solid #334155',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '18px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                color: '#eab308',
                margin: '0',
                fontSize: '1.3rem',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              プロフィール
            </h2>

            {/* アバター & プレイヤー名メイン表示 (横並び) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                width: '100%',
                padding: '4px 0',
              }}
            >
              {/* アイコン（タップで専用アイコンモーダルを起動） */}
              <div
                style={{
                  position: 'relative',
                  width: '76px',
                  height: '76px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setIconSelectModalOpen(true);
                }}
              >
                <img
                  src={appendVersionQuery(
                    [...AVAILABLE_ICONS, ...EXTRA_ICONS].find(
                      (i) => i.id === profileIconInput
                    )?.path || 'assets/icons/icon_player.webp'
                  )}
                  alt="icon"
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
                <img
                  src={appendVersionQuery('assets/icons/iconframe_gold.webp')}
                  alt=""
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    right: '0',
                    background: '#eab308',
                    color: '#0f172a',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    border: '2px solid #1e293b',
                    zIndex: 6,
                  }}
                >
                  📷
                </div>
              </div>

              {/* プレイヤー名（タップで名前入力ダイアログを起動） */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  maxWidth: '220px',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  if (window.showPlayerNameModalState) {
                    window.showPlayerNameModalState((newName) => {
                      if (newName && newName.trim()) {
                        setProfileNameInput(newName.trim());
                      }
                    });
                  }
                }}
              >
                <span
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    wordBreak: 'break-all',
                  }}
                >
                  {profileNameInput || DEFAULT_PLAYER_NAME}
                </span>
                <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>✏️</span>
              </div>
            </div>

            {/* お気に入りカード（下部中央） */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(15, 23, 42, 0.5)',
                padding: '16px 10px',
                borderRadius: '12px',
                border: '1px solid #334155',
              }}
            >
              <span
                style={{
                  fontSize: '0.9rem',
                  color: '#94a3b8',
                  fontWeight: 'bold',
                }}
              >
                お気に入りカード
              </span>

              <div
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setFavCardModalOpen(true);
                }}
              >
                <FavoriteCardDisplay
                  favoriteCard={favoriteCardState}
                  placeholderText="タップしてカードを選択"
                />
              </div>
            </div>

            {/* アクションボタン（キャンセル / 保存して閉じる） */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                gap: '12px',
              }}
            >
              <button
                className="btn"
                style={{
                  background: '#475569',
                  margin: 0,
                  flex: 1,
                  maxWidth: '140px',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setProfileModalVisible(false);
                }}
              >
                キャンセル
              </button>
              <button
                className="btn"
                style={{
                  background: 'linear-gradient(45deg, #eab308, #ca8a04)',
                  margin: 0,
                  flex: 1,
                  maxWidth: '160px',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  const trimmed = (profileNameInput || '').trim();
                  if (!trimmed) {
                    showAlertModal?.('プレイヤー名を入力してください。');
                    return;
                  }

                  // 1. ローカルおよびGameStateへの保存
                  saveUserProfile({
                    name: trimmed,
                    icon: profileIconInput,
                    favoriteCard: favoriteCardState,
                  });

                  // 2. サーバーへの同期送信
                  const uuid = getOrCreateUUID();
                  const currentCharId = GameState.playerConfig?.id || null;
                  syncUserProfile(
                    uuid,
                    trimmed,
                    profileIconInput,
                    currentCharId,
                    favoriteCardState
                  ).catch((err) => {
                    console.error('Failed to sync user profile:', err);
                  });

                  setProfileModalVisible(false);
                }}
              >
                保存して閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Icon Selection Modal */}
      {iconSelectModalOpen && (
        <div
          className="modal-overlay"
          style={{ zIndex: 2100, display: 'flex' }}
          onClick={() => setIconSelectModalOpen(false)}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{
              width: '95%',
              maxWidth: '400px',
              padding: '20px',
              background: '#1e293b',
              borderRadius: '16px',
              border: '2px solid #334155',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                color: '#eab308',
                margin: '0 0 15px 0',
                fontSize: '1.15rem',
                textAlign: 'center',
              }}
            >
              アイコン選択
            </h3>

            <div
              className="profile-icon-grid"
              style={{ maxHeight: '260px', overflowY: 'auto' }}
            >
              {[
                ...AVAILABLE_ICONS,
                ...EXTRA_ICONS.filter((extra) =>
                  (GameState.unlockedIcons || []).includes(extra.id)
                ),
              ].map((icon) => (
                <div
                  key={icon.id}
                  className={`profile-icon-item${profileIconInput === icon.id ? ' selected' : ''}`}
                  style={{ position: 'relative' }}
                  onClick={() => {
                    playSound?.(SOUNDS?.seClick);
                    setProfileIconInput(icon.id);
                    setIconSelectModalOpen(false);
                  }}
                  title={icon.name}
                >
                  <img src={appendVersionQuery(icon.path)} alt={icon.name} />
                  <img
                    src={appendVersionQuery('assets/icons/iconframe_gold.webp')}
                    alt=""
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      zIndex: 5,
                    }}
                  />
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: '15px',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <button
                className="btn"
                style={{ background: '#475569', margin: 0 }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setIconSelectModalOpen(false);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Favorite Card Selection Modal */}
      {/* お気に入りカード選択モーダル（仮想スクロール＋サムネイル） */}
      <FavoriteCardSelectionModal
        isOpen={favCardModalOpen}
        onClose={() => setFavCardModalOpen(false)}
        favoriteCardState={favoriteCardState}
        setFavoriteCardState={setFavoriteCardState}
        ownedMasterCards={ownedMasterCards}
        favCardPremiumMap={favCardPremiumMap}
        setFavCardPremiumMap={setFavCardPremiumMap}
      />

      {/* 他プレイヤー閲覧専用プロフィールモーダル */}
      {viewProfileData && (
        <div
          className="modal-overlay"
          style={{ zIndex: 2000, display: 'flex' }}
          onClick={() => setViewProfileData(null)}
        >
          <div
            className="skill-modal-box modal-pop-animation"
            style={{
              width: '90%',
              maxWidth: '400px',
              padding: '24px 20px',
              maxHeight: '90dvh',
              overflowY: 'auto',
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              borderRadius: '16px',
              border: '2px solid #334155',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '18px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                color: '#eab308',
                margin: '0',
                fontSize: '1.3rem',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              プロフィール
            </h2>

            {/* アバター & プレイヤー名（横並び・編集不可） */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                width: '100%',
                padding: '4px 0',
              }}
            >
              {/* アイコン */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src={getPlayerIconPath(viewProfileData)}
                  alt="icon"
                  style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    border: '3px solid #eab308',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    objectFit: 'cover',
                  }}
                />
              </div>

              {/* プレイヤー名 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  maxWidth: '220px',
                }}
              >
                <span
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    wordBreak: 'break-all',
                  }}
                >
                  {resolvePlayerName(viewProfileData.name)}
                </span>
              </div>
            </div>

            {/* お気に入りカード（編集不可） */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                background: 'rgba(15, 23, 42, 0.5)',
                padding: '16px 10px',
                borderRadius: '12px',
                border: '1px solid #334155',
              }}
            >
              <span
                style={{
                  fontSize: '0.9rem',
                  color: '#94a3b8',
                  fontWeight: 'bold',
                }}
              >
                お気に入りカード
              </span>

              <FavoriteCardDisplay
                favoriteCard={viewProfileData}
                placeholderText="未設定"
              />
            </div>

            {/* 閉じるボタン */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <button
                className="btn"
                style={{
                  background: 'linear-gradient(45deg, #eab308, #ca8a04)',
                  margin: 0,
                  width: '100%',
                  maxWidth: '180px',
                }}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setViewProfileData(null);
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
