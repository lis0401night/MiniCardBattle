import { CARD_MASTER } from '../utils/constants/cards.js';
import { playCardVoice } from '../utils/constants/voices.js';
import {
  addDamagePopupHook,
  createDamagePopup,
  getSeededRandom,
  hasSkill,
  mergeCardSkills,
  playSound,
  sleep,
} from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';
import { GameState } from '../state/gameState.js';
import { PLACE_ANIMATION_DURATION } from '../utils/constants/config.js';
import {
  renderBoard,
  renderHand,
  showSpeechBubble,
  updateCardPowerOnly,
  updateDeckDisplay,
  updateHPBar,
  updateSPOrbs,
} from '../services/uiBattle.js';

// 狙撃・拡散・迎撃などのVFXトリガー共通処理（DRY原則適用）
const SNIPE_SKILLS = [
  'snipe',
  'snipe_void',
  'spread',
  'spread_void',
  'intercept',
];
const SNIPE_DELAY_SKILLS = ['snipe', 'snipe_void', 'intercept'];

async function triggerSnipeVfx(source, side, lane) {
  if (!SNIPE_SKILLS.includes(source) || !window.triggerVfx) {
    return false;
  }

  const triggerSide = side === 'blue' ? 'red' : 'blue';
  window.triggerVfx('anm_skill_snipe', triggerSide, lane); // 非同期にしてテンポを向上

  if (SNIPE_DELAY_SKILLS.includes(source)) {
    await sleep(150); // 400msの演出開始に合わせて次の処理へ
  }

  return true;
}

let discardCardRef = null;
/**
 * 循環参照を回避しつつ、battle.jsのdiscardCard関数を登録するための依存性注入用関数
 */
export function registerDiscardCard(fn) {
  discardCardRef = fn;
}

/**
 * engine.js が生成したイベントログの配列を受け取り、
 * 順番にアニメーション、ポップアップ、効果音を再生する描画専用モジュール (Renderer)
 *
 * @param {Array} events - { type, side, lane, amount, source, ... } の配列
 */
