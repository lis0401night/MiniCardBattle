import { SKILLS } from '../utils/constants/skills.js';
import { STATUSES } from '../utils/constants/statuses.js';
import {
  getCardActiveStatuses,
  getDialogue,
  getSkillBadgeInfo,
  isSkillMergeExcluded,
  playSound,
  resolveCardChoices,
  resolveCardSupremacySkills,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { GameState } from '../state/gameState.js';
import { showAlertModal } from './uiModals.js';

// ==========================================
// UI Battle Logic (Hand, Board, & Detail)
// ==========================================

/**
 * Reactの再描画を通知するコールバック（BattleScreen.jsxから登録）
 * battle.js, eventRenderer.js 等からUI更新のトリガーとして使用される
 */
export let updateBattleUIHook = null;
export function setUpdateBattleUIHook(hook) {
  updateBattleUIHook = hook;
}

/**
 * 召喚アニメーション再生用コールバック（BattleScreen.jsxから登録）
 */
export let summonAnimationHook = null;
export function setSummonAnimationHook(hook) {
  summonAnimationHook = hook;
}

/**
 * カード召喚時のアニメーションを再生する
 * battle.js, skillLogic.js から呼ばれる
 * @param {object} card - 召喚するカードオブジェクト
 * @param {string} owner - 'blue' or 'red'
 * @returns {Promise} アニメーション完了時にresolveされるPromise
 */
export function playSummonAnimation(card, owner) {
  if (summonAnimationHook) {
    return summonAnimationHook(card, owner);
  }
  return Promise.resolve();
}

/** Reactの再描画を内部的にトリガーするヘルパー */
const triggerReactUpdate = () => {
  if (updateBattleUIHook) updateBattleUIHook();
};

/**
 * カード詳細表示のHTML更新用コールバック（BattleScreen.jsxから登録）
 */
export let updateCardDetailHook = null;
export function setUpdateCardDetailHook(hook) {
  updateCardDetailHook = hook;
}

/**
 * カード詳細情報のHTMLを生成し、React側のフックで表示を更新する
 * カード選択時・スキル確認時にbattle.js, leaderSkills.js等から呼ばれる
 * nullが渡された場合は現在のモード（破棄/配置/ターゲット選択）に応じたガイドメッセージを生成
 * @param {object|string|null} c - カードオブジェクト、メッセージ文字列、またはnull
 */
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
    const activeStatuses = getCardActiveStatuses(c, true);
    const statusMap = new Map(activeStatuses.map((st) => [st.id, st]));
    const renderedStatusIds = new Set();

    // 複数スキル配列（union等が必要とするtargetId/summonIdなど全プロパティを引き継ぐ）
    if (Array.isArray(c.skills)) {
      c.skills.forEach((sk) => {
        if (!sk) return;
        const id = typeof sk === 'string' ? sk : sk?.id;
        if (statusMap.has(id)) {
          if (!renderedStatusIds.has(id)) {
            skillCandidates.push(statusMap.get(id));
            renderedStatusIds.add(id);
          }
        } else {
          skillCandidates.push(typeof sk === 'string' ? { id: sk } : { ...sk });
        }
      });
    }

    // スロット外の直接プロパティ由来の状態（スタン・盤面加護等）を末尾に追加
    activeStatuses.forEach((st) => {
      if (!renderedStatusIds.has(st.id)) {
        skillCandidates.push(st);
        renderedStatusIds.add(st.id);
      }
    });

    let grouped = [];
    skillCandidates.forEach((cand) => {
      if (cand.isStatus) {
        // 状態エントリは通常スキルと集約せずそのまま追加
        grouped.push({ ...cand, count: 1 });
        return;
      }
      const isExcludedFromMerge = isSkillMergeExcluded(cand);
      const existing = isExcludedFromMerge
        ? null
        : grouped.find(
            (g) =>
              !g.isStatus &&
              g.id === cand.id &&
              g.value === cand.value &&
              g.choiceGroup === cand.choiceGroup &&
              g.targetId === cand.targetId &&
              g.targetKeyword === cand.targetKeyword
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

    html = '<div class="card-detail-content">';
    if (grouped.length > 0) {
      const { choices: cChoices, choices2: cChoices2 } = resolveCardChoices(c);
      const cSupremacySkills = resolveCardSupremacySkills(c);

      grouped.forEach((sk) => {
        // 状態エントリ（isStatus: true または STATUSES に定義されている）の描画
        const statusDef = STATUSES[sk.id];
        if (sk.isStatus || statusDef) {
          const def = statusDef || STATUSES[sk.id];
          if (!def) return;

          const iconPrefix = def.icon ? `${def.icon} ` : '';
          const valStr =
            def.id === 'valkyria_guard' &&
            (!sk.value || sk.value === 1) &&
            !c.valkyriaGuardTurns
              ? ''
              : sk.value !== undefined && sk.value !== null
                ? sk.value
                : '';
          const skillEffect =
            typeof def.desc === 'function' ? def.desc(sk.value) : def.desc;
          const badgeClass = def.badgeClass || '';

          html += `<div class="skill-header">
                            <div class="card-skill-tag ${badgeClass}">
                                ${iconPrefix}${def.name}${valStr}
                            </div>
                        </div>
                        <div class="skill-desc">${skillEffect}</div>`;
          return;
        }

        const s = SKILLS[sk.id];
        if (s) {
          const badgeInfo = getSkillBadgeInfo(sk);
          const skillName = badgeInfo.name;
          const val = badgeInfo.value;
          const skillIcon = badgeInfo.icon || s.icon;
          const iconPrefix = skillIcon ? `${skillIcon} ` : '';

          // 合体(union)など、第2引数にスキルオブジェクト自体（targetId/summonId等）を必要とするdescに対応
          const skillEffect = resolveDesc(
            typeof s.desc === 'function' ? s.desc(sk.value, sk) : s.desc
          );
          const countSuffix = sk.count > 1 ? ` * ${sk.count}` : '';

          const isAccordionSkill =
            sk.id === 'choice' || sk.id === 'force' || sk.id === 'supremacy';
          const targetChoices =
            sk.id === 'supremacy'
              ? cSupremacySkills
              : sk.choiceGroup === 2
                ? cChoices2
                : cChoices;

          if (
            isAccordionSkill &&
            Array.isArray(targetChoices) &&
            targetChoices.length > 0
          ) {
            let subDetailsHtml = '';
            targetChoices.forEach((cho) => {
              const cs = SKILLS[cho.id];
              if (cs) {
                const choInfo = getSkillBadgeInfo(cho);
                const cDesc = resolveDesc(
                  typeof cs.desc === 'function'
                    ? cs.desc(cho.value, cho)
                    : cs.desc
                );
                subDetailsHtml += `
                                        <div style="margin-left: 10px; border-left: 2px solid #475569; padding-left: 10px; margin-top: 8px; margin-bottom: 8px;">
                                            <div class="card-skill-tag" style="font-size: 0.75rem; padding: 1px 6px;">${choInfo.icon} ${choInfo.fullName}</div>
                                            <div class="skill-desc" style="font-size: 0.8rem; color: #94a3b8; padding-left: 0;">${cDesc}</div>
                                        </div>
                                    `;
              }
            });

            html += `
                            <details class="choice-accordion" style="margin-bottom: 4px; width: 100%;">
                                <summary style="list-style: none; cursor: pointer; outline: none; width: 100%;">
                                    <div class="card-skill-tag" style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 110px; position: relative; margin: 0 auto;">
                                        <span>${iconPrefix}${skillName}${val}${countSuffix}</span>
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
                            <div class="card-skill-tag">
                                ${iconPrefix}${skillName}${val}${countSuffix}
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

/**
 * 手札の表示を更新する
 * battle.js, eventRenderer.js, skillLogic.js から呼ばれる
 */
export function renderHand() {
  triggerReactUpdate();
}

/**
 * 盤面全体の表示を更新する
 * battle.js, eventRenderer.js から呼ばれる
 */
export function renderBoard() {
  triggerReactUpdate();
}

/**
 * 特定のレーンのカードパワー表示のみを更新する（アニメーション中断防止用）
 * eventRenderer.js, battle.js から呼ばれる
 * @param {number} lane - レーンインデックス (0-2)
 * @param {string} side - 'player' or 'enemy'
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

/**
 * 山札が補充された際の視覚エフェクトを表示する
 * battle.jsの山札リフレッシュ処理から呼ばれる
 * @param {string} owner - 'blue'（プレイヤー）or 'red'（敵）
 */
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

// ==========================================
// HP / SP / デッキ表示更新
// ==========================================

/**
 * プレイヤーと敵のHPバー・テキスト表示をDOMに反映し、React側にも再描画を通知する
 * HP0時にはアイコンに死亡演出を適用する
 * battle.jsのダメージ処理・戦闘開始時などから呼ばれる
 */
export function updateHPBar() {
  // DOMから直接更新しつつ、Reactにも同期させる
  const pFill = document.getElementById('player-hp-fill');
  if (pFill)
    pFill.style.width = `${Math.max(0, (GameState.playerHP / GameState.playerMaxHP) * 100)}%`;
  const pText = document.getElementById('player-hp-text');
  if (pText)
    pText.innerText = `${Math.max(0, GameState.playerHP)} / ${GameState.playerMaxHP}`;
  const eFill = document.getElementById('enemy-hp-fill');
  if (eFill)
    eFill.style.width = `${Math.max(0, (GameState.enemyHP / GameState.enemyMaxHP) * 100)}%`;
  const eText = document.getElementById('enemy-hp-text');
  if (eText)
    eText.innerText = `${Math.max(0, GameState.enemyHP)} / ${GameState.enemyMaxHP}`;

  // HP0時のアイコン死亡演出はReactコンポーネント（PlayerArea/EnemyArea）側で自動反映されるためDOM操作は不要

  if (updateBattleUIHook) updateBattleUIHook();
}

/**
 * SPオーブの表示を更新する（React側の再描画フックに委譲）
 * battle.jsのターン開始処理から呼ばれる
 */
export function updateSPOrbs(_owner) {
  // innerHTML操作はReactのDOMツリーを破壊するため削除し、Reactフックを発火
  if (updateBattleUIHook) updateBattleUIHook();
}

/**
 * デッキ枚数・墓地枚数の表示を更新する（React側の再描画フックに委譲）
 * battle.jsのドロー・破棄処理から呼ばれる
 */
export function updateDeckDisplay(_owner) {
  // DOMによる deck-info の innerText 上書きは React のツリーを破壊するため削除。
  // 代わりに React 側の再描画フックを呼び出します（PlayerArea / EnemyArea に反映される）
  if (updateBattleUIHook) updateBattleUIHook();
}

// ==========================================
// 演出エフェクト
// ==========================================

/**
 * バトル終了演出（スローモーション＋画面揺れ）を発動する
 * battle.jsの勝敗判定時に呼ばれる
 */
export function triggerFinishVisuals() {
  // 画面全体のスローモーションと揺れ
  if (typeof window.setSlowMotionReact === 'function') {
    window.setSlowMotionReact(true);
  }
  // body ではなく #app-container に適用し、position: fixed のダメージオーバーレイへの副作用を防止
  const container = document.getElementById('app-container');
  if (container) {
    container.classList.add('anim-mega-shake');
    // ダメージ音は攻撃処理側ですでに鳴っているため、ここでの二重再生は避ける

    setTimeout(() => {
      container.classList.remove('anim-mega-shake');
    }, 1000);
  }
}

/**
 * リーダーへの直接ダメージ時に吹き出しとダメージアイコンを表示する
 * 直接攻撃処理やスキルダメージから呼ばれる
 * @param {string} target - 'blue'（プレイヤー）or 'red'（敵）
 * @param {number|null} [damageAmount=null] - 受けたダメージ量（小ダメージ / 大ダメージの台詞分岐用）
 */
export function showSpeechBubble(target, damageAmount = null) {
  const config =
    target === 'blue' ? GameState.playerConfig : GameState.enemyConfig;
  let msg = getDialogue(
    config,
    null,
    'damage',
    target === 'blue' ? 'player' : 'enemy',
    damageAmount
  );

  // シャドウ（ドッペルゲンガー）は無言
  if (target === 'red' && GameState.enemyConfig.isShadow) {
    msg = '・・・・';
  }

  const bubble = document.getElementById(
    target === 'blue' ? 'player-speech' : 'enemy-speech'
  );
  const iconEl = document.getElementById(
    target === 'blue' ? 'player-icon' : 'enemy-icon'
  );

  if (bubble) {
    bubble.innerText = msg;
    bubble.classList.add('active');

    // アイコンをダメージ画像に変更（キャラクターアイコンのみ。カード画像の特殊リーダーはダメージ版が存在しないためスキップ）
    if (iconEl && iconEl.src) {
      const originalSrc = iconEl.src;
      const hasCharacterIcon = originalSrc.includes('/icons/');
      if (hasCharacterIcon && !originalSrc.includes('_damage.webp')) {
        iconEl.src = originalSrc.replace('.webp', '_damage.webp');
        setTimeout(() => {
          const currentHP =
            target === 'blue' ? GameState.playerHP : GameState.enemyHP;
          if (currentHP > 0 && iconEl.src.includes('_damage.webp')) {
            iconEl.src = originalSrc;
          }
        }, 1500);
      }
    }

    setTimeout(() => bubble.classList.remove('active'), 1500);
  }
}

// ==========================================
// リーダースキル確認モーダル
// ==========================================

/**
 * プレイヤーのリーダースキル確認モーダルを表示する
 * BattleScreen.jsxのリーダースキルボタンから呼ばれる
 * SP不足時は発動不可、パッシブスキルの場合は情報表示のみ
 * 実行コールバックはbattle.jsのexecuteSkillFromConfirmをwindow経由で呼ぶ
 */
export function showSkillConfirm() {
  const s = GameState.playerConfig.leaderSkill;
  if (!s) {
    showAlertModal('リーダースキルはありません');
    return;
  }
  playSound(SOUNDS.seClick);

  let statusText = '';
  let color = '';
  let canExecute = false;

  if (!s.cost) {
    statusText = 'パッシブスキル（常に発動）';
    color = '#4ade80';
    canExecute = false;
  } else if (GameState.playerSP >= s.cost) {
    if (
      !GameState.isProcessing &&
      !GameState.isBattleEnded &&
      GameState.currentTurn === 'player' &&
      !GameState.isPlacementMode
    ) {
      statusText = '発動可能です！';
      color = '#4ade80';
      canExecute = true;
    } else {
      statusText = '現在発動できません（自分のターン待機中のみ）';
      color = '#facc15';
      canExecute = false;
    }
  } else {
    statusText = `発動まであと ${s.cost - GameState.playerSP} SP`;
    color = '#f87171';
    canExecute = false;
  }

  if (window.showSkillConfirmModalReact) {
    window.showSkillConfirmModalReact({
      skill: s,
      statusText,
      color,
      canExecute,
      onExecute: () => {
        // dispatchBattleActionへの依存を避けるため、window経由でbattle.jsの関数を呼ぶ
        if (window.executeSkillFromConfirm) window.executeSkillFromConfirm();
      },
    });
  }
}

/**
 * 敵のリーダースキル確認モーダルを表示する（閲覧のみ、実行不可）
 * BattleScreen.jsxの敵スキルボタンから呼ばれる
 */
export function showEnemySkillConfirm() {
  playSound(SOUNDS.seClick);
  const s = GameState.enemyConfig.leaderSkill;
  if (!s) return;

  let statusText = '';
  let color = '';

  if (!s.cost) {
    statusText = 'パッシブスキル（常に発動）';
    color = '#4ade80';
  } else {
    const r = Math.max(0, s.cost - GameState.enemySP);
    if (r === 0) {
      statusText = '発動可能状態です！注意！';
      color = '#ef4444';
    } else {
      statusText = `発動まであと ${r} SP`;
      color = '#f87171';
    }
  }

  if (window.showSkillConfirmModalReact) {
    window.showSkillConfirmModalReact({
      skill: s,
      statusText,
      color,
      canExecute: false, // 敵のスキルはプレイヤーが実行ボタンを押せない
    });
  }
}

/**
 * リーダースキル確認モーダルを閉じる
 */
export function closeSkillConfirm() {
  playSound(SOUNDS.seClick);
  if (window.closeSkillConfirmModalReact) window.closeSkillConfirmModalReact();
}
