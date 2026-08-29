import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import CreditModal from '../components/common/CreditModal.jsx';
import SerialCodeModal from '../components/common/SerialCodeModal.jsx';
import { saveDeck } from '../services/deck.js';
import {
  showCardAcquisitionModal,
  showIconAcquisitionModal,
  showPlaymatAcquisitionModal,
  showPremiumAcquisitionModal,
  showSkinAcquisitionModal,
} from '../services/uiGallery.js';
import {
  handleOptionsTitleClick,
  reloadGame,
  resetGameData,
  showSyncDataModal,
  updateBgmMute,
  updateBgmVolume,
  updateSeMute,
  updateSeVolume,
} from '../services/uiMainCore.js';
import { showAlertModal } from '../services/uiModals.js';
import { GameState } from '../state/gameState.js';
import {
  DEFAULT_SOUND_VOLUME,
  OWNED_PLAYMATS_KEY,
  UNLOCKED_ICONS_KEY,
  UNLOCKED_SKINS_KEY,
} from '../utils/constants/config.js';
import { setOwnedPlaymats } from '../utils/constants/playmats.js';
import {
  forceSoundReload,
  getOrCreateUUID,
  playSound,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

function addUnlockedLocalItem(storageKey, rewardId) {
  const saved = localStorage.getItem(storageKey);
  let items = [];
  if (saved) {
    try {
      items = JSON.parse(saved);
    } catch {
      items = [];
    }
  }
  if (!items.includes(rewardId)) {
    items.push(rewardId);
  }
  localStorage.setItem(storageKey, JSON.stringify(items));
  return items;
}

export default function OptionsScreen() {
  const [bgmVolume, setBgmVolume] = useState(DEFAULT_SOUND_VOLUME);
  const [seVolume, setSeVolume] = useState(DEFAULT_SOUND_VOLUME);
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isSeMuted, setIsSeMuted] = useState(false);
  const [creditVisible, setCreditVisible] = useState(false);
  const [serialVisible, setSerialVisible] = useState(false);

  const handleOpenSerial = () => {
    if (typeof playSound === 'function') {
      playSound(SOUNDS.seClick);
    }
    setSerialVisible(true);
  };

  const handleCloseSerial = () => {
    setSerialVisible(false);
  };

  const handleSerialSubmit = async (code) => {
    const formattedCode = code.trim().toUpperCase();

    try {
      const uuid = getOrCreateUUID ? getOrCreateUUID() : null;
      if (!uuid) {
        if (typeof showAlertModal === 'function') {
          showAlertModal('プレイヤーIDが取得できませんでした。');
        }
        return;
      }

      const res = await fetch('api/use_serial_code.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, code: formattedCode }),
      });
      const result = await res.json();

      if (result.success) {
        const rewardId = result.reward;
        const rewardType = result.rewardType || 'premium';
        const rewardName = result.rewardName || '';

        if (rewardType === 'premium') {
          if (!GameState.unlockedPremiumCards) {
            GameState.unlockedPremiumCards = [];
          }
          if (!GameState.unlockedPremiumCards.includes(rewardId)) {
            GameState.unlockedPremiumCards.push(rewardId);
          }

          if (!GameState.premiumCards) {
            GameState.premiumCards = [];
          }
          if (!GameState.premiumCards.includes(rewardId)) {
            GameState.premiumCards.push(rewardId);
          }
          localStorage.setItem(
            'mini_card_battle_premium_cards',
            JSON.stringify(GameState.premiumCards)
          );

          if (typeof saveDeck === 'function') {
            saveDeck();
          }

          setSerialVisible(false);

          if (typeof showPremiumAcquisitionModal === 'function') {
            showPremiumAcquisitionModal(rewardId);
          }
        } else if (rewardType === 'card') {
          if (!GameState.playerInventory) {
            GameState.playerInventory = {};
          }
          GameState.playerInventory[rewardId] =
            (GameState.playerInventory[rewardId] || 0) + 1;

          if (typeof saveDeck === 'function') {
            saveDeck();
          }

          setSerialVisible(false);

          if (typeof showCardAcquisitionModal === 'function') {
            showCardAcquisitionModal(rewardId);
          }
        } else if (rewardType === 'playmat') {
          const ownedPlaymats = addUnlockedLocalItem(
            OWNED_PLAYMATS_KEY,
            rewardId
          );
          if (typeof setOwnedPlaymats === 'function') {
            setOwnedPlaymats(ownedPlaymats);
          }

          if (typeof saveDeck === 'function') {
            saveDeck();
          }

          setSerialVisible(false);

          if (typeof showPlaymatAcquisitionModal === 'function') {
            showPlaymatAcquisitionModal(rewardName, rewardId);
          }
        } else if (rewardType === 'skin') {
          const unlockedSkins = addUnlockedLocalItem(
            UNLOCKED_SKINS_KEY,
            rewardId
          );
          GameState.unlockedSkins = unlockedSkins;

          setSerialVisible(false);

          if (typeof showSkinAcquisitionModal === 'function') {
            showSkinAcquisitionModal(rewardName, rewardId);
          }
        } else if (rewardType === 'icon') {
          const unlockedIcons = addUnlockedLocalItem(
            UNLOCKED_ICONS_KEY,
            rewardId
          );
          GameState.unlockedIcons = unlockedIcons;

          setSerialVisible(false);

          if (typeof showIconAcquisitionModal === 'function') {
            showIconAcquisitionModal(rewardName, rewardId);
          }
        }
      } else {
        if (typeof showAlertModal === 'function') {
          if (result.error === 'already_used') {
            showAlertModal('このシリアルコードはすでに使用されています。');
          } else if (result.error === 'invalid_code') {
            showAlertModal('無効なシリアルコードです。');
          } else if (result.error === 'invalid_format') {
            showAlertModal('シリアルコードの形式が正しくありません。');
          } else {
            showAlertModal('シリアルコードの適用に失敗しました。');
          }
        }
      }
    } catch (e) {
      console.error('Serial Code Error:', e);
      if (typeof showAlertModal === 'function') {
        showAlertModal(
          '通信エラーが発生しました。インターネット接続を確認してください。'
        );
      }
    }
  };

  // クレジット表示時のハンドラ（SE再生）
  const handleOpenCredit = () => {
    if (typeof playSound === 'function') {
      playSound(SOUNDS.seClick);
    }
    setCreditVisible(true);
  };

  // クレジット非表示時のハンドラ（SE再生）
  const handleCloseCredit = () => {
    if (typeof playSound === 'function') {
      playSound(SOUNDS.seClick);
    }
    setCreditVisible(false);
  };

  useEffect(() => {
    const syncVolume = () => {
      if (typeof GameState.bgmVolume !== 'undefined') {
        setBgmVolume(GameState.bgmVolume);
      }
      if (typeof GameState.seVolume !== 'undefined') {
        setSeVolume(GameState.seVolume);
      }
      if (typeof GameState.isBgmMuted !== 'undefined') {
        setIsBgmMuted(GameState.isBgmMuted);
      }
      if (typeof GameState.isSeMuted !== 'undefined') {
        setIsSeMuted(GameState.isSeMuted);
      }
    };

    syncVolume(); // 初回マウント時同期
    window.addEventListener('optionsOpened', syncVolume); // オプションが開かれる度に再同期
    return () => window.removeEventListener('optionsOpened', syncVolume);
  }, []);

  const handleBgmVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setBgmVolume(val);
    if (typeof updateBgmVolume === 'function') {
      updateBgmVolume(val);
    }
  };

  const handleBgmMuteChange = (e) => {
    const checked = e.target.checked;
    setIsBgmMuted(checked);
    if (typeof updateBgmMute === 'function') {
      updateBgmMute(checked);
    }
  };

  const handleSeVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setSeVolume(val);
    if (typeof updateSeVolume === 'function') {
      updateSeVolume(val);
    }
  };

  const handleSeMuteChange = (e) => {
    const checked = e.target.checked;
    setIsSeMuted(checked);
    if (typeof updateSeMute === 'function') {
      updateSeMute(checked);
    }
  };

  const handleSeVolumeChangeComplete = (e) => {
    handleSeVolumeChange(e);
    // スライダー操作終了時にテスト音を鳴らして音量の変化をフィードバックする（ミュート時以外）
    if (!isSeMuted && typeof playSound === 'function') {
      playSound(SOUNDS.seClick);
    }
  };

  return (
    <div
      id="screen-options"
      className="screen active"
      style={{ padding: '20px 0 30px 0', overflowY: 'auto' }}
    >
      <h2
        style={{ color: '#facc15', margin: '20px 0', textAlign: 'center' }}
        onClick={() => handleOptionsTitleClick?.()}
      >
        オプション
      </h2>

      <div
        style={{
          width: '280px',
          background: 'rgba(0,0,0,0.4)',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #334155',
          marginBottom: '20px',
          maxHeight: 'calc(100dvh - 230px)',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* 音量調整 */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <label
              style={{
                color: '#cbd5e1',
                fontSize: '0.9rem',
                margin: 0,
                fontWeight: 'bold',
              }}
            >
              音量調整
            </label>
            <button
              className="btn"
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                background: '#475569',
                margin: 0,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onClick={() => {
                if (typeof forceSoundReload === 'function') {
                  forceSoundReload();
                }
              }}
            >
              <span style={{ fontSize: '0.9rem' }}>🔄</span> サウンド復旧
            </button>
          </div>

          {/* BGM音量スライダー */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                color: '#94a3b8',
                marginBottom: '4px',
              }}
            >
              <span>BGM 音量</span>
              <span>
                {isBgmMuted ? 'ミュート' : `${Math.round(bgmVolume * 100)}%`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.1rem' }}>🎵</span>
              <input
                type="range"
                id="bgm-volume-slider"
                min="0"
                max="1"
                step="0.05"
                value={bgmVolume}
                onChange={handleBgmVolumeChange}
                style={{
                  flexGrow: 1,
                  cursor: 'pointer',
                  opacity: isBgmMuted ? 0.5 : 1,
                }}
              />
              <span style={{ fontSize: '1.1rem' }}>🔊</span>
            </div>
            {/* BGMミュートチェックボックス */}
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <label
                htmlFor="bgm-mute-checkbox"
                style={{
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  id="bgm-mute-checkbox"
                  checked={isBgmMuted}
                  onChange={handleBgmMuteChange}
                  style={{ cursor: 'pointer' }}
                />
                ミュート
              </label>
            </div>
          </div>

          {/* SE音量スライダー */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                color: '#94a3b8',
                marginBottom: '4px',
              }}
            >
              <span>SE 音量</span>
              <span>
                {isSeMuted ? 'ミュート' : `${Math.round(seVolume * 100)}%`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.1rem' }}>💥</span>
              <input
                type="range"
                id="se-volume-slider"
                min="0"
                max="1"
                step="0.05"
                value={seVolume}
                onChange={handleSeVolumeChange}
                onPointerUp={handleSeVolumeChangeComplete}
                style={{
                  flexGrow: 1,
                  cursor: 'pointer',
                  opacity: isSeMuted ? 0.5 : 1,
                }}
              />
              <span style={{ fontSize: '1.1rem' }}>🔊</span>
            </div>
            {/* SEミュートチェックボックス */}
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <label
                htmlFor="se-mute-checkbox"
                style={{
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  id="se-mute-checkbox"
                  checked={isSeMuted}
                  onChange={handleSeMuteChange}
                  style={{ cursor: 'pointer' }}
                />
                ミュート
              </label>
            </div>
          </div>
        </div>

        {/* データ管理 */}
        <div style={{ borderTop: '1px solid #334155', paddingTop: '20px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '10px',
              color: '#cbd5e1',
              fontSize: '0.9rem',
            }}
          >
            データ管理
          </label>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <button
              className="btn"
              style={{
                background: '#475569',
                width: '100%',
                marginTop: '0',
                fontSize: '0.9rem',
              }}
              onClick={() => showSyncDataModal?.()}
            >
              データ連携
            </button>
            <button
              className="btn"
              style={{
                background: '#7f1d1d',
                width: '100%',
                marginTop: '0',
                fontSize: '0.9rem',
              }}
              onClick={() => resetGameData?.()}
            >
              データ削除
            </button>
          </div>
          <p
            style={{
              color: '#64748b',
              fontSize: '0.7rem',
              marginTop: '8px',
              textAlign: 'center',
            }}
          >
            ※デッキと所持カードが初期化されます
          </p>
        </div>

        {/* シリアルコード (データ管理とクレジットの間に追加) */}
        <div
          style={{
            borderTop: '1px solid #334155',
            paddingTop: '20px',
            marginTop: '20px',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '10px',
              color: '#cbd5e1',
              fontSize: '0.9rem',
            }}
          >
            シリアルコード
          </label>
          <button
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              width: '100%',
              marginTop: '0',
              fontSize: '0.9rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
            onClick={handleOpenSerial}
          >
            シリアルコード入力
          </button>
        </div>

        {/* クレジット (データ管理と更新の間に追加) */}
        <div
          style={{
            borderTop: '1px solid #334155',
            paddingTop: '20px',
            marginTop: '20px',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '10px',
              color: '#cbd5e1',
              fontSize: '0.9rem',
            }}
          >
            クレジット
          </label>
          <button
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #475569, #334155)',
              width: '100%',
              marginTop: '0',
              fontSize: '0.9rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
            onClick={handleOpenCredit}
          >
            クレジットを表示
          </button>
        </div>

        {/* 更新 */}
        <div
          style={{
            borderTop: '1px solid #334155',
            paddingTop: '20px',
            marginTop: '20px',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '10px',
              color: '#cbd5e1',
              fontSize: '0.9rem',
            }}
          >
            更新
          </label>
          <button
            className="btn"
            style={{
              background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
              width: '100%',
              marginTop: '0',
              fontSize: '0.9rem',
            }}
            onClick={() => reloadGame?.()}
          >
            更新してタイトルへ
          </button>
        </div>
      </div>

      <div className="back-button-footer">
        <BackButton to="screen-mode-select" style={{ margin: 0 }} />
      </div>

      {/* クレジットモーダル */}
      <CreditModal visible={creditVisible} onClose={handleCloseCredit} />

      {/* シリアルコード入力モーダル */}
      <SerialCodeModal
        visible={serialVisible}
        onClose={handleCloseSerial}
        onSubmit={handleSerialSubmit}
      />
    </div>
  );
}