export async function playEvents(events) {
  if (!events || !Array.isArray(events) || events.length === 0) return;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const sidePrefix = ev.side === 'blue' ? 'player' : 'enemy';
    const nextEv = events[i + 1];
    const isNextDamage =
      nextEv &&
      ['damage_card', 'damage_player', 'deadly'].includes(nextEv.type);

    switch (ev.type) {
      case 'vfx_trigger': {
        if (window.triggerVfx && ev.vfxId) {
          window.triggerVfx(ev.vfxId, ev.side, ev.lane);
          await sleep(200); // 演出が始まるまで少し待機
        }
        break;
      }
      case 'damage_card': {
        const board =
          ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        if (board[ev.lane]) board[ev.lane].currentPower -= ev.amount;

        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );

        // 狙撃（snipe, snipe_void）および拡散（spread, spread_void）、迎撃（intercept）用VFX
        await triggerSnipeVfx(ev.source, ev.side, ev.lane);

        if (cEl) {
          cEl.classList.remove('anim-shake');
          void cEl.offsetWidth; // reflow
          cEl.classList.add('anim-shake');

          let label = `-${ev.amount}`;
          if (ev.source === 'explode') label = `誘爆 ${label}`;

          createDamagePopup(cEl, label, '#ef4444');
        }
        updateCardPowerOnly(ev.lane, sidePrefix);
        if (!isNextDamage) {
          playSound(SOUNDS.seDamage);
          await sleep(300);
        }
        break;
      }
      case 'immune_block': {
        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );

        // 狙撃（snipe, snipe_void）および拡散（spread, spread_void）、迎撃（intercept）用VFX
        await triggerSnipeVfx(ev.source, ev.side, ev.lane);

        if (cEl) {
          createDamagePopup(cEl, '無効', '#94a3b8');
        }
        if (
          ![
            'snipe',
            'snipe_void',
            'spread',
            'spread_void',
            'intercept',
          ].includes(ev.source)
        ) {
          playSound(SOUNDS.seSkill);
        }
        await sleep(200);
        break;
      }
      case 'sturdy_block': {
        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          createDamagePopup(cEl, '頑丈', '#64748b');
        }
        playSound(SOUNDS.seSkill);
        await sleep(200);
        break;
      }
      case 'double_strike_proc': {
        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          createDamagePopup(cEl, '連撃', '#fbbf24');
        }
        playSound(SOUNDS.seSkill);
        await sleep(200);
        break;
      }
      case 'power_change': {
        const board =
          ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        if (board[ev.lane]) {
          board[ev.lane].currentPower += ev.amount; // 増減そのまま
          if (ev.source === 'holy_march') {
            board[ev.lane].power += ev.amount; // 永続バフとして記録
            board[ev.lane].basePower = board[ev.lane].power;
          }
        }

        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          const isBuff = ev.amount > 0;
          const prefix = isBuff ? '+' : '';
          const color = isBuff ? '#4ade80' : '#ef4444';

          let label = `${prefix}${ev.amount}`;
          if (ev.source === 'growth') label = `成長 ${label}`;
          else if (ev.source === 'soul_bind') label = `魂縛 ${label}`;
          else if (ev.source === 'soul_bind_void') label = `魂縛(虚) ${label}`;
          else if (ev.source === 'retaliate') label = `報復 ${label}`;

          createDamagePopup(cEl, label, color);
        }
        updateCardPowerOnly(ev.lane, sidePrefix);
        if (ev.source === 'equip' && ev.card) {
          // 「武装」による重ね配置の演出（配置音＋重ねられたトークンカードの出現ボイス）
          playSound(SOUNDS.sePlace);
          let voiceCat = ev.card.voiceCategory;
          if (!voiceCat) {
            const baseId = ev.card.baseId || ev.card.id;
            const cMaster = CARD_MASTER.find(
              (m) => m.id === baseId || m.name === ev.card.name
            );
            if (cMaster && cMaster.voiceCategory) {
              voiceCat = cMaster.voiceCategory;
            }
          }
          if (voiceCat) {
            playCardVoice(voiceCat, 'play');
          }
        } else {
          // 通常のパワー変動（バフ等）
          playSound(SOUNDS.seSkill);
        }
        await sleep(200);
        break;
      }
      case 'deadly': {
        const board =
          ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        if (board[ev.lane]) board[ev.lane].currentPower = 0;

        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          cEl.classList.remove('anim-shake');
          void cEl.offsetWidth;
          cEl.classList.add('anim-shake');

          createDamagePopup(cEl, '破壊', '#991b1b');
        }
        updateCardPowerOnly(ev.lane, sidePrefix);
        if (!isNextDamage) {
          playSound(SOUNDS.seDamage);
          await sleep(300);
        }
        break;
      }
      case 'damage_player': {
        if (ev.side === 'blue') GameState.playerHP -= ev.amount;
        else GameState.enemyHP -= ev.amount;

        if (ev.source === 'artillery' && window.triggerVfx) {
          const triggerSide = ev.side === 'blue' ? 'red' : 'blue'; // 被害側がblueなら発動側はred
          window.triggerVfx('anm_skill_artillery', triggerSide); // 非同期実行にしてテンポを向上
          await sleep(150); // 400msの爆発開始の瞬間に合わせてダメージ処理に移行
        }

        const hpFill = document.getElementById(`${sidePrefix}-hp-fill`);
        if (hpFill) {
          let label = `-${ev.amount}`;
          if (ev.source === 'contract') label = `契約 ${label}`;

          // 連続するリーダーダメージのポップアップが重ならないようYオフセットを計算
          let yOffset = 0;
          for (let j = i - 1; j >= 0; j--) {
            if (
              events[j].type === 'damage_player' &&
              events[j].side === ev.side
            ) {
              yOffset += 24; // 1つ前のポップアップ分だけ下にずらす
            } else {
              break;
            }
          }

          const rect = hpFill.getBoundingClientRect();
          const x = rect.left + rect.width / 2 - 10;
          const y = rect.top + yOffset;
          if (addDamagePopupHook) {
            addDamagePopupHook(x, y, label, '#ef4444');
          } else {
            createDamagePopup(hpFill, label, '#ef4444');
          }
        }

        // プレイヤー側の画面揺らし
        const playmat = document.getElementById(`playmat-${sidePrefix}`);
        if (playmat) {
          playmat.classList.remove('anim-shake');
          void playmat.offsetWidth;
          playmat.classList.add('anim-shake');
        } else if (ev.source === 'artillery') {
          document.body.classList.remove('anim-shake');
          void document.body.offsetWidth;
          document.body.classList.add('anim-shake');
        }

        updateHPBar();
        showSpeechBubble(ev.side);
        if (!isNextDamage) {
          playSound(SOUNDS.seDamage);
          await sleep(300);
        }
        break;
      }
      case 'heal_player': {
        let actualHeal = 0;
        if (ev.side === 'blue') {
          const before = GameState.playerHP;
          GameState.playerHP = Math.min(
            GameState.playerMaxHP,
            GameState.playerHP + ev.amount
          );
          actualHeal = GameState.playerHP - before;
        } else {
          const before = GameState.enemyHP;
          GameState.enemyHP = Math.min(
            GameState.enemyMaxHP,
            GameState.enemyHP + ev.amount
          );
          actualHeal = GameState.enemyHP - before;
        }

        if (actualHeal > 0) {
          const hpFill = document.getElementById(`${sidePrefix}-hp-fill`);
          if (hpFill) createDamagePopup(hpFill, `+${actualHeal}`, '#4ade80');

          if (ev.source === 'absorb' && ev.lane !== undefined) {
            const cEl = document.querySelector(
              `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
            );
            if (cEl) createDamagePopup(cEl, '吸収', '#4ade80');
          }
        }
        updateHPBar();
        // VFX演出がない回復（吸収等）の場合のみ、通常のSEを再生する（VFX側でseSkillが再生されるため重複防止）
        if (!['heal', 'heal_void'].includes(ev.source)) {
          playSound(SOUNDS.seSkill);
        }
        await sleep(300);
        break;
      }
      case 'charge_sp': {
        if (ev.side === 'blue') {
          const pMaxSP = GameState.playerConfig?.leaderSkill?.cost || 5;
          GameState.playerSP = Math.min(
            pMaxSP,
            Math.max(0, GameState.playerSP + ev.amount)
          );
        } else {
          const eMaxSP = GameState.enemyConfig?.leaderSkill?.cost || 5;
          GameState.enemySP = Math.min(
            eMaxSP,
            Math.max(0, GameState.enemySP + ev.amount)
          );
        }
        updateSPOrbs(ev.side);
        playSound(SOUNDS.seSkillCharge);
        await sleep(200);
        break;
      }
      case 'grant_skill': {
        renderBoard();
        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          const skillLabelMap = {
            deadly: '必殺付与',
            pierce: '貫通付与',
            absorb: '吸収付与',
            sturdy: '頑丈付与',
          };
          createDamagePopup(
            cEl,
            skillLabelMap[ev.skillId] || 'スキル付与',
            '#fbbf24'
          );
        }
        playSound(SOUNDS.seSkill);
        await sleep(300);
        break;
      }

      case 'equip_card': {
        const board =
          ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        const boardCard = board[ev.lane];
        if (boardCard) {
          boardCard.power =
            (boardCard.power || 0) + (ev.card.currentPower || 0);
          boardCard.basePower =
            (boardCard.basePower || 0) + (ev.card.currentPower || 0);
          boardCard.currentPower =
            (boardCard.currentPower || 0) + (ev.card.currentPower || 0);
          boardCard.equippedCards = boardCard.equippedCards || [];
          boardCard.equippedCards.push(JSON.parse(JSON.stringify(ev.card)));
          let addedSkills = [];
          if (
            ev.card.skill &&
            ev.card.skill !== 'none' &&
            ev.card.skill !== 'equip'
          )
            addedSkills.push({ id: ev.card.skill, value: ev.card.skillValue });
          if (ev.card.skills)
            ev.card.skills.forEach((s) => {
              if (s.id !== 'equip')
                addedSkills.push({ id: s.id, value: s.value });
            });
          mergeCardSkills(boardCard, addedSkills);

          renderBoard();
          playSound(SOUNDS.sePlace);

          const laneEl = document.getElementById(`${ev.side}-lane-${ev.lane}`);
          if (laneEl) {
            laneEl.classList.add('flash-effect');
            setTimeout(() => laneEl.classList.remove('flash-effect'), 500);
          }
        }
        break;
      }
      case 'summon_token':
      case 'summon_card': {
        const board =
          ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        // 上書き配置時の既存カード破棄（装備カードの墓地送り漏れを防ぐ）
        if (
          board[ev.lane] &&
          board[ev.lane].uid !== ev.card?.uid &&
          discardCardRef
        ) {
          await discardCardRef(ev.side, board[ev.lane], ev.lane, false);
        }
        board[ev.lane] = ev.card;

        // 保護フラグを即座に適用
        if (ev.card) ev.card.isSkillResolving = true;

        renderBoard();
        playSound(SOUNDS.sePlace);

        let voiceCat = ev.card ? ev.card.voiceCategory : null;
        // 「号令」などの効果でカードを装備配置した場合（source: 'equip'）に、
        // ボイスが装備される側の元のカードになってしまうバグを防ぐため、
        // アタッチされた装備カード側のボイスカテゴリを優先して参照する
        if (
          ev.source === 'equip' &&
          ev.card &&
          ev.card.equippedCards &&
          ev.card.equippedCards.length > 0
        ) {
          const lastEquip =
            ev.card.equippedCards[ev.card.equippedCards.length - 1];
          if (lastEquip && lastEquip.voiceCategory) {
            voiceCat = lastEquip.voiceCategory;
          }
        }

        if (!voiceCat && ev.card) {
          const baseId = ev.card.baseId || ev.card.id;
          const cMaster = CARD_MASTER.find(
            (m) => m.id === baseId || m.name === ev.card.name
          );
          if (cMaster && cMaster.voiceCategory) {
            voiceCat = cMaster.voiceCategory;
            ev.card.voiceCategory = voiceCat;
          }
        }

        if (voiceCat) {
          playCardVoice(voiceCat, 'play');
        }

        setTimeout(() => {
          const cEl = document.querySelector(
            `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
          );
          if (cEl) {
            if (ev.source === 'split') {
              createDamagePopup(cEl, '分裂', '#facc15');
            }
            if (ev.source === 'awake') {
              createDamagePopup(cEl, '覚醒', '#facc15');
            }
          }
        }, 50);

        await sleep(PLACE_ANIMATION_DURATION);
        // 召喚時演出終了のためフラグを解除。
        // 召喚時スキルを持つ場合は、別途 resolveOnPlaySkill 等の中で
        // 再度フラグが立てられ、適切に管理されることを前提とする。
        if (ev.card) {
          ev.card.isSkillResolving = false;
        }
        break;
      }

      case 'add_hand': {
        const hand =
          ev.side === 'blue' ? GameState.playerHand : GameState.enemyHand;
        if (hand.length < 5) {
          if (!ev.card.uid) {
            ev.card.uid = `${ev.side}_${Math.floor(getSeededRandom() * 1000000000)}_${getSeededRandom().toString(36).substr(2, 5)}`;
          }
          hand.push(ev.card);
        }
        renderHand();
        updateDeckDisplay(ev.side);
        playSound(SOUNDS.seDraw);
        await sleep(200);
        break;
      }
      case 'discard': {
        const hand =
          ev.side === 'blue' ? GameState.playerHand : GameState.enemyHand;
        if (ev.card) {
          let idx = -1;
          if (ev.card.uid) {
            idx = hand.findIndex((c) => c.uid === ev.card.uid);
          }
          // フォールバック: UIDで見つからなかった場合、非同期ズレ対策として名前やIDが一致するカードを手札の最後から探して破棄する
          if (idx === -1) {
            // uid比較ではなく、最も一致度が高いもの（基本は後ろのもの）を選ぶ
            for (let j = hand.length - 1; j >= 0; j--) {
              const c = hand[j];
              if (
                (c.uid && ev.card.uid && c.uid === ev.card.uid) ||
                c.id === ev.card.id ||
                (c.name === ev.card.name && c.power === ev.card.power)
              ) {
                idx = j;
                break;
              }
            }
          }
          if (idx !== -1) {
            const discardedCard = hand.splice(idx, 1)[0];
            const discardArr =
              ev.side === 'blue'
                ? GameState.playerDiscard
                : GameState.enemyDiscard;

            // 墓地送り時の完全リセット
            const masterData = CARD_MASTER.find(
              (m) => m.id === (discardedCard.baseId || discardedCard.id)
            );
            let restoredCard;
            if (masterData) {
              restoredCard = JSON.parse(JSON.stringify(masterData));
              restoredCard.uid = discardedCard.uid;
              restoredCard.owner = ev.side;
              restoredCard.baseId = discardedCard.baseId || discardedCard.id;
              if (discardedCard.isPremium !== undefined)
                restoredCard.isPremium = discardedCard.isPremium;
              restoredCard.basePower = restoredCard.power;
              restoredCard.currentPower = restoredCard.power;
            } else {
              restoredCard = { ...discardedCard };
              if ('basePower' in restoredCard)
                restoredCard.power = restoredCard.basePower;
              restoredCard.currentPower = restoredCard.power;
              restoredCard.skills = [];
            }
            if (!discardedCard.isToken) {
              discardArr.push(restoredCard);
            }
          }
        }
        updateDeckDisplay(ev.side);
        renderHand();
        break;
      }
      case 'add_skill': {
        const board =
          ev.side === 'blue' ? GameState.playerBoard : GameState.enemyBoard;
        const targetCard = board[ev.lane];
        if (targetCard) {
          if (!Array.isArray(targetCard.skills)) targetCard.skills = [];
          targetCard.skills.push({ id: ev.skillId, value: ev.value || 1 });
        }

        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );

        let skillNameText = ev.skillId === 'invincible' ? '無敵' : 'スキル付与';
        if (ev.source === 'stealth') skillNameText = '潜伏';
        if (cEl) createDamagePopup(cEl, skillNameText, '#facc15');

        if (ev.source === 'stealth' && window.triggerVfx) {
          await window.triggerVfx('anm_skill_stealth', ev.side, ev.lane);
        } else {
          playSound(SOUNDS.seSkill);
          await sleep(200);
        }
        break;
      }
      case 'invincible_block': {
        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          createDamagePopup(cEl, '無敵', '#cbd5e1');
          playSound(SOUNDS.seSkill);
        }
        await sleep(300);
        break;
      }
      case 'reflect_block': {
        const cEl = document.querySelector(
          `#${sidePrefix}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          createDamagePopup(cEl, '反射', '#a78bfa'); // purple
          playSound(SOUNDS.seSkill);
        }
        await sleep(300);
        break;
      }
      case 'skill_popup': {
        const atkPfx = ev.side === 'blue' ? 'player' : 'enemy';
        const cEl = document.querySelector(
          `#${atkPfx}-lanes .cell[data-lane="${ev.lane}"] .card`
        );
        if (cEl) {
          createDamagePopup(cEl, ev.skillName, '#facc15');
          // 簒奪 (extort) の場合は専用のVFXを発火させる
          if (ev.skillName === '簒奪' && window.triggerVfx) {
            window.triggerVfx('anm_skill_extort', ev.side, ev.lane);
          }
          playSound(SOUNDS.seSkill);
          await sleep(300);
        }
        break;
      }
      case 'leader_skill': {
        playSound(SOUNDS.seSkill);
        await sleep(400);
        break;
      }
      case 'deck_mill': {
        const targetDeck =
          ev.side === 'blue' ? GameState.playerDeck : GameState.enemyDeck;
        const targetDiscard =
          ev.side === 'blue' ? GameState.playerDiscard : GameState.enemyDiscard;
        if (targetDeck && targetDeck.length > 0) {
          const milledCards = targetDeck.splice(0, ev.count);
          targetDiscard.push(...milledCards);
        }
        updateDeckDisplay(ev.side);
        playSound(SOUNDS.seDraw);
        await sleep(200);
        break;
      }
      case 'attack': {
        const atkPfx = ev.attackerSide === 'blue' ? 'player' : 'enemy';
        const atkEl = document.querySelector(
          `#${atkPfx}-lanes .cell[data-lane="${ev.lane}"]`
        );
        if (atkEl) {
          atkEl.style.animation = 'none'; // リセット
          void atkEl.offsetHeight; // リフロー

          if (ev.attackerSide === 'blue') {
            atkEl.style.animation =
              'attack-up 1.0s cubic-bezier(0.4, 0, 0.2, 1) forwards';
          } else {
            atkEl.style.animation =
              'attack-down 1.0s cubic-bezier(0.4, 0, 0.2, 1) forwards';
          }
          atkEl.style.zIndex = '20';
          playSound(SOUNDS.seAttack);

          // 1秒のアニメーション終了後にスタイルを元に戻す
          setTimeout(() => {
            if (atkEl) {
              atkEl.style.animation = '';
              atkEl.style.zIndex = '';
            }
          }, 1000);
        }
        // アニメーションが衝突するタイミング（約0.5秒）まで待機してから次のダメージ処理へ進む
        await sleep(500);
        break;
      }
      case 'destroy_cards': {
        if (!ev.targets || ev.targets.length === 0) break;

        let anyValidTarget = false;
        let playedVoices = new Set();

        // フェーズ1: 一斉にアニメーションと音を再生
        for (const target of ev.targets) {
          const sidePrefix = target.side === 'blue' ? 'player' : 'enemy';
          const deadCard = target.card; // engine.jsによって既にboardから消えnullになっているため、event内のキャッシュを使う

          if (deadCard) {
            const cell = document.querySelector(
              `#${sidePrefix}-lanes .cell[data-lane="${target.lane}"]`
            );
            if (cell) {
              const cardEl = cell.querySelector('.card');
              if (cardEl) {
                cardEl.classList.remove('anim-shake');
                void cardEl.offsetWidth; // リフローを発生させてアニメーションを再トリガー
                cardEl.classList.add('anim-shake');
              }
            }

            // 誘爆(explode)スキルのVFXトリガー
            if (hasSkill(deadCard, 'explode') && window.triggerVfx) {
              window.triggerVfx(
                'anm_skill_explode',
                target.side === 'blue' ? 'blue' : 'red',
                target.lane
              );
            }

            if (
              deadCard.voiceCategory &&
              !playedVoices.has(deadCard.voiceCategory)
            ) {
              playCardVoice(deadCard.voiceCategory, 'death');
              playedVoices.add(deadCard.voiceCategory);
            }
            anyValidTarget = true;
          }
        }

        if (!anyValidTarget) break;

        playSound(SOUNDS.seDestroy); // SEは1回だけ
        await sleep(400); // 破壊アニメーション待ち

        // フェーズ2: 一斉にデータを消去・墓地送りにして再描画
        for (const target of ev.targets) {
          const sidePrefix = target.side === 'blue' ? 'player' : 'enemy';
          const board =
            target.side === 'blue'
              ? GameState.playerBoard
              : GameState.enemyBoard;
          const deadCard = target.card;

          if (deadCard) {
            board[target.lane] = null; // 安全のため再度null化
            if (deadCard.equippedCards && deadCard.equippedCards.length > 0) {
              for (const eqCard of deadCard.equippedCards) {
                let restoredEq;
                // 【傀儡】装備カードが傀儡で奪ったものの場合、元の持ち主の墓地へ返す
                const eqOwner =
                  eqCard.puppetOriginalOwner || eqCard.owner || target.side;
                const discard =
                  eqOwner === 'blue'
                    ? GameState.playerDiscard
                    : GameState.enemyDiscard;
                const eqMaster = CARD_MASTER.find(
                  (m) => m.id === (eqCard.baseId || eqCard.id)
                );
                if (eqMaster) {
                  restoredEq = JSON.parse(JSON.stringify(eqMaster));
                  restoredEq.uid = eqCard.uid;
                  restoredEq.owner = eqOwner;
                  restoredEq.baseId = eqCard.baseId || eqCard.id;
                  restoredEq.basePower = restoredEq.power;
                  restoredEq.currentPower = restoredEq.power;
                } else {
                  restoredEq = { ...eqCard };
                  if (restoredEq.puppetOriginalOwner)
                    delete restoredEq.puppetOriginalOwner;
                }
                if (!restoredEq.isToken) {
                  discard.push(restoredEq);
                }
              }
              deadCard.equippedCards = [];
              updateDeckDisplay(target.side);
            }

            if (deadCard.unionMaterials && deadCard.unionMaterials.length > 0) {
              for (const matCard of deadCard.unionMaterials) {
                let restoredMat;
                // 【傀儡対応】合体素材に puppetOriginalOwner がある場合は元の持ち主の墓地に返却
                const matOwner =
                  matCard.puppetOriginalOwner || matCard.owner || target.side;
                const discard =
                  matOwner === 'blue'
                    ? GameState.playerDiscard
                    : GameState.enemyDiscard;
                const matMaster = CARD_MASTER.find(
                  (m) => m.id === (matCard.baseId || matCard.id)
                );
                if (matMaster) {
                  restoredMat = JSON.parse(JSON.stringify(matMaster));
                  restoredMat.uid = matCard.uid;
                  restoredMat.owner = matOwner;
                  restoredMat.baseId = matCard.baseId || matCard.id;
                  restoredMat.basePower = restoredMat.power;
                  restoredMat.currentPower = restoredMat.power;
                } else {
                  restoredMat = { ...matCard };
                }
                if (restoredMat.puppetOriginalOwner)
                  delete restoredMat.puppetOriginalOwner;
                if (!restoredMat.isToken) {
                  discard.push(restoredMat);
                }
              }
              deadCard.unionMaterials = [];
              updateDeckDisplay(target.side);
            }

            if (deadCard.originalRevertTarget) {
              const rvTarget = deadCard.originalRevertTarget;
              // 【傀儡対応】石化された元カードに puppetOriginalOwner がある場合は元の持ち主の墓地に返却
              const rvOwner = rvTarget.puppetOriginalOwner || target.side;
              const discard =
                rvOwner === 'blue'
                  ? GameState.playerDiscard
                  : GameState.enemyDiscard;
              const masterData = CARD_MASTER.find(
                (m) => m.id === (rvTarget.baseId || rvTarget.id)
              );
              let restoredCard;
              if (masterData) {
                restoredCard = JSON.parse(JSON.stringify(masterData));
                restoredCard.uid = rvTarget.uid;
                restoredCard.owner = rvOwner;
                restoredCard.baseId = rvTarget.baseId || rvTarget.id;
                if (rvTarget.isPremium !== undefined)
                  restoredCard.isPremium = rvTarget.isPremium;
                restoredCard.basePower = restoredCard.power;
                restoredCard.currentPower = restoredCard.power;
              } else {
                restoredCard = { ...rvTarget };
                restoredCard.equippedCards = [];
              }
              if (restoredCard.puppetOriginalOwner)
                delete restoredCard.puppetOriginalOwner;
              if (!restoredCard.isToken) {
                discard.push(restoredCard);
              }
              updateDeckDisplay(rvOwner);
            } else if (!deadCard.isToken) {
              // 【傀儡】傀儡スキルで奪ったカードは元の持ち主の墓地へ返す
              const deadOwner = deadCard.puppetOriginalOwner || target.side;
              const discard =
                deadOwner === 'blue'
                  ? GameState.playerDiscard
                  : GameState.enemyDiscard;

              const masterData = CARD_MASTER.find(
                (m) => m.id === (deadCard.baseId || deadCard.id)
              );
              let restoredCard;
              if (masterData) {
                restoredCard = JSON.parse(JSON.stringify(masterData));
                restoredCard.uid = deadCard.uid;
                restoredCard.owner = deadOwner;
                restoredCard.baseId = deadCard.baseId || deadCard.id;
                if (deadCard.isPremium !== undefined)
                  restoredCard.isPremium = deadCard.isPremium;
                restoredCard.basePower = restoredCard.power;
                restoredCard.currentPower = restoredCard.power;
              } else {
                restoredCard = { ...deadCard };
                if ('basePower' in restoredCard)
                  restoredCard.power = restoredCard.basePower;
                restoredCard.currentPower = restoredCard.power;
                restoredCard.skills = [];
                if (restoredCard.puppetOriginalOwner)
                  delete restoredCard.puppetOriginalOwner;
              }

              discard.push(restoredCard);
              updateDeckDisplay(deadOwner);
            }
            board[target.lane] = null;

            // アニメーション用クラスのクリーンアップ
            const cell = document.querySelector(
              `#${sidePrefix}-lanes .cell[data-lane="${target.lane}"]`
            );
            if (cell) {
              const cardEl = cell.querySelector('.card');
              if (cardEl) {
                cardEl.classList.remove('anim-shake');
              }
            }
          }
        }

        renderBoard();
        break;
      }
    }
  }

  // 全てのアニメーションが完了するのを確実に待つためのバッファ
  await sleep(600);
}
