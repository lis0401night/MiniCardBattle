import { CARD_MASTER } from '../utils/constants/cards.js';
import { getSkinImage } from '../utils/constants/characters.js';
import { playCardVoice } from '../utils/constants/voices.js';
import {
  getCardImgUrl,
  getDialogue,
  getSeededRandom,
  hasSkill,
  mergeCardSkills,
  playSound,
  sleep,
  triggerGraveKeeperEffect,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  checkWinCondition,
  cleanupDestroyedCards,
  discardCard,
  drawCard,
  endTurnLogic,
  hasActiveSkill,
  resolveOnPlaySkill,
  updateDeckDisplay,
  updateSPOrbs,
  waitPlayerDiscardSelection,
  waitPlayerEnemyLaneSelection,
  waitPlayerHandSelection,
  waitPlayerLaneSelection,
} from './battle.js';
import { applyLeaderSkillLogic, processDestructionTriggers } from './engine.js';
import { playEvents } from './eventRenderer.js';
import { GameState } from './gameState.js';
import { renderBoard, renderHand, updateCardDetail } from './uiBattle.js';

// ==========================================
// リーダースキルの実行ロジック
// ==========================================

export async function activateLeaderSkill(
  owner,
  tokenLanes = null,
  forcedTargetIdx = null,
  forcedTargetUid = null
) {
  if (GameState.isBattleEnded) return;
  const isBlue = owner === 'blue';
  const sp = isBlue ? GameState.playerSP : GameState.enemySP;
  const config = isBlue ? GameState.playerConfig : GameState.enemyConfig;
  if (!config.leaderSkill.cost || sp < config.leaderSkill.cost) return;

  const prevProc = GameState.isProcessing;
  GameState.isProcessing = true;
  GameState.selectedCardIndex = null;

  const action = config.leaderSkill.action;

  // SP消費
  if (isBlue) GameState.playerSP -= config.leaderSkill.cost;
  else GameState.enemySP -= config.leaderSkill.cost;
  updateSPOrbs(owner);

  // 演出
  playSound(SOUNDS.seLegend);
  await showLeaderSkillCutin(config, isBlue, owner);

  // スキル効果の実行
  await executeLeaderSkillAction(
    owner,
    action,
    isBlue,
    config,
    tokenLanes,
    forcedTargetIdx,
    forcedTargetUid
  );

  if (checkWinCondition()) return;

  // 盤面が一杯かつ手札も無空で、スキルも使えない場合のオートスキップ（プレイヤーのみ）
  // 手札がある場合は上書き配置が可能なため、勝手に終了させない
  if (
    isBlue &&
    GameState.playerBoard.every((c) => c !== null) &&
    GameState.playerHand.length === 0 &&
    (!GameState.playerConfig.leaderSkill.cost ||
      GameState.playerSP < GameState.playerConfig.leaderSkill.cost)
  ) {
    const st = document.getElementById('turn-status');
    st.innerText = 'BOARD FULL - AUTO SKIP';
    st.style.color = '#94a3b8';
    GameState.isProcessing = true;
    setTimeout(() => {
      GameState.selectedCardIndex = null;
      updateCardDetail(null);
      renderHand();
      renderBoard();
      endTurnLogic('blue');
    }, 1500);
    return;
  }

  GameState.isProcessing = prevProc;
}

