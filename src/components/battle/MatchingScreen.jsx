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
  TRANSITION_DELAY: 4000,
  FADEOUT_START: 4500,
  DESTROY_DELAY: 5000,
};

export default function MatchingScreen({
  onComplete,
  onFadeOutComplete,
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
    // マウント時にアニメーション開始
    // 少し遅延を入れてから表示クラスを付与
    const t = setTimeout(() => {
      setVisible(true);
      if (typeof playSound === 'function') {
        playSound(SOUNDS.seMatching); // 追加いただいたBGM/SEを再生
      }
    }, TIMING.INITIAL_DELAY);

    // VSロゴのアニメーション（1秒後に開始）に合わせてSEを鳴らす
    const vsTimer = setTimeout(() => {
      if (typeof playSound === 'function') {
        playSound(SOUNDS.seVS);
      }
    }, TIMING.VS_SOUND_DELAY); // css of 1s delay + first 50ms delay

    // 演出終了の少し前（4.0秒時点）で裏側のバトル画面への遷移を開始（チラつき防止のため完全に覆われている間に切り替える）
    const transitionTimer = setTimeout(() => {
      if (onCompleteRef.current) onCompleteRef.current();
    }, TIMING.TRANSITION_DELAY);

    // 4.5秒後に自動でフェードアウトを開始する
    const endTimer = setTimeout(() => {
      setVisible(false);
    }, TIMING.FADEOUT_START);

    // 5.0秒後（0.5秒のフェードアウトアニメーション完了後）にアンマウント用のコールバックを実行
    const destroyTimer = setTimeout(() => {
      if (onFadeOutCompleteRef.current) onFadeOutCompleteRef.current();
    }, TIMING.DESTROY_DELAY);

    return () => {
      clearTimeout(t);
      clearTimeout(vsTimer);
      clearTimeout(transitionTimer);
      clearTimeout(endTimer);
      clearTimeout(destroyTimer);
    };
  }, []);

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
