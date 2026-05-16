import { ENEMY_DECKS } from '../utils/constants/enemy_decks.js';
import { SKILLS } from '../utils/constants/skills.js';
import {
  getCardImgUrl,
  hasSkill,
  playSound,
  renderSkillTag,
  stopAllBGM,
  switchScreen,
} from '../utils/gameUtils.js';
import { AUDIO_INSTANCES } from '../utils/sounds.js';
import { GameState } from './gameState.js';
import { handleStoryProgression } from './story.js';
import { setupDialogueScreen } from './uiDialogue.js';
import { initSelectScreen } from './uiMainCore.js';
import { showConfirmModal } from './uiModals.js';

// ==========================================
// UI Battle Logic (Hand, Board, & Detail)
// ==========================================

export let updateBattleUIHook = null;
export function setUpdateBattleUIHook(hook) {
  updateBattleUIHook = hook;
}

export let summonAnimationHook = null;
export function setSummonAnimationHook(hook) {
  summonAnimationHook = hook;
}

export function playSummonAnimation(card, owner) {
  if (summonAnimationHook) {
    return summonAnimationHook(card, owner);
  }
  return Promise.resolve();
}

const triggerReactUpdate = () => {
  if (updateBattleUIHook) updateBattleUIHook();
};

export let updateCardDetailHook = null;
export function setUpdateCardDetailHook(hook) {
  updateCardDetailHook = hook;
}

export function updateCardDetail(c) {
  let html = '';
  let textColor = '#94a3b8';

  if (typeof c === 'string') {
    html = `<div class="skill-info" style="color:#facc15; font-weight:bold;">${c}</div>`;
    textColor = '#facc15';
  } else if (!c) {
    if (GameState.isDiscardingMode) {
      if (GameState.isDiscardingExact) {
        html = `<div class="skill-info" style="color:#facc15; font-weight:bold;">捨てるカードを${GameState.discardMaxCount}枚選んでください</div>`;
      } else {
        html = `<div class="skill-info" style="color:#facc15; font-weight:bold;">捨てるカードを${GameState.discardMaxCount}枚まで選んでください</div>`;
      }
      textColor = '#facc15';
    } else if (GameState.isPlacementMode) {
      html = `<div class="skill-info" style="color:#facc15; font-weight:bold;">${GameState.placementMessage || '配置する場所を選んでください'}</div>`;
      textColor = '#facc15';
    } else if (GameState.isEnemyTargetMode) {
      html = `<div class="skill-info" style="color:#facc15; font-weight:bold;">相手のカードを${GameState.targetMaxCount}枚選んでください</div>`;
      textColor = '#facc15';
    } else if (GameState.isAlliedTargetMode) {
      html = `<div class="skill-info" style="color:#facc15; font-weight:bold;">自分のカードを${GameState.targetMaxCount}枚選んでください</div>`;
      textColor = '#facc15';
    }
  } else {
    textColor = '#fff';
    let skillCandidates = [];
    // 複数スキル配列（union等が必要とするtargetId/summonIdなど全プロパティを引き継ぐ）
    if (Array.isArray(c.skills)) {
      c.skills.forEach((sk) => {
        skillCandidates.push({ ...sk });
      });
    }

    const isOblivion = skillCandidates.some((sk) => sk.id === 'oblivion');
    if (isOblivion) {
      skillCandidates = skillCandidates.filter(
        (sk) => sk.id === 'oblivion' || sk.id === 'equip'
      );
    }

    if (c.stunTurns > 0) {
      skillCandidates.push({ id: 'defender', value: null, isBind: true });
    }

    let grouped = [];
    skillCandidates.forEach((cand) => {
      const existing = grouped.find(
        (g) =>
          g.id === cand.id &&
          g.value === cand.value &&
          g.isBind === cand.isBind &&
          g.choiceGroup === cand.choiceGroup
      );
      if (existing) {
        existing.count++;
      } else {
        grouped.push({ ...cand, count: 1 });
      }
    });

    // descが配列（union等のリッチテキスト形式）の場合、各要素のvalueを連結してプレーンテキスト化する
    const resolveDesc = (raw) => {
      if (Array.isArray(raw)) return raw.map((seg) => seg.value || '').join('');
      return raw || '';
    };

    const rarityColors = { 1: '#cd7f32', 2: '#e2e8f0', 3: '#facc15' };
    html = '<div class="card-detail-content">';
    if (grouped.length > 0) {
      grouped.forEach((sk) => {
        const s = SKILLS[sk.id];
        if (s) {
          const isBind = sk.isBind;
          const skillName = isBind ? '拘束' : s.name;
          const val = isBind ? '' : (sk.value ?? '');
          // 合体(union)など、第2引数にスキルオブジェクト自体（targetId/summonId等）を必要とするdescに対応
          const skillEffect = resolveDesc(
            typeof s.desc === 'function' ? s.desc(sk.value, sk) : s.desc
          );
          const countSuffix = sk.count > 1 ? ` * ${sk.count}` : '';

          if (
            sk.id === 'choice' &&
            (Array.isArray(c.choices) || Array.isArray(c.choices2))
          ) {
            let subDetailsHtml = '';
            const targetChoices = sk.choiceGroup === 2 ? c.choices2 : c.choices;
            if (Array.isArray(targetChoices)) {
              targetChoices.forEach((cho) => {
                const cs = SKILLS[cho.id];
                if (cs) {
                  const cVal =
                    cho.value === null || cho.value === undefined
                      ? ''
                      : cho.value;
                  const cDesc = resolveDesc(
                    typeof cs.desc === 'function' ? cs.desc(cho.value) : cs.desc
                  );
                  subDetailsHtml += `
                                        <div style="margin-left: 10px; border-left: 2px solid #475569; padding-left: 10px; margin-top: 8px; margin-bottom: 8px;">
                                            <div class="card-skill-tag" style="font-size: 0.75rem; padding: 1px 6px;">${cs.icon} ${cs.name}${cVal}</div>
                                            <div class="skill-desc" style="font-size: 0.8rem; color: #94a3b8; padding-left: 0;">${cDesc}</div>
                                        </div>
                                    `;
                }
              });
            }

            html += `
                            <details class="choice-accordion" style="margin-bottom: 4px; width: 100%;">
                                <summary style="list-style: none; cursor: pointer; outline: none; width: 100%;">
                                    <div class="card-skill-tag" style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 110px; position: relative; margin: 0 auto;">
                                        <span>${s.icon} ${skillName}${val}${countSuffix}</span>
                                        <span class="accordion-icon" style="font-size: 0.7rem; position: absolute; right: 8px;">▼</span>
                                    </div>
                                    <div class="skill-desc" style="margin-top: 2px; margin-bottom: 4px; color: #f8fafc; text-align: center;">${skillEffect}</div>
                                </summary>
                                <div class="accordion-content" style="margin-top: 5px;">
                                    ${subDetailsHtml}
                                </div>
                            </details>
                        `;
          } else {
            html += `<div class="skill-header">
                            <div class="card-skill-tag" style="background:${isBind ? '#475569' : ''}; border-color:${isBind ? '#ef4444' : ''}; color:${isBind ? '#fca5a5' : ''};">
                                ${s.icon} ${skillName}${val}${countSuffix}
                            </div>
                        </div>
                        <div class="skill-desc">${skillEffect}</div>`;
          }
        }
      });
    } else {
      html += `<div class="skill-desc">能力なし</div>`;
    }
    html += '</div>';
  }

  // Replace direct DOM manipulation with React Hook
  if (updateCardDetailHook) {
    updateCardDetailHook(html, textColor);
  }
}
window.updateCardDetail = updateCardDetail;

