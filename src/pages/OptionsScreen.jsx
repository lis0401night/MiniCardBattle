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
import { playSound, forceSoundReload } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

export default function OptionsScreen() {
  const [volume, setVolume] = useState(0.5);
  const [creditVisible, setCreditVisible] = useState(false);

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
          marginBottom: '30px',
        }}
      >
        {/* 音量調整 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label
              style={{
                color: '#cbd5e1',
                fontSize: '0.9rem',
                margin: 0
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
                gap: '4px'
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
      {creditVisible && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 5000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
          }}
          onClick={handleCloseCredit}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '360px',
              boxShadow:
                '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                color: '#facc15',
                fontSize: '1.25rem',
                margin: 0,
                textAlign: 'center',
                fontWeight: 'bold',
                borderBottom: '2px solid rgba(250, 204, 21, 0.2)',
                paddingBottom: '10px',
              }}
            >
              クレジット
            </h3>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                color: '#cbd5e1',
                fontSize: '0.85rem',
                lineHeight: '1.5',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    letterSpacing: '1px',
                  }}
                >
                  MiniCardBattle
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  ver0.1.0
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 'bold',
                    color: '#facc15',
                    fontSize: '0.9rem',
                    marginBottom: '4px',
                  }}
                >
                  【音楽・効果音】
                </div>
                <div
                  style={{
                    paddingLeft: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div>・Adobe Firefly</div>
                  <div>・Dan Bosley @daniconshow</div>
                  <div>
                    ・A.I. Sound Stock
                    <br />
                    <span
                      style={{
                        fontSize: '0.75rem',
                        paddingLeft: '10px',
                        display: 'inline-block',
                      }}
                    >
                      <a
                        href="https://ai-sound-stock.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#60a5fa',
                          textDecoration: 'underline',
                        }}
                      >
                        https://ai-sound-stock.com/
                      </a>
                    </span>
                  </div>
                  <div>
                    ・Pixabay
                    <br />
                    <span
                      style={{
                        fontSize: '0.75rem',
                        paddingLeft: '10px',
                        display: 'inline-block',
                      }}
                    >
                      <a
                        href="https://pixabay.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#60a5fa',
                          textDecoration: 'underline',
                        }}
                      >
                        https://pixabay.com
                      </a>
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 'bold',
                    color: '#facc15',
                    fontSize: '0.9rem',
                    marginBottom: '4px',
                  }}
                >
                  【グラフィック】
                </div>
                <div
                  style={{
                    paddingLeft: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div>・Google AI Pro</div>
                  <div>
                    ・ぴぽや
                    <br />
                    <span
                      style={{
                        fontSize: '0.75rem',
                        paddingLeft: '10px',
                        display: 'inline-block',
                      }}
                    >
                      <a
                        href="https://pipoya.net/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#60a5fa',
                          textDecoration: 'underline',
                        }}
                      >
                        https://pipoya.net/
                      </a>
                    </span>
                  </div>
                  <div>
                    ・藤宮翔流のひきだし
                    <br />
                    <span
                      style={{
                        fontSize: '0.75rem',
                        paddingLeft: '10px',
                        display: 'inline-block',
                      }}
                    >
                      <a
                        href="http://game-hikidashi.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#60a5fa',
                          textDecoration: 'underline',
                        }}
                      >
                        http://game-hikidashi.com/
                      </a>
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  marginTop: '10px',
                  borderTop: '1px solid #334155',
                  paddingTop: '10px',
                }}
              >
                © 2026 MiniCardBattle All Rights Reserved.
              </div>
            </div>

            <button
              className="btn"
              style={{
                background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
                width: '100%',
                marginTop: '10px',
                fontSize: '0.95rem',
                padding: '10px 0',
                borderRadius: '8px',
                fontWeight: 'bold',
              }}
              onClick={handleCloseCredit}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
