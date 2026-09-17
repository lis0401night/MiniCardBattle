import {
  hasSkill,
  getSeededRandom,
  matchesCardId,
  matchesCardIds,
  matchesCardKeyword,
  matchesSummonTarget,
  matchesResurrectTarget,
} from '../utils/gameUtils.js';
import { simulateMove } from './ai_normal.js';
import { GameState } from '../state/gameState.js';

/**
 * ミニカードバトル - 敵AIロジック（初級・ランダム版）
 */

/**
 * 初級難易度の意思決定
 * @return {Object} { index, lane, isOverwrite, useSkill }
 */
export function getEasyDecision() {
  // 全ての合法な移動パターンをリストアップ
  const allCandidates = [];
  const handIndices = [...Array(GameState.enemyHand.length).keys(), -1]; // 手札インデックス + パス

  for (let idx of handIndices) {
    const card = idx === -1 ? null : GameState.enemyHand[idx];
    const possibleLanes = [];

    if (idx === -1) {
      possibleLanes.push(-1);
    } else {
      const mySealedLanes = GameState.enemySealedLanes || [0, 0, 0];
      const emptyLanes = [0, 1, 2].filter(
        (l) => GameState.enemyBoard[l] === null && mySealedLanes[l] === 0
      );
      const occupiedLanes = [0, 1, 2].filter(
        (l) => GameState.enemyBoard[l] !== null && mySealedLanes[l] === 0
      );

      let validSpaces = [];
      if (hasSkill(card, 'legendary')) {
        validSpaces = [1].filter((l) => mySealedLanes[l] === 0);
      } else if (hasSkill(card, 'takeover')) {
        validSpaces = [...occupiedLanes];
      } else {
        // 1ターン目の制限 (先攻RED)
        if (GameState.turnCount === 1 && GameState.firstPlayer === 'red') {
          validSpaces = [1].filter((l) => mySealedLanes[l] === 0);
        } else {
          // 空きを優先するが、空きがなければ上書きも候補
          if (emptyLanes.length > 0) {
            validSpaces = [...emptyLanes];
          } else {
            validSpaces = [0, 1, 2].filter((l) => mySealedLanes[l] === 0);
          }
        }
      }

      if (hasSkill(card, 'challenge')) {
        validSpaces = validSpaces.filter(
          (idx) => GameState.playerBoard[idx] !== null
        );
      }

      validSpaces.forEach((l) => possibleLanes.push(l));
    }

    for (let lane of possibleLanes) {
      // シミュレーション実行
      const sim = simulateMove(
        idx,
        lane,
        GameState.enemyHand,
        GameState.enemyBoard,
        GameState.playerBoard,
        GameState.enemyHP,
        false,
        GameState.enemySP
      );
      // simulateMove が無効な結果を返した場合はスキップ
      if (!sim) continue;
      allCandidates.push({
        index: idx,
        lane: lane,
        isOverwrite: lane !== -1 && GameState.enemyBoard[lane] !== null,
        useSkill: false,
        enemyHP: sim.enemyHP,
        playerHP: sim.playerHP,
      });
    }
  }

  // --- 戦略的フィルタリング ---

  // 1. 速攻のリーサル (相手のHPを0にできるなら、それを選択)
  const lethalMoves = allCandidates.filter((c) => c.playerHP <= 0);
  if (lethalMoves.length > 0) {
    console.log('Easy AI: Lethal detected!');
    return lethalMoves[Math.floor(getSeededRandom() * lethalMoves.length)];
  }

  // 2. 自滅回避 (自分のHPが0になる移動を除外)
  // ただし、全ての移動が自滅なら仕方ないのでそのまま
  let safeCandidates = allCandidates.filter((c) => c.enemyHP > 0);
  if (safeCandidates.length === 0) safeCandidates = allCandidates;

  // 3. リーサル回避 (パスをすると自分が死ぬ場合、生き残れる移動を優先)
  const passMove = safeCandidates.find((c) => c.index === -1);
  if (passMove && passMove.enemyHP <= 0) {
    const survivalMoves = safeCandidates.filter((c) => c.enemyHP > 0);
    if (survivalMoves.length > 0) {
      console.log('Easy AI: Survival move prioritized!');
      return survivalMoves[
        Math.floor(getSeededRandom() * survivalMoves.length)
      ];
    }
  }

  // 4. 通常のランダム決定（安全な候補から選択）
  // パス以外の有効な行動（手札を出す）が存在するなら、必ずそれを選択する（手札があるのにパスはしない）
  let playMoves = safeCandidates.filter((c) => c.index !== -1);

  // 【追加】初級AIでも、手札から「虚空（token_void）」を出すことや、
  // パワー0かつ味方不在で出現後即座に自壊するカード（味方不在時のレイジ等）は避ける
  const viablePlayMoves = playMoves.filter((c) => {
    const card = GameState.enemyHand[c.index];
    if (!card) return false;
    if (card.id === 'token_void' || card.baseId === 'token_void') return false;
    // 味方が不在の状況で、出現後即座に自壊して盤面やHPに一切寄与しないカード（味方不在時のレイジ等）は除外
    if (
      !GameState.enemyBoard.some((b) => b !== null) &&
      isImmediatelySelfDestructiveOnPlay(card)
    ) {
      return false;
    }
    return true;
  });

  if (viablePlayMoves.length > 0) {
    playMoves = viablePlayMoves;
  } else {
    // 有効なプレイ候補がない（即自壊するカードしかない）場合は、無駄撃ちを避けてパスする
    playMoves = [];
  }

  if (playMoves.length > 0) {
    return playMoves[Math.floor(getSeededRandom() * playMoves.length)];
  }

  // もし有効な手札プレイがなければ、無駄撃ちを避けてパスを選択する
  const passMoveFinal = safeCandidates.find((c) => c.index === -1);
  if (passMoveFinal) {
    return passMoveFinal;
  }
  return safeCandidates[Math.floor(getSeededRandom() * safeCandidates.length)];
}