export function createCardDOM(c, isBoard = false) {
  const rarityClass = c.rarity ? ` rarity-${c.rarity}` : '';
  const d = document.createElement('div');
  d.className = `card ${c.owner}${rarityClass}`;
  let sH = renderSkillTag(c, isBoard);
  let filter = c.filter;
  const imgUrl = getCardImgUrl(c);
  d.innerHTML = `
        <div class="card-bg" style="background-image: url('${imgUrl}'); filter: ${filter};"></div>
        ${sH}
        <div class="card-power">${c.currentPower}</div>
    `;
  return d;
}

export function renderHand() {
  triggerReactUpdate();
}

export function highlightLanes() {
  document.querySelectorAll('#player-lanes .cell').forEach((c, i) => {
    if (
      GameState.isPlacementMode ||
      GameState.isEnemyTargetMode ||
      GameState.isAlliedTargetMode
    )
      return;
    if (GameState.selectedCardIndex === null) {
      c.classList.remove('highlight');
    } else {
      const card = GameState.playerHand[GameState.selectedCardIndex];
      // 1ターン目の制限 (先攻の場合)
      if (GameState.turnCount === 1 && GameState.firstPlayer === 'blue') {
        if (i === 1) c.classList.add('highlight');
        else c.classList.remove('highlight');
        return;
      }
      // 伝説の制限
      if (hasSkill(card, 'legendary')) {
        if (i === 1) c.classList.add('highlight');
        else c.classList.remove('highlight');
      } else {
        c.classList.add('highlight');
      }
    }
  });
}

/**
 * 特定のレーンのカード表示のみを更新する
 */