export async function showLeaderSkillCutin(config, isBlue, owner) {
  if (window.showCutinReact) {
    window.showCutinReact(config, isBlue);
    const bId = owner === 'blue' ? 'player-speech' : 'enemy-speech';
    const b = document.getElementById(bId);
    if (b) {
      const skillMsg = getDialogue(
        config,
        null,
        'skill',
        owner === 'blue' ? 'player' : 'enemy'
      );
      if (skillMsg && skillMsg !== '...') {
        b.innerText = skillMsg;
        b.classList.add('active');
      }
    }
    await sleep(2500);
    if (b) b.classList.remove('active');
    return;
  }

  const cutin = document.getElementById('screen-cutin');
  const cImg = document.getElementById('cutin-char-img');
  const cTxt = document.getElementById('cutin-text');
  const cBg = document.getElementById('cutin-bg');

  const imgSrc = isBlue
    ? getSkinImage(config, GameState.playerSkins[config.id], 'image')
    : getSkinImage(config, GameState.enemySkins?.[config.id], 'image');

  if (imgSrc) {
    cImg.src = imgSrc;
  } else {
    cImg.removeAttribute('src');
  }
  cTxt.innerHTML = `${config.leaderSkill.name}!!`;

  if (isBlue) {
    cTxt.style.color = '#fff';
    cTxt.style.textShadow = '0 0 20px #38bdf8, 3px 3px 0 #000';
    cBg.style.background =
      'linear-gradient(90deg, transparent, #38bdf8, transparent)';
  } else {
    cTxt.style.color = '#ff0000';
    cTxt.style.textShadow = '0 0 20px #000, 3px 3px 0 #fff';
    cBg.style.background =
      'linear-gradient(90deg, transparent, #ef4444, transparent)';
  }

  cutin.style.display = 'flex';
  cImg.style.animation = 'none';
  cTxt.style.animation = 'none';
  cImg.offsetHeight; // リフロー強制
  cImg.style.animation = 'slideIn 2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards';
  cTxt.style.animation = 'textPop 2s ease forwards';

  const bId = owner === 'blue' ? 'player-speech' : 'enemy-speech';
  const b = document.getElementById(bId);
  if (b) {
    const skillMsg = getDialogue(
      config,
      null,
      'skill',
      owner === 'blue' ? 'player' : 'enemy'
    );
    if (skillMsg && skillMsg !== '...') {
      b.innerText = skillMsg;
      b.classList.add('active');
    }
  }

  await sleep(2500);
  cutin.style.display = 'none';
  if (b) b.classList.remove('active');
}

