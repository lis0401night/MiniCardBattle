import { useEffect, useState } from 'react';

import { goToModeSelect } from '../services/uiMainCore.js';
import { preloadAllGameResources } from '../utils/resourceLoader.js';
import { unlockAudio } from '../utils/sounds.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { getCardImgUrl } from '../utils/gameUtils.js';
import { appendVersionQuery } from '../utils/constants/config.js';

const CARD_ROTATION_INTERVAL_MS = 20000; // カード切り替え間隔（ミリ秒）

export default function TitleScreen() {
  const [isStarting, setIsStarting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [currentCard, setCurrentCard] = useState(null);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // 【タイトル画面カード表示】プレイヤーの所持カードからランダムに選んで10秒ごとに切り替える
    let candidateIds = [];
    try {
      // LocalStorageから所持カード情報を取得
      const invSaved = localStorage.getItem('mini_card_battle_inventory');
      if (invSaved) {
        const inv = JSON.parse(invSaved);
        candidateIds = Object.keys(inv);
      }
    } catch (e) {
      console.error('Failed to parse inventory for title screen', e);
    }

    // 候補カードがない場合はデフォルトカードを使用
    if (!candidateIds || candidateIds.length === 0) {
      candidateIds = ['golem', 'clone', 'sniper'];
    }

    // 候補からランダムにカードを1枚選択する関数
    const getRandomCard = () => {
      const randomId =
        candidateIds[Math.floor(Math.random() * candidateIds.length)];
      return (
        CARD_MASTER.find((c) => c.id === randomId) ||
        CARD_MASTER.find((c) => c.id === 'golem')
      );
    };

    // カード画像のプリロードとフェード切り替えを行う関数
    const selectRandomCard = () => {
      const master = getRandomCard();
      if (master) {
        // 画像のプリロードを行い、読み込み完了後にフェード切り替え
        const imgUrl = getCardImgUrl({ ...master, isPremium: false });
        const img = new Image();
        const updateCard = () => {
          setIsFading(true); // まずフェードアウト開始
          setTimeout(() => {
            setCurrentCard(master); // 完全に透明になったタイミングで中身を切り替え
            setIsFading(false); // フェードイン開始
          }, 500); // 0.5秒かけてフェードアウト
        };
        img.onload = updateCard;
        img.onerror = updateCard;
        img.src = imgUrl;
      }
    };

    // 初回はフェードなしで即座に表示するため、直接セットする
    const initialMaster = getRandomCard();
    if (initialMaster) setCurrentCard(initialMaster);

    const interval = setInterval(() => {
      selectRandomCard();
    }, CARD_ROTATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let unmounted = false;
    preloadAllGameResources((prog) => {
      if (!unmounted) setProgress(prog);
    }).then(() => {
      if (!unmounted) setIsLoading(false);
    });
    return () => {
      unmounted = true;
    };
  }, []);

  const handleStart = () => {
    if (isLoading || isStarting) return;
    setIsStarting(true);

    try {
      if (typeof unlockAudio === 'function') {
        unlockAudio().catch((e) => console.warn(e));
      }
      if (typeof goToModeSelect === 'function') {
        goToModeSelect();
      }
    } catch (e) {
      console.error('Failed to start:', e);
      setIsStarting(false);
    }
  };

  return (
    <div id="screen-title" className="screen active" onClick={handleStart}>
      {!imgError ? (
        <img
          src={
            isLoading
              ? 'assets/ui/title_loading.jpg'
              : appendVersionQuery('assets/ui/title_img.jpg')
          }
          alt="Key Visual"
          className="title-visual"
          onError={() => setImgError(true)}
        />
      ) : (
        <h1 className="game-title">
          LANE
          <br />
          DEFENDERS
        </h1>
      )}

      {isLoading ? (
        <div
          className="start-text"
          style={{
            fontSize: '1rem',
            color: '#ccc',
            animation: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '15px',
          }}
        >
          {currentCard && (
            <div
              style={{
                marginBottom: '10px',
                textAlign: 'center',
                transform: 'translateY(-30px)',
                transition: 'opacity 0.5s ease-in-out',
                opacity: isFading ? 0 : 1,
              }}
            >
              <img
                src={getCardImgUrl({ ...currentCard, isPremium: false })}
                alt={currentCard.name}
                style={{
                  width: '240px',
                  height: '336px',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  boxShadow: '0 8px 16px rgba(0,0,0,0.6)',
                  border: '2px solid rgba(255,255,255,0.2)',
                }}
              />
              <div
                style={{
                  marginTop: '10px',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  color: '#fff',
                  textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                }}
              >
                {currentCard.name}
              </div>
              <div
                style={{
                  marginTop: '5px',
                  fontSize: '0.9rem',
                  color: '#cbd5e1',
                  maxWidth: '300px',
                  margin: '5px auto 0',
                  lineHeight: '1.5',
                  fontStyle: 'italic',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                }}
              >
                {currentCard.flavor}
              </div>
            </div>
          )}

          <div>Now Loading... {progress}%</div>
          <div
            style={{
              width: '200px',
              height: '4px',
              background: '#334155',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: '#38bdf8',
                transition: 'width 0.2s',
              }}
            ></div>
          </div>
        </div>
      ) : (
        <div className="start-text">TAP TO START</div>
      )}
    </div>
  );
}