/**
 * 味方が不在の盤面でカードを手札からプレイした際、盤面・HP・手札・相手等に有効な効果を及ぼさず
 * 出現後即座に自壊（パワー0破壊ルール等による墓地送り）してしまう無駄なカードであるかを判定する。
 *
 * 【判定ロジック】
 * 1. 元々のパワーが1以上のカードは、ユニットとして盤面に残り戦闘できるため自壊しない（false）。
 * 2. 変身（metamorph）・複製（replicate）・自己強化（self_buff/growth/awake）等により
 *    自身がユニット化またはパワー上昇するカードは自壊しない（false）。
 * 3. パワー0であっても、味方がいない状況で発動して意味のある出現時スキル
 *    （選択肢、トークン配置・召喚、相手直接攻撃・弱体化、プレイヤーHP回復、リソース獲得等）
 *    を1つでも持っているカード（例:「森の祈り」「初級魔術」「ドラゴンファイア」「航空支援」「雷撃」等）は
 *    有効なアクションであるため除外しない（false）。
 * 4. 味方カードが存在して初めて効果を発揮するスキル（鼓舞、味方強化、味方回復、味方加護等）しか持たず、
 *    味方が0体では対象不在で不発となり、即座にパワー0で自壊するカード（例:「レイジ」や「虚空」等）のみ true を返す。
 *
 * @param {Object|null|undefined} card - 判定対象のカードオブジェクト
 * @return {boolean} 味方不在時に即自壊して無駄になるカードであれば true、それ以外は false
 */
