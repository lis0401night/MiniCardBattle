import { useEffect, useState } from 'react';

import BackButton from '../components/BackButton.jsx';
import { GameState } from '../state/gameState.js';
import {
  handleOptionsTitleClick,
  reloadGame,
  resetGameData,
  showSyncDataModal,
  updateVolume,
} from '../services/uiMainCore.js';
import {
  playSound,
  forceSoundReload,
  getOrCreateUUID,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import CreditModal from '../components/common/CreditModal.jsx';
import SerialCodeModal from '../components/common/SerialCodeModal.jsx';
import { showAlertModal } from '../services/uiModals.js';
import { saveDeck } from '../services/deck.js';
import {
  showPlaymatAcquisitionModal,
  showCardAcquisitionModal,
  showPremiumAcquisitionModal,
  showSkinAcquisitionModal,
  showIconAcquisitionModal,
} from '../services/uiGallery.js';

export default function OptionsScreen() {
  const [volume, setVolume] = useState(0.5);
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
          const playmatsSaved = localStorage.getItem(
            'mini_card_battle_owned_playmats'
          );
          let ownedPlaymats = [];
          if (playmatsSaved) {
            try {
              ownedPlaymats = JSON.parse(playmatsSaved);
            } catch {
              ownedPlaymats = [];
            }
          }
          if (!ownedPlaymats.includes(rewardId)) {
            ownedPlaymats.push(rewardId);
          }
          localStorage.setItem(
            'mini_card_battle_owned_playmats',
            JSON.stringify(ownedPlaymats)
          );

          if (typeof saveDeck === 'function') {
            saveDeck();
          }

          setSerialVisible(false);

          if (typeof showPlaymatAcquisitionModal === 'function') {
            showPlaymatAcquisitionModal(rewardName, rewardId);
          }
        } else if (rewardType === 'skin') {
          const skinsSaved = localStorage.getItem(
            'mini_card_battle_unlocked_skins'
          );
          let unlockedSkins = [];
          if (skinsSaved) {
            try {
              unlockedSkins = JSON.parse(skinsSaved);
            } catch {
              unlockedSkins = [];
            }
          }
          if (!unlockedSkins.includes(rewardId)) {
            unlockedSkins.push(rewardId);
          }
          localStorage.setItem(
            'mini_card_battle_unlocked_skins',
            JSON.stringify(unlockedSkins)
          );

          setSerialVisible(false);

          if (typeof showSkinAcquisitionModal === 'function') {
            showSkinAcquisitionModal(rewardName, rewardId);
          }
        } else if (rewardType === 'icon') {
          const iconsSaved = localStorage.getItem(
            'mini_card_battle_unlocked_icons'
          );
          let unlockedIcons = [];
          if (iconsSaved) {
            try {
              unlockedIcons = JSON.parse(iconsSaved);
            } catch {
              unlockedIcons = [];
            }
          }
          if (!unlockedIcons.includes(rewardId)) {
            unlockedIcons.push(rewardId);
          }
          localStorage.setItem(
            'mini_card_battle_unlocked_icons',
            JSON.stringify(unlockedIcons)
          );

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
      if (typeof GameState.gameVolume !== 'undefined') {
        setVolume(GameState.gameVolume);
      }
    };

    syncVolume(); // 初回マウント時同期
    window.addEventListener('optionsOpened', syncVolume); // オプションが開かれる度に再同期
    return () => window.removeEventListener('optionsOpened', syncVolume);
  }, []);

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (typeof updateVolume === 'function') {
      updateVolume(val);
    }
  };

  const handleVolumeChangeComplete = (e) => {
    handleVolumeChange(e);
    // スライダー操作終了時にテスト音を鳴らして音量の変化をフィードバックする
    if (typeof playSound === 'function') {
      playSound(SOUNDS.seClick);
    }
  };

  return (
    <div id="screen-options" className="screen active">
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
              marginBottom: '10px',
            }}
          >
            <label
              style={{
                color: '#cbd5e1',
                fontSize: '0.9rem',
                margin: 0,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>🔈</span>
            <input
              type="range"
              id="volume-slider"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              onPointerUp={handleVolumeChangeComplete}
              style={{ flexGrow: 1, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '1.2rem' }}>🔊</span>
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

      <div
        style={{
          padding: '15px 0 20px 0',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          background: 'transparent',
        }}
      >
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