export function updateCardVisuals(lane, side, card) {
  const parent = document.querySelector(
    `#${side}-lanes .cell[data-lane="${lane}"]`
  );
  if (!parent) return;
  if (!card) {
    parent.innerHTML = '';
    return;
  }
  const d = createCardDOM(card, true);
  parent.innerHTML = '';
  parent.appendChild(d);
}

/**
 * 特定のレーンのカードを削除する（ Surgical update ）
 */
export function removeCardFromBoard(lane, side) {
  triggerReactUpdate();
}

export function renderBoard() {
  triggerReactUpdate();
}

/**
 * 特定のレーンのカードパワー表示のみを更新する（アニメーション中断防止用）
 */
export function updateCardPowerOnly(lane, side) {
  const board =
    side === 'player' ? GameState.playerBoard : GameState.enemyBoard;
  const card = board[lane];
  if (!card) return;

  const laneId = side === 'player' ? 'player-lanes' : 'enemy-lanes';
  const cell = document.querySelector(`#${laneId} .cell[data-lane="${lane}"]`);
  if (!cell) return;

  const powerEl = cell.querySelector('.card-power');
  if (powerEl) {
    powerEl.innerText = card.currentPower;
  }
}

export function showDeckRefreshEffect(owner) {
  const battleScreen = document.getElementById('screen-battle');
  if (!battleScreen) return;
  const effectEl = document.createElement('div');
  effectEl.className = 'deck-refresh-effect';
  effectEl.innerText = '山札補充';
  if (owner === 'blue') effectEl.style.top = '65%';
  else effectEl.style.top = '35%';
  battleScreen.appendChild(effectEl);
  setTimeout(() => {
    if (effectEl.parentNode) effectEl.parentNode.removeChild(effectEl);
  }, 1500);
}

export function returnToTitle() {
  showConfirmModal('バトルを中断してタイトルに戻りますか？', () => {
    stopAllBGM();
    GameState.appState = 'title';
    switchScreen('screen-mode-select');
    playSound(AUDIO_INSTANCES.bgmTitle);
  });
}

// --- 報酬システム ---
export let pendingRewardCard = null;

export function showCardReward(enemyId) {
  // 防衛戦やオンライン対戦では報酬（カード獲得）をスキップ
  if (
    GameState.gameMode === 'defense_attack' ||
    GameState.gameMode === 'online'
  ) {
    GameState.appState = 'select_enemy';
    initSelectScreen(true);
    switchScreen('screen-select');
    return;
  }

  let recipeId = enemyId;
  if (GameState.gameMode === 'event_satan_high' && enemyId === 'satan')
    recipeId = 'satan_high';
  if (GameState.gameMode === 'event_android_high' && enemyId === 'android')
    recipeId = 'android_high';
  if (GameState.gameMode === 'event_dragon_high' && enemyId === 'dragon')
    recipeId = 'dragon_high';
  if (GameState.gameMode === 'event_knight_high' && enemyId === 'knight')
    recipeId = 'knight_high';
  if (GameState.gameMode === 'event_cthulhu_high' && enemyId === 'cthulhu')
    recipeId = 'cthulhu_high';
  if (GameState.gameMode === 'event_priest_high' && enemyId === 'priest')
    recipeId = 'priest_high';

  let recipe = ENEMY_DECKS[recipeId] || ENEMY_DECKS.android;
  let enemyDeckIds = [];
  if (recipe.easy && recipe.normal && recipe.hard) {
    if (typeof GameState.aiLevel !== 'undefined') {
      if (GameState.aiLevel == 1) enemyDeckIds = recipe.easy;
      else if (GameState.aiLevel == 3) enemyDeckIds = recipe.hard;
      else enemyDeckIds = recipe.normal;
    } else {
      enemyDeckIds = recipe.normal;
    }
  } else if (Array.isArray(recipe)) {
    enemyDeckIds = recipe;
  } else {
    enemyDeckIds = recipe.normal || [];
  }
  const eligibleIds = [...new Set(enemyDeckIds)].filter((id) => {
    const owned = GameState.playerInventory[id] || 0;
    return owned < 4;
  });

  if (eligibleIds.length === 0) {
    if (GameState.gameMode === 'defense_attack') {
      GameState.appState = 'select_enemy';
      initSelectScreen(false);
      switchScreen('screen-select');
    } else {
      // ストーリーモードで報酬がない場合は、GameState.appStateを更新してから進行
      if (
        GameState.gameMode === 'story' &&
        GameState.appState === 'post_dialogue'
      ) {
        handleStoryProgression();
      } else {
        setupDialogueScreen();
      }
    }
    return;
  }

  const rewardId = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];

  if (window.showCardRewardReact) {
    window.showCardRewardReact(rewardId);
  }
}