export function isImmediatelySelfDestructiveOnPlay(card) {
  if (!card) return false;

  // 元々のパワーが 1 以上のカードはユニットとして盤面に残るため自壊しない
  const originalPower =
    card.basePower !== undefined && card.basePower !== null
      ? card.basePower
      : card.power;
  if ((originalPower || 0) > 0) {
    return false;
  }

  // 自身を変身・複製・強化してユニット化またはパワー上昇するスキルを持つ場合は自壊しない
  if (
    hasSkill(card, 'metamorph') ||
    hasSkill(card, 'replicate') ||
    hasSkill(card, 'self_buff') ||
    hasSkill(card, 'growth') ||
    hasSkill(card, 'awake')
  ) {
    return false;
  }

  // 味方が不在でも盤面・プレイヤーHP・敵盤面・手札等に好影響を及ぼすスキル一覧
  const standaloneBeneficialSkills = [
    'choice', // 選択肢スキル（森の祈り、初級魔術、ドラゴンファイア、聖なるゴブレット等）
    'servant', // 使役（トークン配置）
    'ambush', // 奇襲（トークン配置＋即攻撃）
    'summon', // 召喚（追加ユニット召喚）
    'assemble', // 召集（デッキからの召喚）
    'call', // 号令（デッキトップ召喚）
    'invite', // 招来（同一レーン召喚）
    'clone', // 分身（隣接分身配置）
    'resurrect', // 復活（自墓地配置）
    'puppet', // 傀儡（敵墓地配置）
    'forge', // 鍛造
    'reanimate', // 反魂
    'snipe', // 狙撃（敵ユニット/リーダー直接攻撃）
    'artillery', // 砲撃（全体攻撃）
    'poison', // 毒（敵継続ダメージ）
    'plague', // 疫病（敵弱体化）
    'bind', // 拘束（敵足止め）
    'freeze', // 氷結（敵凍結）
    'silence', // 忘却（正面のカードの全能力無効）
    'curse', // 呪い
    'cull', // 選別（敵破壊）
    'execute', // 処刑（敵破壊）
    'dominate', // 支配（敵強奪）
    'burial', // 埋葬
    'decree', // 布告
    'portent', // 不吉
    'invade', // 侵略
    'heal', // 回復（プレイヤーHP回復）
    'draw', // ドロー
    'charge', // チャージ（SP増加）
    'convert', // 変換
    'explore', // 探索
    'leap', // 跳躍
    'seal', // 封印
  ];

  // 味方不在でも有効な出現時スキルを1つでも所持し、かつ現在の盤面・リソース状態で実際に解決可能であれば自壊（除外）対象としない
  const hasBeneficialSkill = standaloneBeneficialSkills.some(
    (skillId) =>
      hasSkill(card, skillId) &&
      canResolveStandaloneSkill(card, skillId, GameState)
  );
  if (hasBeneficialSkill) {
    return false;
  }

  // choices 配列を直接持っている場合も安全のため除外対象としない
  if (Array.isArray(card.choices) && card.choices.length > 0) {
    return false;
  }

  // 上記のいずれにも該当しないパワー0カード（例: 味方対象の鼓舞しか持たない「レイジ」や「虚空」等）は
  // 味方不在時に出しても即自壊し盤面に何も残らないため true
  return true;
}

/**
 * 単独発動系スキル（号令、召集、召喚、復活、傀儡等）が、現在のゲーム状況において
 * 実際に解決可能（対象となるカードが存在し、不発にならない）かどうかを判定する。
 * 実戦（skillLogic.js）の対象判定条件と同一ロジックで評価する。
 *
 * @param {Object} card - スキルを持つカードオブジェクト
 * @param {string} skillId - 判定対象のスキルID
 * @param {Object} [gameState=GameState] - 現在のゲームステート
 * @return {boolean} スキルが解決可能であれば true、対象不在で不発になる場合は false
 */
