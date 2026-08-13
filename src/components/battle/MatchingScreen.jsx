import { useEffect, useRef, useState } from 'react';
import { GameState } from '../../state/gameState.js';
import { CHARACTERS, getSkinImage } from '../../utils/constants/characters.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import {
  getStageBackgroundStyle,
  appendVersionQuery,
} from '../../utils/constants/config.js';
import './MatchingScreen.css';

const TIMING = {
  INITIAL_DELAY: 50,
  VS_SOUND_DELAY: 1050,
  MIN_PRESENTATION_TIME: 2500, // 最低保証演出時間（2.5秒）
};

/**
 * VSマッチング演出コンポーネント。
 * アセットロードが100%完了し、かつ最低演出時間が経過するまで画面を全画面で保持し、
 * ロード完了と同時に対戦画面へスムーズにフェードアウト遷移する。
 */
export default function MatchingScreen({
  onComplete,
  onFadeOutComplete,
  loadingPromise,
  testEnemyId,
  testEnemySkinId,
}) {
  const [visible, setVisible] = useState(false);
  const onCompleteRef = useRef(onComplete);
  const onFadeOutCompleteRef = useRef(onFadeOutComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onFadeOutCompleteRef.current = onFadeOutComplete;
  }, [onFadeOutComplete]);

  useEffect(() => {
    let isMinTimePassed = false;
    let isLoadFinished = false;
    let isEndingStarted = false;

    // 演出完了と対戦画面へのフェードアウト直接遷移を開始する内部関数
    const tryFinishMatching = () => {
      if (isEndingStarted) return;
      // 最低演出時間の経過とアセットロード完了の両方が揃った場合のみ進行
      if (isMinTimePassed && isLoadFinished) {
        isEndingStarted = true;

        // バトル初期化と画面切替をトリガー
        if (onCompleteRef.current) onCompleteRef.current();

        // VS画面のフェードアウトを開始
        setVisible(false);

        // フェードアウト完了（0.5秒後）にアンマウント処理を実行
        setTimeout(() => {
          if (onFadeOutCompleteRef.current) onFadeOutCompleteRef.current();
        }, 500);
      }
    };

    // アセットロード完了をPromise経由で検知（レース条件フリー）
    // Promiseはresolve済みでも.then()が確実に実行されるため、
    // MatchingScreenのマウントがロード完了より後でも安全に動作する。
    if (loadingPromise) {
      loadingPromise.then(() => {
        isLoadFinished = true;
        tryFinishMatching();
      });
    }

    // マウント時にアニメーション開始
    const t = setTimeout(() => {
      setVisible(true);
      if (typeof playSound === 'function') {
        playSound(SOUNDS.seMatching);
      }
    }, TIMING.INITIAL_DELAY);

    // VSロゴのアニメーション（1秒後に開始）に合わせてSEを鳴らす
    const vsTimer = setTimeout(() => {
      if (typeof playSound === 'function') {
        playSound(SOUNDS.seVS);
      }
    }, TIMING.VS_SOUND_DELAY);

    // 最低演出時間（2.5秒）の経過タイマー
    const minTimer = setTimeout(() => {
      isMinTimePassed = true;
      tryFinishMatching();
    }, TIMING.MIN_PRESENTATION_TIME);

    return () => {
      clearTimeout(t);
      clearTimeout(vsTimer);
      clearTimeout(minTimer);
    };
  }, [loadingPromise]);

  // デバッグ用にプレイヤーと敵の情報を取得（未設定の場合はデフォルト）
  const player = GameState.playerConfig || CHARACTERS['dragon'];
  const baseEnemy = testEnemyId
    ? CHARACTERS[testEnemyId]
    : GameState.enemyConfig || CHARACTERS['android'];

  const enemy = {
    ...baseEnemy,
    image: testEnemySkinId
      ? getSkinImage(baseEnemy, testEnemySkinId, 'image')
      : baseEnemy.image,
    icon: testEnemySkinId
      ? getSkinImage(baseEnemy, testEnemySkinId, 'icon')
      : baseEnemy.icon,
  };

  // 「肩書 名前」から分離するヘルパー
  const parseName = (fullName) => {
    if (!fullName) return { subtitle: '不明', name: 'Unknown' };
    const parts = fullName.split(' ');
    if (parts.length >= 2) {
      return { subtitle: parts[0], name: parts.slice(1).join(' ') };
    }
    // スペースがない場合は汎用テキスト
    return { subtitle: 'チャレンジャー', name: fullName };
  };

  const pData = parseName(player.name);
  const eData = parseName(enemy.name);

  // バトルのステージIDを決定（initBattleStateと同じロジック）
  const stageId =
    GameState.gameMode === 'story'
      ? enemy.stageId || 'android'
      : GameState.selectedStageId ||
        enemy.stageId ||
        enemy.id.replace('_high', '') ||
        'android';

  return (
    <div className={`matching-screen-container ${visible ? 'show' : ''}`}>
      {/* 背景（全体） */}
      <div
        className="matching-bg"
        style={{
          ...getStageBackgroundStyle(stageId),
          filter: 'brightness(0.5)', // キャラを目立たせるために少し暗くする
        }}
      ></div>

      {/* 中央の光るライン */}
      <div className="matching-split-line"></div>

      {/* 敵サイド (右上) */}
      <div className="matching-side enemy-side">
        <div className="matching-char-wrapper">
          <img
            src={appendVersionQuery(enemy.image)}
            alt={enemy.name}
            className="matching-char-img"
          />
          <img
            src={appendVersionQuery('assets/ui/chara_frame.png')}
            alt="frame"
            className="matching-char-frame"
          />
        </div>
        <div className="matching-info">
          <div className="matching-subtitle">{eData.subtitle}</div>
          <div className="matching-name-row">
            <span className="matching-name">{eData.name}</span>
          </div>
        </div>
      </div>

      {/* プレイヤーサイド (左下) */}
      <div className="matching-side player-side">
        <div className="matching-char-wrapper">
          <img
            src={appendVersionQuery(player.image)}
            alt={player.name}
            className="matching-char-img"
          />
          <img
            src={appendVersionQuery('assets/ui/chara_frame.png')}
            alt="frame"
            className="matching-char-frame"
          />
        </div>
        <div className="matching-info">
          <div className="matching-subtitle">{pData.subtitle}</div>
          <div className="matching-name-row">
            <span className="matching-name">{pData.name}</span>
          </div>
        </div>
      </div>

      {/* VSロゴ */}
      <img
        src={appendVersionQuery('assets/ui/vs_logo.png')}
        alt="VS"
        className="matching-vs-logo"
      />
    </div>
  );
}