export async function executeLeaderSkillAction(
  owner,
  action,
  isBlue,
  config,
  tokenLanes = null,
  forcedTargetIdx = null,
  forcedTargetUid = null
) {
  let events = [];

  // UIの介入（対象の選択等）が必要なスキルは事前に処理
  if (
    action === 'satan_avatar' ||
    action === 'dragon_summon' ||
    action === 'dragon_high_ritual'
  ) {
    const tS = CARD_MASTER.find((m) => m.id === 'token_satan');
    const tI = CARD_MASTER.find((m) => m.id === 'token_ignis');
    const token = action === 'satan_avatar' ? tS : tI;
    const selectedLanes = await waitPlayerLaneSelection(
      1,
      owner,
      token,
      true,
      tokenLanes,
      false
    );
    if (selectedLanes.length === 0) return; // キャンセルされた場合
    tokenLanes = selectedLanes;
  } else if (action === 'dungeon_summon_leader') {
    const config =
      owner === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
    const b = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const tokenCard = CARD_MASTER.find((m) => m.id === config.leaderCardId);
    const selectedLanes = await waitPlayerLaneSelection(
      1,
      owner,
      tokenCard,
      true,
      tokenLanes,
      true,
      '召喚終了'
    );
    if (selectedLanes.length === 0) return;
    if (selectedLanes.length > 0) {
      const l = selectedLanes[0];
      const imgUrl =
        getCardImgUrl({ ...tokenCard, owner }) ||
        `assets/cards/card_${tokenCard.id}.jpg`;

      if (
        b[l] &&
        (hasSkill(tokenCard, 'equip') || hasSkill(b[l], 'arm_self'))
      ) {
        const targetCard = b[l];
        targetCard.basePower =
          (targetCard.basePower || 0) + (tokenCard.power || 0);
        targetCard.currentPower =
          (targetCard.currentPower || 0) + (tokenCard.power || 0);
        if (!targetCard.skills) {
          targetCard.skills =
            targetCard.skill && targetCard.skill !== 'none'
              ? [{ id: targetCard.skill, value: targetCard.skillValue }]
              : [];
          targetCard.skill = 'none';
        }
        const equipSkills = [];
        if (
          tokenCard.skill &&
          tokenCard.skill !== 'none' &&
          tokenCard.skill !== 'equip'
        ) {
          equipSkills.push({
            id: tokenCard.skill,
            value: tokenCard.skillValue,
          });
        }
        if (tokenCard.skills) {
          tokenCard.skills.forEach((s) => {
            if (s.id !== 'equip') equipSkills.push(s);
          });
        }
        mergeCardSkills(targetCard, equipSkills);

        events.push({ type: 'leader_skill', skill: action, side: owner });
        events.push({
          type: 'summon_card',
          side: owner,
          lane: l,
          card: targetCard,
          source: 'equip',
        });
        // 召喚扱いではないためアクティブスキルは発動させない
        targetCard.skillTriggered = true;

        // リーダースキルで生成した装備カードを対象にアタッチ
        const eqToken = JSON.parse(JSON.stringify(tokenCard));
        eqToken.uid = `eq_dng_${Math.floor(getSeededRandom() * 1000000000)}`;
        eqToken.owner = owner;
        targetCard.equippedCards = targetCard.equippedCards || [];
        targetCard.equippedCards.push(eqToken);

        if (tokenCard?.voiceCategory)
          playCardVoice(tokenCard.voiceCategory, 'play');
      } else {
        if (b[l]) {
          await discardCard(owner, b[l], l);
        }
        b[l] = {
          id: `dng_tk_${Math.floor(getSeededRandom() * 1000000000)}`,
          owner,
          ...tokenCard,
          imgUrl,
          filter: 'none',
          currentPower: tokenCard.power,
          rarity: tokenCard.rarity || 1,
        };
        b[l].skillTriggered = false; // 召喚時スキルがあれば発動させるため

        // Add custom summon event to play correct standard visualizer pipeline
        events.push({ type: 'leader_skill', skill: action, side: owner });
        events.push({
          type: 'summon_card',
          side: owner,
          lane: l,
          card: b[l],
          source: 'dungeon_summon_leader',
        });
      }
    }
  } else if (action === 'night_parade') {
    if (!tokenLanes || tokenLanes.length === 0) {
      const selectedEnemyLanes = await waitPlayerEnemyLaneSelection(
        2,
        owner,
        true,
        '封印する相手のレーンを2つまで選んでください',
        true
      );
      if (selectedEnemyLanes === null) return;
      const tSoul = CARD_MASTER.find((m) => m.id === 'token_soul');
      const selectedAlliedLanes = await waitPlayerLaneSelection(
        2,
        owner,
        tSoul,
        false,
        null,
        false,
        '配置終了'
      );
      if (selectedAlliedLanes === null) return;
      tokenLanes = { enemy: selectedEnemyLanes, allied: selectedAlliedLanes };
    }
  } else if (action === 'seal_lanes') {
    if (!tokenLanes || tokenLanes.length === 0) {
      const selectedLanes = await waitPlayerEnemyLaneSelection(
        2,
        owner,
        true,
        '相手のレーンを2つまで選んでください',
        true
      );
      if (selectedLanes.length === 0) return;
      tokenLanes = selectedLanes;
    }
  } else if (action === 'holy_march' || action === 'evil_march') {
    const tK = CARD_MASTER.find((m) => m.id === 'token_knight');
    const selectedLanes = await waitPlayerLaneSelection(
      2,
      owner,
      tK,
      true,
      tokenLanes,
      false
    );
    tokenLanes = selectedLanes;
  } else if (action === 'targeted_destruction' || action === 'tomb_guard') {
    if (!tokenLanes || tokenLanes.length === 0) {
      const oppBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;
      const hasEnemyCard = oppBoard.some((c) => c !== null);

      if (hasEnemyCard) {
        const message =
          action === 'tomb_guard'
            ? 'ダメージを与える相手のカードを1枚選んでください'
            : '破壊する相手のカードを1枚選んでください';
        const selectedLanes = await waitPlayerEnemyLaneSelection(
          1,
          owner,
          true,
          message
        );
        if (selectedLanes.length === 0) return;
        tokenLanes = selectedLanes;
      } else if (action === 'tomb_guard') {
        // tomb_guard は相手のカードがいなくてもデッキ破壊効果だけ発動できる
        tokenLanes = [];
      } else {
        return; // targeted_destruction は対象がいないと発動不可
      }
    }
  } else if (action === 'elf_polarbear_combo') {
    if (!tokenLanes || tokenLanes.length === 0) {
      // パート1: 破壊する相手カードを1枚選択
      const oppBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;
      let enemyTargetLane = -1;
      const hasEnemyCard = oppBoard.some((c) => c !== null);
      if (hasEnemyCard) {
        const selectedLanes = await waitPlayerEnemyLaneSelection(
          1,
          owner,
          true,
          '破壊する相手のカードを1枚選んでください'
        );
        if (selectedLanes.length === 0) return;
        enemyTargetLane = selectedLanes[0];
      }

      // パート2: ヴォイテクを配置する自分のレーンを選択
      const token = CARD_MASTER.find((m) => m.id === 'token_polarbear');
      const myLanes = await waitPlayerLaneSelection(
        1,
        owner,
        token,
        false,
        null,
        false
      );
      if (!myLanes || myLanes.length === 0) return;

      // tokenLanesには [敵レーン番号, 自分のレーン番号] を格納してengineに渡す
      tokenLanes = [enemyTargetLane, myLanes[0]];
    }
  } else if (action === 'overdrive') {
    if (await triggerGraveKeeperEffect()) return;
    // 【オーバードライブ】自分の墓地・相手の墓地それぞれから1枚ずつ自分のレーンに配置する
    // 処理はデvilhunter_resurrect を2回実行する形と等価。
    // パート1: 自分の墓地から選ぶ
    const myDiscard = isBlue ? GameState.playerDiscard : GameState.enemyDiscard;
    const oppDiscard = isBlue
      ? GameState.enemyDiscard
      : GameState.playerDiscard;
    const board = isBlue ? GameState.playerBoard : GameState.enemyBoard;

    // isOppDiscard: 相手の墓地から取得する場合はtrue（破壊時の墓地返却先を制御するため）
    const performResurrect = async (
      discard,
      srcLabel,
      isOppDiscard = false
    ) => {
      const validCards = discard.filter((c) => !c.isToken);
      if (validCards.length === 0) return;

      const selectedCard = await waitPlayerDiscardSelection(
        validCards,
        999,
        owner,
        `${srcLabel}からカードを選択`,
        'カードを1枚自分のレーンに出します。'
      );
      if (!selectedCard) return;

      // AI の場合: aiDecision.tokenLanes から配置先を取得（フリーズ防止）
      // tokenLanes は配列なので shift で1つずつ消費する
      let predefinedLanes = null;
      if (
        owner === 'red' &&
        GameState.aiDecision &&
        Array.isArray(GameState.aiDecision.tokenLanes) &&
        GameState.aiDecision.tokenLanes.length > 0
      ) {
        predefinedLanes = [GameState.aiDecision.tokenLanes.shift()];
      }
      const tLanes = await waitPlayerLaneSelection(
        1,
        owner,
        selectedCard,
        false,
        predefinedLanes,
        false
      );
      if (!tLanes || tLanes.length === 0) return;

      const actualIdx = discard.indexOf(selectedCard);
      if (actualIdx !== -1) discard.splice(actualIdx, 1);
      updateDeckDisplay(owner);

      const targetLane = tLanes[0];
      tokenLanes = tLanes; // VFX用
      const existingCard = board[targetLane];
      const isEquip =
        existingCard &&
        (hasSkill(selectedCard, 'equip') || hasSkill(existingCard, 'arm_self'));
      const unionSkill =
        selectedCard.skills &&
        selectedCard.skills.find((s) => s.id === 'union');
      const isUnion =
        unionSkill &&
        existingCard &&
        (existingCard.baseId === unionSkill.targetId ||
          existingCard.id === unionSkill.targetId);

      if (isUnion) {
        const combineId = unionSkill.summonId;
        const masterData = CARD_MASTER.find((c) => c.id === combineId);
        const resurrectedCard = JSON.parse(JSON.stringify(masterData));
        resurrectedCard.uid = `ls_od_un_${Math.floor(getSeededRandom() * 1000000000)}`;
        resurrectedCard.owner = owner;
        resurrectedCard.baseId = resurrectedCard.id;
        resurrectedCard.basePower = resurrectedCard.power;
        resurrectedCard.currentPower = resurrectedCard.power;
        resurrectedCard.unionMaterials = [existingCard, selectedCard];
        resurrectedCard.skillTriggered = true;
        resurrectedCard.stunTurns = 0;
        resurrectedCard.stunAppliedThisTurn = false;
        board[targetLane] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: resurrectedCard,
          source: 'union',
        });
      } else if (isEquip) {
        const targetCard = board[targetLane];
        targetCard.power = (targetCard.power || 0) + (selectedCard.power || 0);
        targetCard.basePower =
          (targetCard.basePower || 0) + (selectedCard.power || 0);
        const equipSkills = [];
        if (
          selectedCard.skill &&
          selectedCard.skill !== 'none' &&
          selectedCard.skill !== 'equip'
        ) {
          equipSkills.push({
            id: selectedCard.skill,
            value: selectedCard.skillValue,
          });
        }
        if (selectedCard.skills)
          selectedCard.skills.forEach((s) => {
            if (s.id !== 'equip') equipSkills.push(s);
          });
        mergeCardSkills(targetCard, equipSkills);
        targetCard.equippedCards = targetCard.equippedCards || [];
        targetCard.equippedCards.push(selectedCard);
        if (selectedCard?.voiceCategory)
          playCardVoice(selectedCard.voiceCategory, 'play');
        renderBoard();
        events.push({
          type: 'power_change',
          side: owner,
          lane: targetLane,
          amount: selectedCard.power,
          source: 'equip',
        });
      } else {
        const resurrectedCard = {
          ...selectedCard,
          id: `od_${Math.floor(getSeededRandom() * 1000000000)}`,
          uid: `ls_od_uid_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: selectedCard.baseId || selectedCard.id,
        };
        resurrectedCard.currentPower = resurrectedCard.power;
        resurrectedCard.skillTriggered = true; // 配置のため召喚時効果は不発
        resurrectedCard.stunTurns = 0;
        resurrectedCard.stunAppliedThisTurn = false;
        // 【傀儡と同じ処理】相手墓地から取ったカードは、破壊時に元の持ち主（相手）の墓地へ返却する
        const oppOwner = owner === 'blue' ? 'red' : 'blue';
        if (isOppDiscard) resurrectedCard.puppetOriginalOwner = oppOwner;
        if (existingCard) await discardCard(owner, existingCard, targetLane);
        board[targetLane] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: resurrectedCard,
          source: 'devilhunter_resurrect',
        });
        renderBoard();
      }

      // VFX
      if (window.triggerVfx && tLanes.length > 0) {
        await sleep(200);
        await window.triggerVfx('anm_summon_maria', owner, tLanes[0]);
      }
    };

    // パート1: 自分の墓地から（isOppDiscard=false）
    await performResurrect(myDiscard, '自分の墓地', false);
    // パート2: 相手の墓地から（isOppDiscard=true → 破壊時に自分の墓地へ戻す）
    await performResurrect(oppDiscard, '相手の墓地', true);
    // overdrive は手動でイベント処理済みのため、Engine呼び出しをスキップする
  } else if (action === 'devilhunter_resurrect') {
    if (await triggerGraveKeeperEffect()) return;
    const maxPow = 999;
    const discard = isBlue ? GameState.playerDiscard : GameState.enemyDiscard;
    const validCards = discard.filter((c) => !c.isToken);
    const board = isBlue ? GameState.playerBoard : GameState.enemyBoard;

    if (validCards.length > 0) {
      let selectedCard;
      // 【重要】UID優先照合（復活スキルと同じ形式）
      // シミュレーション中に墓地構成が変わりインデックスがずれても、UIDで正しいカードを特定する
      if (forcedTargetUid) {
        selectedCard = discard.find(
          (c) =>
            c &&
            !c.isToken &&
            (c.baseId === forcedTargetUid || c.id === forcedTargetUid)
        );
      }
      // フォールバック: インデックス指定
      if (
        !selectedCard &&
        forcedTargetIdx !== null &&
        discard[forcedTargetIdx] &&
        !discard[forcedTargetIdx].isToken
      ) {
        selectedCard = discard[forcedTargetIdx];
      }
      // プレイヤーの場合: 手動選択
      if (!selectedCard) {
        selectedCard = await waitPlayerDiscardSelection(
          validCards,
          maxPow,
          owner,
          '復活させるカードを選択',
          'カードを1枚場に出します。'
        );
      }
      if (!selectedCard) return;

      // 復活させる対象を engine に伝えるために無理くり渡しちゃうか、UI介入でここまで決まったら
      // 配置レーンも決めます。
      const tLanes = await waitPlayerLaneSelection(
        1,
        owner,
        selectedCard,
        false,
        tokenLanes,
        false
      );
      if (!tLanes || tLanes.length === 0) return;

      // Engine側へ伝えるための事前準備（引数だけでは足りないので、Engineが拾えるように選択カード情報を付与するか、ここでやってしまうか）
      // この蘇生アクションは UI 依存度が高すぎるため、蘇生処理の解決だけは部分的に残しつつ engineの枠組みに乗せる。
      // 状態への手動反映
      const actualIdx = discard.indexOf(selectedCard);
      if (actualIdx !== -1) discard.splice(actualIdx, 1);
      updateDeckDisplay(owner);

      const targetLane = tLanes[0];
      tokenLanes = tLanes; // VFXセクションで参照できるように代入
      const existingCard = board[targetLane];
      const unionSkill =
        selectedCard.skills &&
        selectedCard.skills.find((s) => s.id === 'union');
      const isUnion =
        unionSkill &&
        existingCard &&
        (existingCard.baseId === unionSkill.targetId ||
          existingCard.id === unionSkill.targetId);

      const isEquip =
        existingCard &&
        (hasSkill(selectedCard, 'equip') || hasSkill(existingCard, 'arm_self'));
      let resurrectedCard;
      if (isUnion) {
        const combineId = unionSkill.summonId;
        const masterData = CARD_MASTER.find((c) => c.id === combineId);
        resurrectedCard = JSON.parse(JSON.stringify(masterData));
        resurrectedCard.uid = `ls_un_${Math.floor(getSeededRandom() * 1000000000)}`;
        resurrectedCard.owner = owner;
        resurrectedCard.baseId = resurrectedCard.id;
        resurrectedCard.basePower = resurrectedCard.power;
        resurrectedCard.currentPower = resurrectedCard.power;
        resurrectedCard.unionMaterials = [existingCard, selectedCard];
        resurrectedCard.skillTriggered = true; // 配置（復活）からの合体のため召喚時効果は不発
        resurrectedCard.stunTurns = 0;
        resurrectedCard.stunAppliedThisTurn = false;
        board[targetLane] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: resurrectedCard,
          source: 'union',
        });
      } else if (isEquip) {
        // 装備（既存カードの上へ）
        const targetCard = board[targetLane];
        targetCard.power = (targetCard.power || 0) + (selectedCard.power || 0);
        targetCard.basePower =
          (targetCard.basePower || 0) + (selectedCard.power || 0);

        const equipSkills = [];
        if (
          selectedCard.skill &&
          selectedCard.skill !== 'none' &&
          selectedCard.skill !== 'equip'
        ) {
          equipSkills.push({
            id: selectedCard.skill,
            value: selectedCard.skillValue,
          });
        }
        if (selectedCard.skills) {
          selectedCard.skills.forEach((s) => {
            if (s.id !== 'equip') equipSkills.push(s);
          });
        }
        mergeCardSkills(targetCard, equipSkills);

        targetCard.equippedCards = targetCard.equippedCards || [];
        targetCard.equippedCards.push(selectedCard);

        if (selectedCard?.voiceCategory)
          playCardVoice(selectedCard.voiceCategory, 'play');
        renderBoard(); // 反映を確実にする
        events.push({
          type: 'power_change',
          side: owner,
          lane: targetLane,
          amount: selectedCard.power,
          source: 'equip',
        });
        resurrectedCard = targetCard; // 後のスキル解決フラグ用
      } else {
        resurrectedCard = {
          ...selectedCard,
          id: `res_${Math.floor(getSeededRandom() * 1000000000)}`,
          uid: `ls_res_uid_${Math.floor(getSeededRandom() * 1000000000)}`,
          baseId: selectedCard.baseId || selectedCard.id,
        };
        resurrectedCard.currentPower = resurrectedCard.power;
        resurrectedCard.skillTriggered = true; // 召喚時効果は不発
        resurrectedCard.stunTurns = 0;
        resurrectedCard.stunAppliedThisTurn = false;

        // 既存のカードがあれば破棄する（UNION/EQUIPでない場合）
        if (existingCard) {
          await discardCard(owner, existingCard, targetLane);
        }
        board[targetLane] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: resurrectedCard,
          source: 'devilhunter_resurrect',
        });
        renderBoard(); // 反映を確実にする
      }
    } else {
      return; // 復活対象や空きがない
    }
  } else if (action === 'abyss_ritual') {
    // engineにabyss_ritualは未実装だったため、ここで同等に処理しeventsにプッシュします。
    const h = isBlue ? GameState.playerHand : GameState.enemyHand;
    let dc = 0;
    if (h.length > 0) {
      const selectedIndices = await waitPlayerHandSelection(2, owner);

      // 手札選択完了後にVFXを再生
      if (window.triggerVfx) {
        await window.triggerVfx('anm_abyss_ritual', owner);
      }

      // キャンセル(選ばずに完了)した場合でも、手札破棄が0枚になるだけで、後続の全体バフは発動させます
      if (selectedIndices && selectedIndices.length > 0) {
        selectedIndices.sort((a, b) => b - a);
        for (let i of selectedIndices) {
          await discardCard(owner, h.splice(i, 1)[0]);
          dc++;
        }
      }

      for (let i = 0; i < dc; i++) drawCard(owner);
    }

    events.push({ type: 'leader_skill', skill: action, side: owner });
    h.forEach((c) => {
      c.power += 1;
      c.currentPower += 1;
    });
    if (isBlue) renderHand();
    // フォールスルーして共通の playEvents と resolveOnPlaySkill を実行させる
  } else if (action === 'otherworld_gate') {
    const h = isBlue ? GameState.playerHand : GameState.enemyHand;
    const opH = isBlue ? GameState.enemyHand : GameState.playerHand;
    const opId = isBlue ? 'red' : 'blue';
    let dc = 0;

    if (h.length > 0) {
      const selectedIndices = await waitPlayerHandSelection(
        2,
        owner,
        false,
        '捨てるカードを最大2枚選んでください'
      );

      if (window.triggerVfx) {
        await window.triggerVfx('anm_abyss_ritual', owner);
      }

      if (selectedIndices && selectedIndices.length > 0) {
        selectedIndices.sort((a, b) => b - a);
        for (let i of selectedIndices) {
          await discardCard(owner, h.splice(i, 1)[0]);
          dc++;
        }
      }

      for (let i = 0; i < dc; i++) drawCard(owner);
    }

    events.push({ type: 'leader_skill', skill: action, side: owner });
    h.forEach((c) => {
      if (c.currentPower !== undefined) c.currentPower += 2;
      else c.power += 2;
    });

    let opDc = 0;
    for (let i = 0; i < 2; i++) {
      if (opH.length > 0) {
        const randIdx = Math.floor(getSeededRandom() * opH.length);
        const discarded = opH.splice(randIdx, 1)[0];
        await discardCard(opId, discarded, undefined, false);
        opDc++;
      }
    }

    if (opDc > 0) {
      const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
        id: 'token_void',
        name: '虚空',
        power: 0,
      };
      for (let i = 0; i < opDc; i++) {
        opH.push({
          ...voidTpl,
          uid: `${opId}_void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
          owner: opId,
          baseId: 'token_void',
          isToken: true,
          currentPower: voidTpl.power ?? 0,
        });
      }
    }
    renderHand();
  }

  // Engineの共通ロジック呼び出し
  // 上のif文でeventsを手動構築したもの (abyss_ritual, devilhunter_resurrect, overdrive, dungeon_summon_leader) 以外を実行
  const currentState = {
    playerBoard: GameState.playerBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    enemyBoard: GameState.enemyBoard.map((c) =>
      c ? JSON.parse(JSON.stringify(c)) : null
    ),
    playerHP: GameState.playerHP,
    enemyHP: GameState.enemyHP,
    playerMaxHP: GameState.playerMaxHP,
    enemyMaxHP: GameState.enemyMaxHP,
    playerSP: GameState.playerSP,
    enemySP: GameState.enemySP,
    playerHand: JSON.parse(JSON.stringify(GameState.playerHand)),
    enemyHand: JSON.parse(JSON.stringify(GameState.enemyHand)),
    playerDeck: JSON.parse(JSON.stringify(GameState.playerDeck || [])),
    enemyDeck: JSON.parse(JSON.stringify(GameState.enemyDeck || [])),
    playerDiscard: JSON.parse(JSON.stringify(GameState.playerDiscard || [])),
    enemyDiscard: JSON.parse(JSON.stringify(GameState.enemyDiscard || [])),
    playerSealedLanes: [...(GameState.playerSealedLanes || [0, 0, 0])],
    enemySealedLanes: [...(GameState.enemySealedLanes || [0, 0, 0])],
  };

  if (
    action !== 'devilhunter_resurrect' &&
    action !== 'abyss_ritual' &&
    action !== 'otherworld_gate' &&
    action !== 'overdrive' &&
    action !== 'dungeon_summon_leader'
  ) {
    // targeted_destruction のためだけに Engine 側を少し書き換える必要があるので、シミュレートできるように引数 tokenLanes に対象レーンを渡す
    // が、Engineを再書き換えするよりは、直接ここから applyLeaderSkillLogic を呼ぶ
    applyLeaderSkillLogic(currentState, owner, action, tokenLanes, events);
    // リーダースキルによるダメージ・破壊を処理し、分裂等の誘発効果をイベントに積む
    processDestructionTriggers(currentState, events);

    if (currentState.extraTurnCount) {
      GameState.extraTurnCount = currentState.extraTurnCount;
    }
    if (currentState.attackSkipCount) {
      GameState.attackSkipCount = currentState.attackSkipCount;
    }

    // 封印状態の同期
    GameState.playerSealedLanes = currentState.playerSealedLanes;
    GameState.enemySealedLanes = currentState.enemySealedLanes;

    // world_reconstruct: 手札・デッキ・墓地がengine側で変更されるためGameStateに書き戻す
    if (action === 'world_reconstruct') {
      GameState.playerHand = currentState.playerHand;
      GameState.enemyHand = currentState.enemyHand;
      GameState.playerDeck = currentState.playerDeck;
      GameState.enemyDeck = currentState.enemyDeck;
      GameState.playerDiscard = currentState.playerDiscard;
      GameState.enemyDiscard = currentState.enemyDiscard;
    }
  }

  // 専用のVFX演出を再生
  if (window.triggerVfx) {
    if (action === 'annihilation' || action === 'android_high_volley') {
      await sleep(200);
      await window.triggerVfx('anm_android_arts', owner);
    } else if (action === 'time_stop' || action === 'world_reconstruct') {
      await sleep(200);
      await window.triggerVfx('anm_witch_arts', owner);
    } else if (
      action === 'targeted_destruction' &&
      tokenLanes &&
      tokenLanes.length > 0
    ) {
      await sleep(200);
      await window.triggerVfx('anm_elf_arts', owner, tokenLanes[0]);
    } else if (action === 'tomb_guard' && tokenLanes && tokenLanes.length > 0) {
      await sleep(200);
      await window.triggerVfx('anm_dark_magic', owner, tokenLanes[0]);
    } else if (
      (action === 'dragon_summon' || action === 'dragon_high_ritual') &&
      tokenLanes &&
      tokenLanes.length > 0
    ) {
      await sleep(200);
      await window.triggerVfx('anm_summon_ignis', owner, tokenLanes[0]);
    } else if (action === 'elf_polarbear_combo') {
      await sleep(200);
      if (tokenLanes && tokenLanes[0] >= 0) {
        // 破壊エフェクト
        await window.triggerVfx('anm_elf_arts', owner, tokenLanes[0]);
      }
      await sleep(200);
      // 召喚エフェクト
    } else if (
      (action === 'holy_march' || action === 'evil_march') &&
      tokenLanes &&
      tokenLanes.length > 0
    ) {
      await sleep(200);
      // 2箇所同時に再生
      await Promise.all(
        tokenLanes.map((lane) =>
          window.triggerVfx('anm_summon_celestia', owner, lane)
        )
      );
    } else if (
      action === 'devilhunter_resurrect' &&
      tokenLanes &&
      tokenLanes.length > 0
    ) {
      await sleep(200);
      await window.triggerVfx('anm_summon_maria', owner, tokenLanes[0]);
    } else if (action === 'dark_ritual' || action === 'condemnation') {
      await sleep(200);
      await window.triggerVfx('anm_dark_ritual', owner);
    } else if (action === 'seal_lanes' && tokenLanes && tokenLanes.length > 0) {
      await sleep(200);
      await Promise.all(
        tokenLanes.map((lane) =>
          window.triggerVfx('anm_seal_lanes', owner, lane)
        )
      );
    } else if (action === 'night_parade' && tokenLanes && tokenLanes.enemy) {
      await sleep(200);
      await Promise.all(
        tokenLanes.enemy.map((lane) =>
          window.triggerVfx('anm_seal_lanes', owner, lane)
        )
      );
    }
  }

  // イベントログを再生（再生中にGameStateと描画が逐次更新される）
  // dragon_summon: イグニストークンのimgUrlを現在設定中のスキンに合わせて書き換える
  // （engine.jsは純粋関数のためGameStateにアクセスできないため、ここでパッチする）
  if (action === 'dragon_summon') {
    const skinId = isBlue
      ? GameState.playerSkins?.[config.id] || 'default'
      : GameState.enemySkins?.[config.id] || 'default';
    const skinImg = getSkinImage(config, skinId, 'image');
    events.forEach((ev) => {
      if (
        ev.type === 'summon_token' &&
        ev.card &&
        ev.card.id &&
        ev.card.id.startsWith('tk_')
      ) {
        ev.card.imgUrl = skinImg || ev.card.imgUrl;
      }
    });
    // GameState.playerBoard / enemyBoard 上の実態も同期する
    const targetBoard =
      owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    targetBoard.forEach((c) => {
      if (
        c &&
        c.id &&
        c.id.startsWith('tk_') &&
        (c.baseId === 'token_ignis' || c.name === 'イグニス')
      ) {
        c.imgUrl = skinImg || c.imgUrl;
      }
    });
  }

  await playEvents(events);
  // リーダースキルによる演出が完了したので、配置したカードの保護フラグを解除
  events.forEach((ev) => {
    if ((ev.type === 'summon_token' || ev.type === 'summon_card') && ev.card) {
      ev.card.isSkillResolving = false;
    }
  });

  // 再描画
  renderBoard();

  // 召喚時スキル（アクティブスキル）を持つカードが今回召喚されていた場合、事後発動する
  const targetBoard =
    owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
  for (let i = 0; i < 3; i++) {
    const cd = targetBoard[i];
    if (cd && cd.skillTriggered === false) {
      if (hasActiveSkill(cd)) {
        await resolveOnPlaySkill(owner, i, cd);
      } else {
        cd.skillTriggered = true;
      }
    }
  }

  // 最終的にパワー0のカード（復活させたパワー0カード等）を掃除する
  await cleanupDestroyedCards();
}