export function canResolveStandaloneSkill(
  card,
  skillId,
  gameState = GameState
) {
  if (!card || !skillId) return false;

  const skObj = Array.isArray(card.skills)
    ? card.skills.find((s) =>
        typeof s === 'string' ? s === skillId : s?.id === skillId
      )
    : null;
  const skillValue =
    typeof skObj === 'object' && skObj !== null ? skObj.value : undefined;

  switch (skillId) {
    case 'call': {
      // 号令（デッキトップから召喚）: デッキトップに対象カードが存在するか判定
      const deck = gameState.enemyDeck || [];
      if (deck.length === 0) return false;
      const topCard = deck[deck.length - 1];
      if (!topCard) return false;

      const targetIds = Array.isArray(skObj?.targetIds)
        ? skObj.targetIds
        : skObj?.targetId
          ? [skObj.targetId]
          : [];
      const targetKeyword = skObj?.targetKeyword;

      if (targetIds.length > 0) {
        return matchesCardIds(topCard, targetIds);
      } else if (typeof targetKeyword === 'string' && targetKeyword) {
        return matchesCardKeyword(topCard, targetKeyword);
      } else if (skillValue !== undefined && skillValue !== null) {
        return (topCard.power || 0) <= skillValue;
      }
      return true;
    }

    case 'assemble': {
      // 召集（デッキ内から条件合致カードを召喚）: デッキ内に対象カードが存在するか判定
      const deck = gameState.enemyDeck || [];
      if (deck.length === 0) return false;

      const isSelf = Boolean(skObj?.self || skObj?.targetSelf);
      const selfId = card.baseId || card.id;
      const targetIds = Array.isArray(skObj?.targetIds)
        ? skObj.targetIds
        : skObj?.targetId
          ? [skObj.targetId]
          : [];
      const targetKeyword = skObj?.targetKeyword;

      return deck.some((c) => {
        if (!c) return false;
        if (isSelf && selfId) {
          return matchesCardId(c, selfId);
        } else if (targetIds.length > 0) {
          return matchesCardIds(c, targetIds);
        } else if (typeof targetKeyword === 'string' && targetKeyword) {
          return matchesCardKeyword(c, targetKeyword);
        } else if (skillValue !== undefined && skillValue !== null) {
          return (c.power || 0) <= skillValue;
        }
        return true;
      });
    }

    case 'summon': {
      // 召喚（手札から条件合致カードを召喚）: 自分以外の手札に対象カードが存在するか判定
      const hand = gameState.enemyHand || [];
      const selfId = card.baseId || card.id;
      const presentBoardIds = (gameState.enemyBoard || [])
        .filter(Boolean)
        .flatMap((c) => [c.id, c.baseId])
        .filter(Boolean);

      return hand.some((hCard) => {
        if (!hCard || hCard === card) return false;
        return matchesSummonTarget(hCard, skObj || { id: 'summon' }, {
          selfId,
          presentBoardIds,
        });
      });
    }

    case 'resurrect': {
      // 復活（自墓地からカードを配置）: 自分の墓地に有効な対象カードが存在するか判定
      const discard = gameState.enemyDiscard || [];
      if (discard.length === 0) return false;

      const presentBoardIds = (gameState.enemyBoard || [])
        .filter(Boolean)
        .flatMap((c) => [c.id, c.baseId])
        .filter(Boolean);

      return discard.some((dCard) =>
        matchesResurrectTarget(dCard, skObj || { id: 'resurrect' }, {
          presentBoardIds,
        })
      );
    }

    case 'puppet': {
      // 傀儡（相手墓地からカードを配置）: 相手の墓地に有効な対象カードが存在するか判定
      const oppDiscard = gameState.playerDiscard || [];
      if (oppDiscard.length === 0) return false;

      const maxPow =
        skillValue !== undefined && skillValue !== null ? skillValue : 1;
      return oppDiscard.some(
        (c) => c && !c.isToken && (c.power || 0) <= maxPow
      );
    }

    default:
      // その他のスキル（選択肢、使役、奇襲、分身、回復、狙撃等）は外部カードの存在に依存せず実行可能
      return true;
  }
}
