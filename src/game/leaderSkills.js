import {
  renderBoard,
  renderHand,
  showSpeechBubble,
  updateCardDetail,
  updateDeckDisplay,
  updateHPBar,
  updateSPOrbs,
} from '../services/uiBattle.js';
import { GameState } from '../state/gameState.js';
import { CARD_MASTER } from '../utils/constants/cards.js';
import { getSkinImage } from '../utils/constants/characters.js';
import {
  AI_THINKING_DURATION,
  VALKYRIA_GUARD_POPUP_COLOR,
} from '../utils/constants/config.js';
import { ACTIVE_SKILLS } from '../utils/constants/skills.js';
import { playCardVoice } from '../utils/constants/voices.js';
import {
  consumeArmSelf,
  createDamagePopup,
  getCardImgUrl,
  getDialogue,
  getSeededRandom,
  hasSkill,
  mergeCardSkills,
  playSound,
  resolveStartupFade,
  sleep,
  createGraveKeeperEvents,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import {
  checkWinCondition,
  cleanupDestroyedCards,
  confirmOverwrittenLane,
  discardCard,
  drawCard,
  endTurnLogic,
  hasActiveSkill,
  resolveOnPlaySkill,
  waitPlayerDiscardSelection,
  waitPlayerEnemyLaneSelection,
  waitPlayerHandSelection,
  waitPlayerLaneSelection,
} from './battle/index.js';
import {
  applyLeaderSkillLogic,
  applySingleCombat,
  isValkyriaGuardActive,
  processDestructionTriggers,
} from './engine.js';
import { playEvents } from './eventRenderer.js';
import { resolveActiveSkillEffect } from './skillLogic.js';

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

  // AI（赤）の場合、シミュレーションで設定されたアクションキューから現在発動するリーダースキルアクションを消費（削除）する
  // これにより、後続の召喚時スキル（号令等）で誤って使い回されることを防ぐ
  if (
    owner === 'red' &&
    GameState.aiDecision &&
    GameState.aiDecision.actionQueue
  ) {
    const q = GameState.aiDecision.actionQueue;
    const idx = q.findIndex((a) => a.type === action);
    if (idx !== -1) {
      q.splice(idx, 1);
    }
  }

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
  // イベント再生中に正しい上書き・墓地送り演出を行うため、発動前の盤面状態を退避
  const savedPlayerBoard = GameState.playerBoard.map((c) =>
    c ? JSON.parse(JSON.stringify(c)) : null
  );
  const savedEnemyBoard = GameState.enemyBoard.map((c) =>
    c ? JSON.parse(JSON.stringify(c)) : null
  );

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
    const checkConstraints = action !== 'dragon_high_ritual';
    let successSatan = false;
    while (!successSatan) {
      const selectedLanes = await waitPlayerLaneSelection(
        1,
        owner,
        token,
        checkConstraints,
        tokenLanes,
        false
      );
      if (!selectedLanes || selectedLanes.length === 0) return; // キャンセルされた場合
      const l = selectedLanes[0];
      const proceed = await confirmOverwrittenLane(owner, token, l);
      if (!proceed) {
        await sleep(200);
        continue;
      }
      tokenLanes = selectedLanes;
      successSatan = true;
    }
  } else if (action === 'dungeon_summon_leader') {
    const config =
      owner === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
    const b = owner === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
    const tokenCard = CARD_MASTER.find((m) => m.id === config.leaderCardId);
    let successDng = false;
    let selectedLanes = null;
    while (!successDng) {
      selectedLanes = await waitPlayerLaneSelection(
        1,
        owner,
        tokenCard,
        true,
        tokenLanes,
        true,
        true,
        '召喚完了'
      );
      if (!selectedLanes || selectedLanes.length === 0) return;
      const l = selectedLanes[0];
      const proceed = await confirmOverwrittenLane(owner, tokenCard, l);
      if (!proceed) {
        await sleep(200);
        continue;
      }
      successDng = true;
    }
    if (selectedLanes.length > 0) {
      const l = selectedLanes[0];
      const imgUrl =
        getCardImgUrl({ ...tokenCard, owner }) ||
        `assets/cards/card_${tokenCard.id}.webp`;

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
          targetCard.skills = [];
        }
        const equipSkills = [];
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

        // 装備カードが持っていたアクティブスキルを即時発動させる
        for (const sk of equipSkills) {
          if (ACTIVE_SKILLS.includes(sk.id)) {
            await sleep(50);
            const enhancedSk = {
              ...sk,
              _sourceChoices: tokenCard.choices,
              _sourceChoices2: tokenCard.choices2,
            };
            await resolveActiveSkillEffect(
              owner,
              l,
              targetCard,
              sk.id,
              sk.value,
              enhancedSk
            );
          }
        }

        // リーダースキルで生成した装備カードを対象にアタッチ
        const eqToken = JSON.parse(JSON.stringify(tokenCard));
        eqToken.uid = `eq_dng_${Math.floor(getSeededRandom() * 1000000000)}`;
        eqToken.owner = owner;
        targetCard.equippedCards = targetCard.equippedCards || [];
        targetCard.equippedCards.push(eqToken);

        // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
        consumeArmSelf(targetCard, tokenCard);

        if (tokenCard) playCardVoice(tokenCard, 'play');
      } else if (b[l] && hasSkill(b[l], 'startup')) {
        // 起動消滅の特別処理
        b[l].skills = b[l].skills.filter(
          (s) => s.id !== 'startup' && s.id !== 'defender'
        );

        events.push({ type: 'leader_skill', skill: action, side: owner });
        const deepClonedToken = JSON.parse(JSON.stringify(tokenCard));
        const deadToken = {
          ...deepClonedToken,
          id: `dng_tk_${Math.floor(getSeededRandom() * 1000000000)}`,
          owner,
          imgUrl,
          filter: 'none',
          currentPower: tokenCard.power,
          rarity: tokenCard.rarity || 1,
          isToken: true,
        };
        resolveStartupFade(owner, b[l], l, deadToken, events);
      } else {
        if (b[l]) {
          await discardCard(owner, b[l], l, false);
        }
        // マスタデータ（CARD_MASTER）のskills配列などの参照汚染を防ぐため、ディープコピーを使用する
        const deepClonedToken = JSON.parse(JSON.stringify(tokenCard));
        b[l] = {
          id: `dng_tk_${Math.floor(getSeededRandom() * 1000000000)}`,
          owner,
          ...deepClonedToken,
          imgUrl,
          filter: 'none',
          currentPower: tokenCard.power,
          rarity: tokenCard.rarity || 1,
          isToken: true, // 破壊時に墓地に行かず消滅するようにトークン属性を付与
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
      let successSoul = false;
      let selectedAlliedLanes = null;
      while (!successSoul) {
        selectedAlliedLanes = await waitPlayerLaneSelection(
          1,
          owner,
          tSoul,
          false,
          null,
          false,
          '配置完了'
        );
        if (selectedAlliedLanes === null) return;
        if (selectedAlliedLanes.length === 0) {
          successSoul = true;
          continue;
        }
        const l = selectedAlliedLanes[0];
        const proceed = await confirmOverwrittenLane(owner, tSoul, l);
        if (!proceed) {
          await sleep(200);
          continue;
        }
        successSoul = true;
      }
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
    if (!selectedLanes) return;
    const validSelectedLanes = [];
    for (const l of selectedLanes) {
      const proceed = await confirmOverwrittenLane(owner, tK, l);
      if (proceed) {
        validSelectedLanes.push(l);
      }
    }
    tokenLanes = validSelectedLanes;
  } else if (
    action === 'targeted_destruction' ||
    action === 'tomb_guard' ||
    action === 'death_judgment'
  ) {
    if (!tokenLanes || tokenLanes.length === 0) {
      const oppBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;
      const hasEnemyCard = oppBoard.some((c) => c !== null);

      if (hasEnemyCard) {
        const message =
          action === 'tomb_guard' || action === 'death_judgment'
            ? 'ダメージを与える相手のカードを1枚選んでください'
            : '破壊する相手のカードを1枚選んでください';
        const selectedLanes = await waitPlayerEnemyLaneSelection(
          1,
          owner,
          true,
          message
        );
        if (selectedLanes.length === 0) {
          if (action === 'tomb_guard' || action === 'death_judgment') {
            // カード未選択でもデッキ破壊効果だけ発動する
            tokenLanes = [];
          } else {
            return; // targeted_destruction はカード未選択で中止
          }
        } else {
          tokenLanes = selectedLanes;
        }
      } else if (action === 'tomb_guard' || action === 'death_judgment') {
        // 相手のカードがいなくてもデッキ破壊効果だけ発動できる
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
      let successBear = false;
      let l = -1;
      while (!successBear) {
        const myLanes = await waitPlayerLaneSelection(
          1,
          owner,
          token,
          false,
          null,
          false
        );
        if (!myLanes) return;
        if (myLanes.length === 0) {
          l = -1;
          successBear = true;
          continue;
        }
        l = myLanes[0];
        const proceed = await confirmOverwrittenLane(owner, token, l);
        if (!proceed) {
          await sleep(200);
          continue;
        }
        successBear = true;
      }

      // tokenLanesには [敵レーン番号, 自分のレーン番号] を格納してengineに渡す
      tokenLanes = [enemyTargetLane, l];
    }
  } else if (action === 'overdrive') {
    const graveEvents = createGraveKeeperEvents(GameState);
    if (graveEvents.length > 0) {
      await playEvents(graveEvents);
      return;
    }
    // 【オーバードライブ】自分の墓地・相手の墓地それぞれから1枚ずつ自分のレーンに配置する
    // 処理はデvilhunter_resurrect を2回実行する形と等価。
    // パート1: 自分の墓地から選ぶ
    const myDiscard = isBlue ? GameState.playerDiscard : GameState.enemyDiscard;
    const oppDiscard = isBlue
      ? GameState.enemyDiscard
      : GameState.playerDiscard;
    const board = isBlue ? GameState.playerBoard : GameState.enemyBoard;

    // isOppDiscard: 相手の墓地から取得する場合はtrue（破壊時の墓地返却先を制御するため）
    // forcedUid: AIがシミュレーションで決定したカードのUID（直接選択用）
    const performResurrect = async (
      discard,
      srcLabel,
      isOppDiscard = false,
      forcedUid = null
    ) => {
      const validCards = discard.filter((c) => !c.isToken);
      if (validCards.length === 0) return;

      let selectedCard = null;

      // AI: シミュレーションで決定したカードをUID優先で直接選択（devilhunter_resurrectと同じ方式）
      if (owner === 'red' && forcedUid) {
        selectedCard = discard.find(
          (c) => c && !c.isToken && c.uid === forcedUid
        );
      }
      // フォールバック: プレイヤー手動選択 / AIランダム選択
      if (!selectedCard) {
        selectedCard = await waitPlayerDiscardSelection(
          validCards,
          999,
          owner,
          `${srcLabel}からカードを選択`,
          'カードを1枚自分のレーンに出します。'
        );
      }
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
      let successOD = false;
      let targetLane = -1;
      let tLanes = null;
      while (!successOD) {
        tLanes = await waitPlayerLaneSelection(
          1,
          owner,
          selectedCard,
          false,
          predefinedLanes,
          false
        );
        if (!tLanes || tLanes.length === 0) return;
        targetLane = tLanes[0];
        const proceed = await confirmOverwrittenLane(
          owner,
          selectedCard,
          targetLane
        );
        if (!proceed) {
          await sleep(200);
          continue;
        }
        successOD = true;
      }

      const actualIdx = discard.indexOf(selectedCard);
      if (actualIdx !== -1) discard.splice(actualIdx, 1);
      updateDeckDisplay(owner);

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

      // VFX（カードが出現する前に演出を再生する）
      if (window.triggerVfx && tLanes.length > 0) {
        if (owner === 'blue') {
          await sleep(200);
          await window.triggerVfx('anm_summon_maria', owner, tLanes[0]);
        } else {
          events.push({
            type: 'vfx_trigger',
            vfxId: 'anm_summon_maria',
            side: owner,
            lane: tLanes[0],
          });
        }
      }

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
        // 【CodeRabbit指摘反映】即時参照される currentPower も同期して更新する
        targetCard.currentPower =
          (targetCard.currentPower || 0) + (selectedCard.power || 0);
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

        // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
        consumeArmSelf(targetCard, selectedCard);
        if (owner === 'blue') renderBoard();
        events.push({
          type: 'power_change',
          side: owner,
          lane: targetLane,
          amount: selectedCard.power,
          source: 'equip',
          card: JSON.parse(JSON.stringify(selectedCard)),
        });
      } else if (existingCard && hasSkill(existingCard, 'startup')) {
        // 配置しようとしていた（復活させた）カードは墓地に戻す
        const discardPile =
          owner === 'blue'
            ? isOppDiscard
              ? GameState.enemyDiscard
              : GameState.playerDiscard
            : isOppDiscard
              ? GameState.playerDiscard
              : GameState.enemyDiscard;
        if (!selectedCard.isToken) {
          discardPile.push(selectedCard);
        }
        resolveStartupFade(
          owner,
          existingCard,
          targetLane,
          JSON.parse(JSON.stringify(selectedCard)),
          events
        );
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
        if (existingCard) {
          await discardCard(owner, existingCard, targetLane, false);
        }
        board[targetLane] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(resurrectedCard)),
          source: 'overdrive',
        });
        if (owner === 'blue') renderBoard();
      }
    };

    // パート1: 自分の墓地から（forcedTargetUidで直接選択）
    await performResurrect(myDiscard, '自分の墓地', false, forcedTargetUid);
    // パート2: 相手の墓地から（aiDecisionの相手墓地ターゲットUIDで直接選択）
    const oppForcedUid =
      owner === 'red' && GameState.aiDecision
        ? GameState.aiDecision.leaderSkillOppTargetUid
        : null;
    await performResurrect(oppDiscard, '相手の墓地', true, oppForcedUid);
    // overdrive は手動でイベント処理済みのため、Engine呼び出しをスキップする
  } else if (action === 'devilhunter_resurrect') {
    const graveEvents = createGraveKeeperEvents(GameState);
    if (graveEvents.length > 0) {
      await playEvents(graveEvents);
      return;
    }
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
          (c) => c && !c.isToken && c.uid === forcedTargetUid
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
          '復活: 配置するカードを選択',
          '自分の墓地からカードを1枚配置します。'
        );
      }
      if (!selectedCard) return;

      // 復活させる対象を engine に伝えるために無理くり渡しちゃうか、UI介入でここまで決まったら
      // 配置レーンも決めます。
      let successMaria = false;
      let targetLane = -1;
      let tLanes = null;
      while (!successMaria) {
        tLanes = await waitPlayerLaneSelection(
          1,
          owner,
          selectedCard,
          false,
          tokenLanes,
          false
        );
        if (!tLanes || tLanes.length === 0) return;
        targetLane = tLanes[0];
        const proceed = await confirmOverwrittenLane(
          owner,
          selectedCard,
          targetLane
        );
        if (!proceed) {
          await sleep(200);
          continue;
        }
        successMaria = true;
      }

      // Engine側へ伝えるための事前準備（引数だけでは足りないので、Engineが拾えるように選択カード情報を付与するか、ここでやってしまうか）
      // この蘇生アクションは UI 依存度が高すぎるため、蘇生処理の解決だけは部分的に残しつつ engineの枠組みに乗せる。
      // 状態への手動反映
      const actualIdx = discard.indexOf(selectedCard);
      if (actualIdx !== -1) discard.splice(actualIdx, 1);
      updateDeckDisplay(owner);

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

      // VFX（カードが出現する前に演出を再生する）
      if (window.triggerVfx && tLanes.length > 0) {
        if (owner === 'blue') {
          await sleep(200);
          await window.triggerVfx('anm_summon_maria', owner, tLanes[0]);
        } else {
          events.push({
            type: 'vfx_trigger',
            vfxId: 'anm_summon_maria',
            side: owner,
            lane: tLanes[0],
          });
        }
      }

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
        // 【CodeRabbit指摘反映】即時参照される currentPower も同期して更新する
        targetCard.currentPower =
          (targetCard.currentPower || 0) + (selectedCard.power || 0);

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

        // 武装（arm_self）の消費処理：重ねるカードが equip を持っておらず、土台が arm_self を持っている場合
        consumeArmSelf(targetCard, selectedCard);

        if (owner === 'blue') renderBoard(); // 反映を確実にする
        events.push({
          type: 'power_change',
          side: owner,
          lane: targetLane,
          amount: selectedCard.power,
          source: 'equip',
          card: JSON.parse(JSON.stringify(selectedCard)),
        });
        resurrectedCard = targetCard; // 後のスキル解決フラグ用
      } else if (existingCard && hasSkill(existingCard, 'startup')) {
        // 配置しようとしていた（復活させた）カードは墓地に戻す
        const discardPile =
          owner === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        if (!selectedCard.isToken) {
          discardPile.push(selectedCard);
        }
        resolveStartupFade(
          owner,
          existingCard,
          targetLane,
          JSON.parse(JSON.stringify(selectedCard)),
          events
        );
        resurrectedCard = existingCard;
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

        if (existingCard) {
          await discardCard(owner, existingCard, targetLane, false);
        }
        board[targetLane] = resurrectedCard;
        events.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(resurrectedCard)),
          source: 'devilhunter_resurrect',
        });
        if (owner === 'blue') renderBoard(); // 反映を確実にする
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
      if (c.currentPower !== undefined && !Number.isNaN(c.currentPower)) {
        c.currentPower += 1;
      } else {
        c.currentPower = c.power + 1;
      }
      c.power += 1;
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
        await Promise.all([
          window.triggerVfx('anm_abyss_ritual', owner),
          window.triggerVfx('anm_abyss_ritual', opId),
        ]);
      }

      if (selectedIndices && selectedIndices.length > 0) {
        selectedIndices.sort((a, b) => b - a);
        for (let i of selectedIndices) {
          await discardCard(owner, h.splice(i, 1)[0]);
          dc++;
        }
      }

      for (let i = 0; i < dc; i++) drawCard(owner);
    } else {
      if (window.triggerVfx) {
        await Promise.all([
          window.triggerVfx('anm_abyss_ritual', owner),
          window.triggerVfx('anm_abyss_ritual', opId),
        ]);
      }
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
  } else if (action === 'void_purge') {
    const h = isBlue ? GameState.playerHand : GameState.enemyHand;
    const opH = isBlue ? GameState.enemyHand : GameState.playerHand;
    const opId = isBlue ? 'red' : 'blue';

    // 1. 自分の手札を3枚捨てる
    let myDiscarded = 0;
    const myCount = Math.min(3, h.length);
    if (myCount > 0) {
      const selectedIndices = await waitPlayerHandSelection(
        myCount,
        owner,
        true,
        `手札を${myCount}枚選択して捨ててください`
      );

      if (window.triggerVfx) {
        await Promise.all([
          window.triggerVfx('anm_abyss_ritual', owner),
          window.triggerVfx('anm_abyss_ritual', opId),
        ]);
      }

      if (selectedIndices && selectedIndices.length > 0) {
        selectedIndices.sort((a, b) => b - a);
        for (let i of selectedIndices) {
          const card = h.splice(i, 1)[0];
          await discardCard(owner, card);
          myDiscarded++;
        }
      }
    } else {
      if (window.triggerVfx) {
        await Promise.all([
          window.triggerVfx('anm_abyss_ritual', owner),
          window.triggerVfx('anm_abyss_ritual', opId),
        ]);
      }
    }

    // 2. 相手の手札を全て捨てる
    let opDiscarded = 0;
    let voidDiscarded = 0;
    const opCards = [...opH];
    opH.length = 0;
    for (const card of opCards) {
      if (!card) continue;
      if (card.id === 'token_void' || card.baseId === 'token_void') {
        voidDiscarded++;
      }
      await discardCard(opId, card, undefined, false);
      opDiscarded++;
    }

    // 相手が捨てた虚空の枚数分、相手がダメージを受ける
    if (voidDiscarded > 0) {
      const hpFill = document.getElementById(
        `${opId === 'blue' ? 'player' : 'enemy'}-hp-fill`
      );
      // 戦乙女の加護: 対象側に加護が有効な場合はダメージを0（無効化）にする
      if (isValkyriaGuardActive(GameState, opId)) {
        if (hpFill) {
          createDamagePopup(hpFill, '加護', VALKYRIA_GUARD_POPUP_COLOR);
        }
        playSound(SOUNDS.seSkill);
      } else {
        if (opId === 'blue') {
          GameState.playerHP -= voidDiscarded;
          if (GameState.playerHP < 0) GameState.playerHP = 0;
        } else {
          GameState.enemyHP -= voidDiscarded;
          if (GameState.enemyHP < 0) GameState.enemyHP = 0;
        }

        // 被弾演出
        if (hpFill) {
          createDamagePopup(hpFill, `-${voidDiscarded}`, '#ef4444');
        }
        playSound(SOUNDS.seDamage);
      }

      updateHPBar();
      showSpeechBubble(opId);
      checkWinCondition();
    }

    // 3. 同数の虚空を加える
    const voidTpl = CARD_MASTER.find((m) => m.id === 'token_void') || {
      id: 'token_void',
      name: '虚空',
      power: 0,
    };

    events.push({ type: 'leader_skill', skill: action, side: owner });

    for (let i = 0; i < myDiscarded; i++) {
      const newToken = {
        ...voidTpl,
        uid: `${owner}_void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
        owner: owner,
        baseId: 'token_void',
        isToken: true,
        currentPower: voidTpl.power ?? 0,
        imgUrl: owner === 'blue' ? getCardImgUrl(voidTpl) : '',
        rarity: 1,
      };
      h.push(newToken);
    }
    for (let i = 0; i < opDiscarded; i++) {
      const newToken = {
        ...voidTpl,
        uid: `${opId}_void_${Math.floor(getSeededRandom() * 1000000000)}_${i}`,
        owner: opId,
        baseId: 'token_void',
        isToken: true,
        currentPower: voidTpl.power ?? 0,
        imgUrl: opId === 'blue' ? getCardImgUrl(voidTpl) : '',
        rarity: 1,
      };
      opH.push(newToken);
    }

    updateDeckDisplay('blue');
    updateDeckDisplay('red');
    renderHand();
  } else if (action === 'viola_domination') {
    const oppBoard = isBlue ? GameState.enemyBoard : GameState.playerBoard;
    const board = isBlue ? GameState.playerBoard : GameState.enemyBoard;
    const oppOwner = isBlue ? 'red' : 'blue';
    const mySealedLanes = isBlue
      ? GameState.playerSealedLanes
      : GameState.enemySealedLanes;

    const validOppLanes = [];
    for (let j = 0; j < 3; j++) {
      if (oppBoard[j] && mySealedLanes[j] === 0) {
        validOppLanes.push(j);
      }
    }

    if (validOppLanes.length > 0) {
      let selectedOppLane = -1;

      if (owner === 'red') {
        if (tokenLanes && tokenLanes.length > 0) {
          selectedOppLane = tokenLanes[0];
        } else if (
          GameState.aiDecision &&
          GameState.aiDecision.tokenLanes &&
          GameState.aiDecision.tokenLanes.length > 0
        ) {
          selectedOppLane = GameState.aiDecision.tokenLanes.shift();
        }

        // 【CodeRabbit指摘反映・封印強制ブロック】事前確定レーンを validOppLanes で再検証する
        // シミュレーション後に封印状態が変わった等のケースで、封印レーンへの不正配置（最優先ルール違反）を防ぐ
        if (!validOppLanes.includes(selectedOppLane)) {
          const sorted = [...validOppLanes].sort(
            (a, b) =>
              (oppBoard[b].currentPower ?? oppBoard[b].power ?? 0) -
              (oppBoard[a].currentPower ?? oppBoard[a].power ?? 0)
          );
          selectedOppLane = sorted[0] ?? -1;
        }
      } else {
        selectedOppLane = await new Promise((resolve) => {
          const originalClick = window.handleEnemyLaneClick;
          window.handleEnemyLaneClick = (laneIndex) => {
            const card = oppBoard[laneIndex];
            if (!card || mySealedLanes[laneIndex] === 1) {
              return;
            }
            if (originalClick) originalClick(laneIndex);
          };

          waitPlayerEnemyLaneSelection(
            1,
            owner,
            true,
            '相手のカードを1枚選んでください',
            false
          )
            .then((lanes) => {
              if (lanes && lanes.length > 0) resolve(lanes[0]);
              else resolve(-1);
            })
            .finally(() => {
              window.handleEnemyLaneClick = originalClick;
            });
        });
      }

      if (selectedOppLane !== -1 && oppBoard[selectedOppLane]) {
        const selectedCard = oppBoard[selectedOppLane];
        const targetLane = selectedOppLane;
        oppBoard[selectedOppLane] = null;
        updateDeckDisplay(oppOwner);

        // 1. VFX再生イベントを登録（演出再生システムに統合）
        events.push({
          type: 'vfx_trigger',
          vfxId: 'anm_viola_arts',
          side: owner,
          lane: selectedOppLane,
        });

        selectedCard.puppetOriginalOwner =
          selectedCard.puppetOriginalOwner || selectedCard.owner || oppOwner;
        if (
          selectedCard.equippedCards &&
          selectedCard.equippedCards.length > 0
        ) {
          selectedCard.equippedCards.forEach((eqCard) => {
            eqCard.puppetOriginalOwner =
              eqCard.puppetOriginalOwner || eqCard.owner || oppOwner;
          });
        }

        events.push({ type: 'leader_skill', skill: action, side: owner });

        if (
          board[targetLane] &&
          (hasSkill(selectedCard, 'equip') ||
            hasSkill(board[targetLane], 'arm_self')) &&
          !hasSkill(board[targetLane], 'possession') &&
          !hasSkill(selectedCard, 'possession') &&
          !hasSkill(board[targetLane], 'reflect') &&
          !hasSkill(selectedCard, 'reflect')
        ) {
          const targetCard = board[targetLane];
          targetCard.power =
            (targetCard.power || 0) + (selectedCard.power || 0);
          targetCard.basePower =
            (targetCard.basePower || 0) + (selectedCard.power || 0);
          // 【CodeRabbit指摘反映】即時参照される currentPower も同期して更新する
          targetCard.currentPower =
            (targetCard.currentPower || 0) + (selectedCard.power || 0);

          if (!targetCard.skills) {
            targetCard.skills = [];
          }
          const equipSkills = [];
          if (selectedCard.skills) {
            selectedCard.skills.forEach((s) => {
              if (s.id !== 'equip') equipSkills.push(s);
            });
          }
          mergeCardSkills(targetCard, equipSkills);
          targetCard.equippedCards = targetCard.equippedCards || [];
          targetCard.equippedCards.push(selectedCard);

          // 武装（arm_self）の消費処理
          consumeArmSelf(targetCard, selectedCard);

          renderBoard();
          events.push({
            type: 'power_change',
            side: owner,
            lane: targetLane,
            amount: selectedCard.power,
            source: 'equip',
            card: JSON.parse(JSON.stringify(selectedCard)),
            stealFromLane: selectedOppLane, // 奪い元のレーンを指定
          });
        } else if (
          board[targetLane] &&
          hasSkill(board[targetLane], 'startup')
        ) {
          const existingCard = board[targetLane];
          // 奪ってきたカードは墓地に送る
          if (!selectedCard.isToken) {
            (owner === 'blue'
              ? GameState.playerDiscard
              : GameState.enemyDiscard
            ).push(selectedCard);
          }
          resolveStartupFade(
            owner,
            existingCard,
            targetLane,
            JSON.parse(JSON.stringify(selectedCard)),
            events
          );
        } else {
          const existingCard = board[targetLane];
          if (existingCard) {
            await discardCard(owner, existingCard, targetLane, false);
          }

          const movedCard = {
            ...selectedCard,
            owner: owner,
            skillTriggered: true,
            stunTurns: selectedCard.stunTurns || 0,
            stunAppliedThisTurn: selectedCard.stunAppliedThisTurn || false,
          };
          board[targetLane] = movedCard;

          renderBoard();

          events.push({
            type: 'summon_card',
            side: owner,
            lane: targetLane,
            card: JSON.parse(JSON.stringify(movedCard)),
            source: 'viola_domination',
            stealFromLane: selectedOppLane, // 奪い元のレーンを指定
          });
        }
      }
    }
  } else if (action === 'warlock_place_demons') {
    const board = isBlue ? GameState.playerBoard : GameState.enemyBoard;
    const mySealedLanes = isBlue
      ? GameState.playerSealedLanes
      : GameState.enemySealedLanes;
    const skeletonTpl = CARD_MASTER.find((m) => m.id === 'token_skeleton');
    const daemonTpl = CARD_MASTER.find((m) => m.id === 'token_daemon');

    // UIの介入（スケルトン配置先の選択）をこのブロック内で処理
    let selectedLanes = tokenLanes;
    if (!selectedLanes || selectedLanes.length === 0) {
      let success = false;
      while (!success) {
        const selection = await waitPlayerLaneSelection(
          1,
          owner,
          skeletonTpl,
          false,
          null,
          false
        );
        if (!selection || selection.length === 0) return; // キャンセルされた場合
        const l = selection[0];
        const proceed = await confirmOverwrittenLane(owner, skeletonTpl, l);
        if (!proceed) {
          await sleep(200);
          continue;
        }
        selectedLanes = selection;
        success = true;
      }
    }
    tokenLanes = selectedLanes;

    events.push({ type: 'leader_skill', skill: action, side: owner });

    // 1. スケルトン1体を配置（選択されたレーン）
    if (tokenLanes && tokenLanes.length > 0) {
      const l = tokenLanes[0];
      if (mySealedLanes && mySealedLanes[l] > 0) return;
      if (board[l] && hasSkill(board[l], 'startup')) {
        // 起動消滅の特別処理
        board[l].skills = board[l].skills.filter(
          (s) => s.id !== 'startup' && s.id !== 'defender'
        );

        const deepClonedSk = JSON.parse(JSON.stringify(skeletonTpl));
        const skImg =
          getCardImgUrl({ ...skeletonTpl, owner }) ||
          `assets/cards/card_${skeletonTpl.id}.webp`;
        const deadToken = {
          ...deepClonedSk,
          id: `warlock_sk_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
          uid: `${owner}_warlock_sk_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
          baseId: skeletonTpl.id,
          owner,
          imgUrl: skImg,
          filter: 'none',
          currentPower: skeletonTpl.power,
          rarity: skeletonTpl.rarity || 1,
          isToken: true,
        };
        resolveStartupFade(owner, board[l], l, deadToken, events);
      } else {
        if (board[l]) {
          await discardCard(owner, board[l], l, false);
        }

        const deepClonedSk = JSON.parse(JSON.stringify(skeletonTpl));
        const skImg =
          getCardImgUrl({ ...skeletonTpl, owner }) ||
          `assets/cards/card_${skeletonTpl.id}.webp`;

        board[l] = {
          ...deepClonedSk,
          id: `warlock_sk_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
          uid: `${owner}_warlock_sk_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
          baseId: skeletonTpl.id,
          owner,
          imgUrl: skImg,
          filter: 'none',
          currentPower: skeletonTpl.power,
          rarity: skeletonTpl.rarity || 1,
          isToken: true,
        };
        // 【絶対厳守ルール】「配置」なので、召喚時のアクティブスキルは発動させない
        board[l].skillTriggered = true;

        events.push({
          type: 'summon_card',
          side: owner,
          lane: l,
          card: board[l],
          source: 'warlock_place_demons',
        });
      }
    }

    // 2. その後、自分のカードが配置されている全てのレーンにデーモンを配置
    const targetLanes = [];
    const daemonEvents = [];
    for (let l = 0; l < 3; l++) {
      // 自分のカードが存在し、かつ封印されていないレーン
      if (board[l] !== null && mySealedLanes[l] === 0) {
        if (hasSkill(board[l], 'startup')) {
          // 起動消滅の特別処理
          board[l].skills = board[l].skills.filter(
            (s) => s.id !== 'startup' && s.id !== 'defender'
          );

          const deepClonedToken = JSON.parse(JSON.stringify(daemonTpl));
          const imgUrl =
            getCardImgUrl({ ...daemonTpl, owner }) ||
            `assets/cards/card_${daemonTpl.id}.webp`;
          const deadToken = {
            ...deepClonedToken,
            id: `warlock_daemon_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            uid: `${owner}_warlock_daemon_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            baseId: daemonTpl.id,
            owner,
            imgUrl,
            filter: 'none',
            currentPower: daemonTpl.power,
            rarity: daemonTpl.rarity || 1,
            isToken: true,
          };
          resolveStartupFade(owner, board[l], l, deadToken, daemonEvents);
        } else {
          targetLanes.push(l);

          // 既存のカードを墓地へ送る（「配置」に伴う上書き）
          await discardCard(owner, board[l], l, false);

          // トークンのディープコピーを作成して配置する
          const deepClonedToken = JSON.parse(JSON.stringify(daemonTpl));

          const imgUrl =
            getCardImgUrl({ ...daemonTpl, owner }) ||
            `assets/cards/card_${daemonTpl.id}.webp`;

          board[l] = {
            ...deepClonedToken,
            id: `warlock_daemon_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            uid: `${owner}_warlock_daemon_${Math.floor(getSeededRandom() * 1000000000)}_${l}`,
            baseId: daemonTpl.id,
            owner,
            imgUrl,
            filter: 'none',
            currentPower: daemonTpl.power,
            rarity: daemonTpl.rarity || 1,
            isToken: true, // トークン属性を付与
          };
          // 【絶対厳守ルール】「配置」なので、召喚時のアクティブスキルは発動させない
          board[l].skillTriggered = true;

          daemonEvents.push({
            type: 'summon_card',
            side: owner,
            lane: l,
            card: board[l],
            source: 'warlock_place_demons',
          });
        }
      }
    }

    // ① スケルトン配置後、変化する各レーンに対してデーモン化のVFXイベントをプッシュ
    targetLanes.forEach((lane) => {
      events.push({
        type: 'vfx_trigger',
        vfxId: 'anm_dark_magic_self',
        side: owner,
        lane: lane,
      });
    });

    // ② その後、デーモンへの上書き（変化）イベントをプッシュ
    events.push(...daemonEvents);

    if (targetLanes.length > 0) {
      tokenLanes = targetLanes; // VFXの参照用に渡す
    }
  } else if (action === 'iron_march' || action === 'last_battalion') {
    const tA = CARD_MASTER.find((m) => m.id === 'token_automata');

    // スキルのカットイン等のために、開始イベントをプッシュして再生
    await playEvents([{ type: 'leader_skill', skill: action, side: owner }]);

    let currentTokenLanes = tokenLanes;
    const repeatCount = action === 'last_battalion' ? 5 : 3;

    for (let i = 0; i < repeatCount; i++) {
      if (GameState.isBattleEnded) break;

      let targetLane = -1;

      const mySealedLanes =
        owner === 'blue'
          ? GameState.playerSealedLanes
          : GameState.enemySealedLanes;

      // ループ内で毎回配置するレーンを選択する
      if (currentTokenLanes && currentTokenLanes[i] !== undefined) {
        const candidate = currentTokenLanes[i];
        // 【封印強制ブロック】事前決定レーンでも必ず再検証する
        targetLane =
          mySealedLanes && mySealedLanes[candidate] > 0 ? -1 : candidate;
      } else {
        // プレイヤーの入力待ち
        let successSatan = false;
        while (!successSatan) {
          const selection = await waitPlayerLaneSelection(
            1,
            owner,
            tA,
            false, // 配置なので制約なし
            null, // 毎回新規選択
            false
          );
          if (!selection || selection.length === 0) return; // キャンセルされた場合
          const l = selection[0];
          const proceed = await confirmOverwrittenLane(owner, tA, l);
          if (!proceed) {
            await sleep(200);
            continue;
          }
          targetLane = l;
          successSatan = true;
        }
      }

      if (targetLane === -1) break;

      // このループ開始時のHPとボードを退避 (ディープコピー)
      const startPlayerHP = GameState.playerHP;
      const startEnemyHP = GameState.enemyHP;
      const startPlayerBoard = GameState.playerBoard.map((c) =>
        c ? JSON.parse(JSON.stringify(c)) : null
      );
      const startEnemyBoard = GameState.enemyBoard.map((c) =>
        c ? JSON.parse(JSON.stringify(c)) : null
      );

      const stepEvents = [];

      // 毎ループ開始時に最新のボード参照を取得する
      const currentBoard = isBlue
        ? GameState.playerBoard
        : GameState.enemyBoard;

      // 1. オートマタ(P:1)の配置 or 起動消滅
      const existing = currentBoard[targetLane];
      if (existing && hasSkill(existing, 'startup')) {
        const imgUrl =
          getCardImgUrl({ ...tA, owner }) || `assets/cards/card_${tA.id}.webp`;
        const deepClonedToken = JSON.parse(JSON.stringify(tA));
        const deadToken = {
          ...deepClonedToken,
          id: `automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
          uid: `${owner}_automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
          baseId: tA.id,
          owner,
          imgUrl,
          filter: 'none',
          power: 1, // パワーを1に設定
          currentPower: 1, // 現在のパワーを1に設定
          rarity: tA.rarity || 1,
          isToken: true,
        };
        resolveStartupFade(owner, existing, targetLane, deadToken, stepEvents);
      } else {
        // 通常の配置処理 (既存カードがあれば上書き墓地送り)
        if (existing) {
          await discardCard(owner, existing, targetLane, false);
        }

        const imgUrl =
          getCardImgUrl({ ...tA, owner }) || `assets/cards/card_${tA.id}.webp`;
        const deepClonedToken = JSON.parse(JSON.stringify(tA));
        currentBoard[targetLane] = {
          ...deepClonedToken,
          id: `automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
          uid: `${owner}_automata_p1_${Math.floor(getSeededRandom() * 1000000000)}_${targetLane}_${i}`,
          baseId: tA.id,
          owner,
          imgUrl,
          filter: 'none',
          power: 1, // パワーを1に設定
          currentPower: 1, // 現在のパワーを1に設定
          rarity: tA.rarity || 1,
          isToken: true,
        };
        // 【絶対厳守ルール】「配置」なので、召喚時のアクティブスキルは発動させない
        currentBoard[targetLane].skillTriggered = true;

        // マキナ「鉄の行進」用VFX：オートマタが出現する前にレーンへ演出を再生する
        stepEvents.push({
          type: 'vfx_trigger',
          vfxId: 'anm_march_of_iron',
          side: owner,
          lane: targetLane,
        });

        // 配置（召喚扱い）イベントを追加
        stepEvents.push({
          type: 'summon_card',
          side: owner,
          lane: targetLane,
          card: JSON.parse(JSON.stringify(currentBoard[targetLane])),
          source: action,
        });
      }

      // 2. そのレーンのカードをただちに攻撃させる
      applySingleCombat(GameState, owner, targetLane, stepEvents);

      // 戦闘による破壊処理 (戦闘フェーズ中に破壊されたカードがあれば processDestructionTriggers で墓地へ送る)
      processDestructionTriggers(GameState, stepEvents);

      // --- 演出開始前のボードとHPの復元 ---
      // ロジックが完了した更新後のボードとHPを退避 (ディープコピー)
      const nextPlayerBoard = GameState.playerBoard.map((c) =>
        c ? JSON.parse(JSON.stringify(c)) : null
      );
      const nextEnemyBoard = GameState.enemyBoard.map((c) =>
        c ? JSON.parse(JSON.stringify(c)) : null
      );
      const nextPlayerHP = GameState.playerHP;
      const nextEnemyHP = GameState.enemyHP;

      // 演出再生のために、盤面とHPを「このループの開始時点（オートマタを配置する前）」に戻す
      GameState.playerBoard = startPlayerBoard;
      GameState.enemyBoard = startEnemyBoard;
      GameState.playerHP = startPlayerHP;
      GameState.enemyHP = startEnemyHP;

      // 演出を再生
      await playEvents(stepEvents);

      // 演出完了後、ボードとHPを更新後の状態（戦闘解決後）に戻す
      GameState.playerBoard = nextPlayerBoard;
      GameState.enemyBoard = nextEnemyBoard;
      GameState.playerHP = nextPlayerHP;
      GameState.enemyHP = nextEnemyHP;

      renderBoard();
      updateHPBar();

      // 勝敗チェック
      if (GameState.playerHP <= 0 || GameState.enemyHP <= 0) {
        checkWinCondition();
        break;
      }
    }
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
    valkyriaGuardBlue: GameState.valkyriaGuardBlue || 0,
    valkyriaGuardRed: GameState.valkyriaGuardRed || 0,
  };

  if (
    action !== 'devilhunter_resurrect' &&
    action !== 'abyss_ritual' &&
    action !== 'otherworld_gate' &&
    action !== 'void_purge' &&
    action !== 'viola_domination' &&
    action !== 'overdrive' &&
    action !== 'dungeon_summon_leader' &&
    action !== 'world_reconstruct' &&
    action !== 'warlock_place_demons' &&
    action !== 'iron_march' &&
    action !== 'last_battalion'
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
    GameState.valkyriaGuardBlue = currentState.valkyriaGuardBlue;
    GameState.valkyriaGuardRed = currentState.valkyriaGuardRed;
  }

  // 【世界の再構築】discardCard を使った正規の手札破棄処理
  // engine.js 側の簡易処理（AIシミュレーション用）とは異なり、
  // 変化(morph)の巻き戻し・装備の分解・トークン自動消滅などをすべて正しく処理する
  if (action === 'world_reconstruct') {
    events.push({ type: 'leader_skill', skill: action, side: owner });
    const MY_DRAW_COUNT = 4;
    const OP_DRAW_COUNT = 3;

    // 1. 互いの手札を正規に捨てる（discardCard でバフリセット・トークン消滅を適用）
    const myHand = isBlue ? GameState.playerHand : GameState.enemyHand;
    const opHand = isBlue ? GameState.enemyHand : GameState.playerHand;
    const myHandCopy = [...myHand];
    const opHandCopy = [...opHand];
    myHand.length = 0;
    opHand.length = 0;
    for (const card of myHandCopy) {
      await discardCard(isBlue ? 'blue' : 'red', card, undefined, false);
    }
    for (const card of opHandCopy) {
      await discardCard(isBlue ? 'red' : 'blue', card, undefined, false);
    }

    // 2. 墓地をデッキに戻す（トークンは除外）
    const myDiscard = isBlue ? GameState.playerDiscard : GameState.enemyDiscard;
    const opDiscard = isBlue ? GameState.enemyDiscard : GameState.playerDiscard;
    const myDeck = isBlue ? GameState.playerDeck : GameState.enemyDeck;
    const opDeck = isBlue ? GameState.enemyDeck : GameState.playerDeck;
    while (myDiscard.length > 0) {
      const card = myDiscard.pop();
      if (!card.isToken) myDeck.push(card);
    }
    while (opDiscard.length > 0) {
      const card = opDiscard.pop();
      if (!card.isToken) opDeck.push(card);
    }

    // 3. デッキをシャッフル（シード付き乱数）
    for (let i = myDeck.length - 1; i > 0; i--) {
      const j = Math.floor(getSeededRandom() * (i + 1));
      [myDeck[i], myDeck[j]] = [myDeck[j], myDeck[i]];
    }
    for (let i = opDeck.length - 1; i > 0; i--) {
      const j = Math.floor(getSeededRandom() * (i + 1));
      [opDeck[i], opDeck[j]] = [opDeck[j], opDeck[i]];
    }

    // 捨てた状態を一度描画
    updateDeckDisplay('blue');
    updateDeckDisplay('red');
    renderHand();
    await sleep(AI_THINKING_DURATION);

    // 4. ドロー（自分4枚、相手3枚）
    for (let i = 0; i < MY_DRAW_COUNT && myDeck.length > 0; i++) {
      const card = myDeck.pop();
      card.uid = `${isBlue ? 'blue' : 'red'}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
      myHand.push(card);
    }
    for (let i = 0; i < OP_DRAW_COUNT && opDeck.length > 0; i++) {
      const card = opDeck.pop();
      card.uid = `${isBlue ? 'red' : 'blue'}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
      opHand.push(card);
    }

    // 5. 追加ターン1回（SP増加なし・攻撃なし）
    GameState.extraTurnCount = (GameState.extraTurnCount || 0) + 1;
    GameState.attackSkipCount = (GameState.attackSkipCount || 0) + 1;

    updateDeckDisplay('blue');
    updateDeckDisplay('red');
    renderHand();
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
    } else if (
      (action === 'tomb_guard' || action === 'death_judgment') &&
      tokenLanes &&
      tokenLanes.length > 0
    ) {
      await sleep(200);
      await window.triggerVfx('anm_dark_magic', owner, tokenLanes[0]);
    } else if (
      (action === 'dragon_summon' || action === 'dragon_high_ritual') &&
      tokenLanes &&
      tokenLanes.length > 0
    ) {
      await sleep(200);
      await window.triggerVfx('anm_summon_ignis', owner, tokenLanes[0]);
    } else if (
      action === 'satan_avatar' &&
      tokenLanes &&
      tokenLanes.length > 0
    ) {
      await sleep(200);
      await window.triggerVfx('anm_summon_satan', owner, tokenLanes[0]);
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
    } else if (action === 'god_flame' || action === 'condemnation') {
      await sleep(200);
      await window.triggerVfx('anm_god_flame', owner);
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
  // dragon_summon / dragon_high_ritual: イグニストークンのimgUrlを現在設定中のスキンに合わせて書き換える
  // （engine.jsは純粋関数のためGameStateにアクセスできないため、ここでパッチする）
  if (action === 'dragon_summon' || action === 'dragon_high_ritual') {
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

  if (action !== 'iron_march' && action !== 'last_battalion') {
    // イベント再生を開始する前に、一時的に盤面をリーダースキル発動前の元の状態に戻す
    // これにより、playEvents 内で正しい上書き・墓地送り演出が実行されるようになる
    GameState.playerBoard = savedPlayerBoard;
    GameState.enemyBoard = savedEnemyBoard;

    await playEvents(events);

    // リーダースキルによる演出が完了したので、配置したカードの保護フラグを解除
    events.forEach((ev) => {
      if (
        (ev.type === 'summon_token' || ev.type === 'summon_card') &&
        ev.card
      ) {
        ev.card.isSkillResolving = false;
      }
    });

    // 再描画
    renderBoard();
  }

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
