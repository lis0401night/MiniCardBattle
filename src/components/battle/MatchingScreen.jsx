import { useEffect, useRef, useState } from 'react';
import { GameState } from '../../state/gameState.js';
import {
  CHARACTERS,
  getLeaderDisplayNameInfo,
  getSkinImage,
  toTournamentName,
} from '../../utils/constants/characters.js';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';
import { appendVersionQuery } from '../../utils/constants/config.js';
import {
  getStageBackgroundStyle,
  resolveBattleStageId,
} from '../../utils/constants/stages.js';
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

  // リーダースキン設定時はスキンの二つ名 + スキン対応名（例: ギルドの暗殺者 レダ、暗黒騎士 セレスティア等）を取得
  const playerSkinId =
    GameState.playerSkins?.[player.id] ||
    (player.charId && GameState.playerSkins?.[player.charId]) ||
    player.currentSkin ||
    'default';
  const enemySkinId =
    testEnemySkinId ||
    GameState.enemySkins?.[enemy.id] ||
    (enemy.charId && GameState.enemySkins?.[enemy.charId]) ||
    enemy.currentSkin ||
    enemy.skin ||
    'default';

  // 夢幻の闘技祭（トーナメント）の場合、二つ名＋名前ではなく「アイギス？」「マキナ？」で置き換える
  const isTournament = GameState.gameMode === 'tournament';
  const pData = isTournament
    ? {
        subtitle: '',
        name:
          player.displayName ||
          player.name ||
          (player.charId && CHARACTERS[player.charId]?.name
            ? toTournamentName(CHARACTERS[player.charId].name)
            : 'プレイヤー？'),
        fullName:
          player.displayName ||
          player.name ||
          (player.charId && CHARACTERS[player.charId]?.name
            ? toTournamentName(CHARACTERS[player.charId].name)
            : 'プレイヤー？'),
      }
    : getLeaderDisplayNameInfo(player, playerSkinId);

  const eData = isTournament
    ? {
        subtitle: '',
        name:
          enemy.displayName ||
          enemy.name ||
          (enemy.charId && CHARACTERS[enemy.charId]?.name
            ? toTournamentName(CHARACTERS[enemy.charId].name)
            : '参加者？'),
        fullName:
          enemy.displayName ||
          enemy.name ||
          (enemy.charId && CHARACTERS[enemy.charId]?.name
            ? toTournamentName(CHARACTERS[enemy.charId].name)
            : '参加者？'),
      }
    : getLeaderDisplayNameInfo(enemy, enemySkinId);

  // バトルのステージIDを決定（initBattleStateと同じ共通ロジック）
  const stageId = resolveBattleStageId({
    gameMode: GameState.gameMode,
    selectedStageId: GameState.selectedStageId,
    enemyConfig: enemy,
  });

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
          {eData.subtitle ? (
            <div className="matching-subtitle">{eData.subtitle}</div>
          ) : null}
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
          {pData.subtitle ? (
            <div className="matching-subtitle">{pData.subtitle}</div>
          ) : null}
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
