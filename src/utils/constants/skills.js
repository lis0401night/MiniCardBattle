/**
 * Mini Card Battle - Skill Definitions
 */
import { CARD_MASTER } from './cards.js';

/**
 * スキル定義またはカードオブジェクトから対象カードID配列を解決する。
 *
 * @param {object|null|undefined} sk - 対象のスキルオブジェクト、またはカードオブジェクト
 * @param {string} [skillId] - 解決対象のスキルID
 * @returns {Array<string>|null} 対象カードID配列。未指定ならnull
 */
function resolveTargetIds(sk, skillId) {
  if (!sk) return null;
  const direct = sk.targetIds || (sk.targetId ? [sk.targetId] : null);
  if (direct) return direct;

  if (skillId && Array.isArray(sk.skills)) {
    const nested = sk.skills.find((s) => s.id === skillId);
    if (nested) {
      return nested.targetIds || (nested.targetId ? [nested.targetId] : null);
    }
  }
  return null;
}

/**
 * 対象カードID配列からリンクセグメント配列（読点区切りのカードリンク）を生成する。
 *
 * @param {Array<string>|null|undefined} targetIds - 対象カードID配列
 * @returns {Array<{type: string, value: string, targetId?: string}>} リンクセグメント配列
 */
function createCardLinkSegments(targetIds) {
  if (!Array.isArray(targetIds) || targetIds.length === 0) return [];
  const links = [];
  targetIds.forEach((id, idx) => {
    if (idx > 0) links.push({ type: 'text', value: '、' });
    const card = CARD_MASTER?.find((c) => c.id === id);
    const name = card ? card.name : id;
    links.push({ type: 'link', value: `「${name}」`, targetId: id });
  });
  return links;
}

/**
 * スキル定義またはカードオブジェクトから対象スキルID配列を解決する。
 *
 * @param {object|null|undefined} sk - 対象のスキルオブジェクト、またはカードオブジェクト
 * @param {string} [skillId] - 解決対象のスキルID（例: 'summon'）
 * @returns {Array<string>} 重複を除去した対象スキルID配列
 */
function resolveTargetSkills(sk, skillId) {
  if (!sk) return [];
  const targetSource =
    sk.targetSkills !== undefined || sk.targetSkill !== undefined
      ? sk
      : skillId && Array.isArray(sk.skills)
        ? sk.skills.find((s) => s.id === skillId)
        : null;

  if (!targetSource) return [];

  let raw = [];
  if (Array.isArray(targetSource.targetSkills)) {
    raw = targetSource.targetSkills.filter(Boolean);
  } else if (
    typeof targetSource.targetSkills === 'string' &&
    targetSource.targetSkills.trim() !== ''
  ) {
    raw = [targetSource.targetSkills.trim()];
  } else if (targetSource.targetSkill) {
    raw = [targetSource.targetSkill];
  }
  return [...new Set(raw)];
}

export const SKILLS = {
  none: { name: '通常', icon: '', desc: () => '' },
  quick: {
    name: '速攻',
    icon: '⚡',
    desc: () => '召喚時、ただちに攻撃する。',
  },
  deadly: {
    name: '必殺',
    icon: '☠️',
    desc: () => '戦闘ダメージを与えた相手を破壊する。',
  },
  draw: {
    name: '入替',
    icon: '🃏',
    desc: (val) => `召喚時、手札を${val || 1}枚まで捨て、同数引く。`,
  },
  heal: {
    name: '回復',
    icon: '💚',
    desc: (val) => `召喚時、自分リーダーのHPを${val || 3}回復する。`,
  },
  snipe: {
    name: '狙撃',
    icon: '🎯',
    desc: (val) =>
      `召喚時、相手の場の最大パワーのカード1枚に${val || 4}ダメージ。（同値の場合は左優先）`,
  },
  spread: {
    name: '拡散',
    icon: '☄️',
    desc: (val) => `召喚時、正面とその隣のカードに${val || 2}ダメージ。`,
  },
  morph: {
    name: '変化',
    icon: '🌀',
    desc: (val) => [
      {
        type: 'text',
        value: `召喚時、相手の手札の最大パワーのカード${val}枚を捨て、同数`,
      },
      { type: 'link', value: `「虚空（パワー0）」`, targetId: 'token_void' },
      { type: 'text', value: 'を加える。（同値の場合は左優先）' },
    ],
  },
  double_strike: {
    name: '連撃',
    icon: '⚔️',
    desc: () => '戦闘時、敵カードに与えるダメージが2倍になる。',
  },
  support: {
    name: '援護',
    icon: '🚩',
    desc: (val) => `召喚時、隣のカードのパワーを+${val || 2}する。`,
  },
  defender: {
    name: '防御',
    icon: '🧱',
    desc: () => '攻撃せず、敵カードや敵リーダーにダメージを与えられない。',
  },
  clone: {
    name: '分身',
    icon: '👥',
    desc: (val) =>
      `召喚時、隣のレーンに、自身と同じパワーと能力のトークンを${val || 1}体まで配置する。`,
  },
  lone_wolf: {
    name: '単騎',
    icon: '🐺',
    desc: (val) =>
      `召喚時、自分の空いているレーンの数×${val || 3}だけパワーを上げる。`,
  },
  portent: {
    name: '凶兆',
    icon: '🔪',
    desc: () =>
      '召喚時、自分リーダーのHPが13を下回っている場合、その差分だけパワーを上げる。',
  },
  soul_bind: {
    name: '魂縛',
    icon: '⛓️',
    desc: (val) => `戦闘で敵を破壊した時、パワーを+${val || 2}する。`,
  },
  sturdy: {
    name: '頑丈',
    icon: '⛰',
    desc: () => '戦闘時、受けるダメージを半減する（端数切り捨て）。',
  },
  berserk: {
    name: '狂乱',
    icon: '💢',
    desc: (val) => `召喚時、隣のカードに${val}ダメージ。`,
  },
  split: {
    name: '分裂',
    icon: '🐙',
    desc: (val, sk) => {
      const summonCard = sk?.summonId
        ? CARD_MASTER.find((c) => c.id === sk.summonId)
        : null;
      if (summonCard) {
        return [
          { type: 'text', value: '破壊時、同じレーンに' },
          {
            type: 'link',
            value: `「${summonCard.name}（パワー${val}）」`,
            targetId: sk.summonId,
          },
          { type: 'text', value: 'を出す。' },
        ];
      }
      return `破壊時、同じレーンにパワー${val}のトークンを出す。`;
    },
  },
  sacrifice: {
    name: '代償',
    icon: '🩸',
    desc: (val) => `召喚時、自分リーダーに${val || 3}ダメージ`,
  },
  bind: {
    name: '拘束',
    icon: '🕸️',
    desc: (val) => `召喚時、正面のカードに${val}ターンの間「防御」を付与する。`,
  },
  growth: {
    name: '成長',
    icon: '🌱',
    desc: (val) =>
      `自分のターン開始時、パワーを${val >= 0 ? '+' : ''}${val}する。`,
  },
  intercept: {
    name: '迎撃',
    icon: '👁',
    desc: (val) =>
      `自分のターン開始時、相手の場の最大パワーのカード1枚に${val || 2}ダメージ。（同値の場合は左優先）`,
  },
  hero: {
    name: '英雄',
    icon: '🏆',
    desc: (val) =>
      `召喚時、自分の他の埋まっているレーンにつきパワーを${val >= 0 ? '+' : ''}${val}する`,
  },
  charge: {
    name: '充填',
    icon: '🔋',
    desc: (val) => `召喚時、自分リーダーのSPを${val >= 0 ? '+' : ''}${val}する`,
  },
  spend: {
    name: '消費',
    icon: '🪫',
    desc: (val) => `召喚時、自分リーダーのSPを${val >= 0 ? '-' : ''}${val}する`,
  },
  stealth: {
    name: '潜伏',
    icon: '👣',
    desc: (val) =>
      `召喚時、自身に無敵${val || 1}（戦闘ダメージを受けない）を付与する。`,
  },
  invincible: {
    name: '無敵',
    icon: '✨',
    desc: (val) => `${val}ターンの間、戦闘でダメージを受けない。`,
  },
  reflect: {
    name: '反射',
    icon: '↩️',
    desc: () =>
      '戦闘で受けるダメージをランダムなカードに肩代わりさせる。（自身が選ばれた場合は通常通り受ける）また、カードを装備できず、装備になれない。',
  },
  guardian: {
    name: '守護',
    icon: '🛡️',
    desc: () => '隣のレーンの味方が戦闘で受けるダメージを肩代わりする。',
  },
  legendary: {
    name: '伝説',
    icon: '👑',
    desc: () => '中央のレーンにしか召喚できない。',
  },
  takeover: {
    name: '生贄',
    icon: '🦖',
    desc: () => 'カードが配置されているレーンにしか召喚できない。',
  },
  pierce: {
    name: '貫通',
    icon: '🔱',
    desc: () =>
      '攻撃時、自身のパワーの差分だけ相手リーダーに戦闘ダメージを与える。',
  },
  explode: {
    name: '誘爆',
    icon: '💣',
    desc: (val) => `破壊時、隣のカードに${val || 3}ダメージ。`,
  },
  contract: {
    name: '契約',
    icon: '📜',
    desc: (val) => `自分のターン開始時、自分リーダーに${val || 3}ダメージ。`,
  },
  choice: {
    name: '選択',
    icon: '🌓',
    desc: (val) => `召喚時、以下のスキルから${val}つを選んで発動する。`,
  },
  force: {
    name: '命令',
    icon: '⚖️',
    desc: (val) => `召喚時、以下のスキルから相手が${val}つを選んで発動する。`,
  },
  metamorph: {
    name: '変身',
    icon: '❓',
    desc: () =>
      '召喚時、全カードの中からランダムに1枚に変身し、その能力を発動する。',
  },
  resurrect: {
    name: '復活',
    icon: '⚰️',
    desc: (val, sk) => {
      const targetIds = resolveTargetIds(sk, 'resurrect');
      const isExcludeBoard =
        sk?.excludeBoard ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find((s) => s.id === 'resurrect')?.excludeBoard
          : false);
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const links = createCardLinkSegments(targetIds);
        return [
          {
            type: 'text',
            value: isExcludeBoard
              ? '召喚時、自分の墓地から自分の場にいない'
              : '召喚時、自分の墓地から',
          },
          ...links,
          {
            type: 'text',
            value:
              targetIds.length > 1
                ? 'のいずれか1枚を選択して配置する。'
                : 'を1枚選択して配置する。',
          },
        ];
      }
      if (isExcludeBoard) {
        return `召喚時、自分の墓地から自分の場にいないパワー${val}以下のカード1枚を選択して配置する。`;
      }
      return `召喚時、自分の墓地からパワー${val}以下のカード1枚を選択して配置する。`;
    },
  },
  summon: {
    name: '召喚',
    icon: '📢',
    desc: (val, sk) => {
      const targetIds = resolveTargetIds(sk, 'summon');
      const isExcludeBoard =
        sk?.excludeBoard ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find((s) => s.id === 'summon')?.excludeBoard
          : false);
      const isTargetToken = Boolean(
        sk?.targetToken ||
        sk?.targetType === 'token' ||
        (Array.isArray(sk?.skills) &&
          sk.skills.some(
            (s) =>
              s.id === 'summon' && (s.targetToken || s.targetType === 'token')
          ))
      );
      if (isTargetToken) {
        const powerText =
          val !== undefined && val !== null ? `パワー${val}以下の` : '';
        return [
          {
            type: 'text',
            value: isExcludeBoard
              ? `召喚時、手札から自分の場にいない${powerText}トークンカード1枚を召喚できる。そうした場合、手札に`
              : `召喚時、手札から${powerText}トークンカード1枚を召喚できる。そうした場合、手札に`,
          },
          {
            type: 'link',
            value: '「虚空（パワー0）」',
            targetId: 'token_void',
          },
          { type: 'text', value: 'を加える。' },
        ];
      }
      const isSelf = Boolean(
        sk?.self ||
        sk?.targetSelf ||
        (Array.isArray(sk?.skills) &&
          sk.skills.some((s) => s.id === 'summon' && (s.self || s.targetSelf)))
      );
      if (isSelf) {
        return [
          {
            type: 'text',
            value: isExcludeBoard
              ? '召喚時、手札から自分の場にいない自身と同じカード1枚を召喚できる。そうした場合、手札に'
              : '召喚時、手札から自身と同じカード1枚を召喚できる。そうした場合、手札に',
          },
          {
            type: 'link',
            value: '「虚空（パワー0）」',
            targetId: 'token_void',
          },
          { type: 'text', value: 'を加える。' },
        ];
      }
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const links = createCardLinkSegments(targetIds);
        return [
          {
            type: 'text',
            value: isExcludeBoard
              ? '召喚時、手札から自分の場にいない'
              : '召喚時、手札から',
          },
          ...links,
          {
            type: 'text',
            value:
              targetIds.length > 1
                ? 'のいずれか1枚を召喚できる。そうした場合、手札に'
                : 'を1枚召喚できる。そうした場合、手札に',
          },
          {
            type: 'link',
            value: '「虚空（パワー0）」',
            targetId: 'token_void',
          },
          { type: 'text', value: 'を加える。' },
        ];
      }
      const targetKeyword =
        sk?.targetKeyword ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find((s) => s.id === 'summon')?.targetKeyword
          : null);
      if (targetKeyword) {
        return [
          {
            type: 'text',
            value: isExcludeBoard
              ? '召喚時、手札から自分の場にいない'
              : '召喚時、手札から',
          },
          {
            type: 'link',
            value: `「${targetKeyword}」カード`,
            targetKeyword,
          },
          {
            type: 'text',
            value: 'を1枚召喚できる。そうした場合、手札に',
          },
          {
            type: 'link',
            value: '「虚空（パワー0）」',
            targetId: 'token_void',
          },
          { type: 'text', value: 'を加える。' },
        ];
      }
      const targetSkills = resolveTargetSkills(sk, 'summon');
      if (targetSkills.length > 0) {
        const links = [];
        targetSkills.forEach((sId, idx) => {
          if (idx > 0) links.push({ type: 'text', value: '、' });
          const skDef = SKILLS?.[sId];
          const name = skDef ? skDef.name : sId;
          links.push({
            type: 'link',
            value: `「${name}」`,
            targetSkillId: sId,
          });
        });
        return [
          {
            type: 'text',
            value: isExcludeBoard
              ? '召喚時、手札から自分の場にいない'
              : '召喚時、手札から',
          },
          ...links,
          {
            type: 'text',
            value:
              targetSkills.length > 1
                ? '能力のいずれかを持つカード1枚を召喚できる。そうした場合、手札に'
                : '能力を持つカード1枚を召喚できる。そうした場合、手札に',
          },
          {
            type: 'link',
            value: '「虚空（パワー0）」',
            targetId: 'token_void',
          },
          { type: 'text', value: 'を加える。' },
        ];
      }
      if (val !== undefined && val !== null) {
        return [
          {
            type: 'text',
            value: isExcludeBoard
              ? `召喚時、手札から自分の場にいないパワー${val}以下のカード1枚を召喚できる。そうした場合、手札に`
              : `召喚時、手札からパワー${val}以下のカード1枚を召喚できる。そうした場合、手札に`,
          },
          {
            type: 'link',
            value: '「虚空（パワー0）」',
            targetId: 'token_void',
          },
          { type: 'text', value: 'を加える。' },
        ];
      }
      return [
        {
          type: 'text',
          value: isExcludeBoard
            ? '召喚時、手札から自分の場にいないカードを召喚できる。そうした場合、手札に'
            : '召喚時、手札からカードを召喚できる。そうした場合、手札に',
        },
        {
          type: 'link',
          value: '「虚空（パワー0）」',
          targetId: 'token_void',
        },
        { type: 'text', value: 'を加える。' },
      ];
    },
  },
  assemble: {
    name: '召集',
    icon: '📜',
    desc: (val, sk) => {
      const isSelf = Boolean(
        sk?.self ||
        sk?.targetSelf ||
        (Array.isArray(sk?.skills) &&
          sk.skills.some(
            (s) => s.id === 'assemble' && (s.self || s.targetSelf)
          ))
      );
      if (isSelf) {
        return '召喚時、デッキから自身と同じカード1枚を自分のレーンに召喚する。';
      }
      const targetIds = resolveTargetIds(sk, 'assemble');
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const links = createCardLinkSegments(targetIds);
        return [
          { type: 'text', value: '召喚時、デッキから' },
          ...links,
          {
            type: 'text',
            value:
              targetIds.length > 1
                ? 'のいずれか1枚を自分のレーンに召喚する。'
                : 'を1枚自分のレーンに召喚する。',
          },
        ];
      }
      const targetKeyword =
        sk?.targetKeyword ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find((s) => s.id === 'assemble')?.targetKeyword
          : null);
      if (targetKeyword) {
        return [
          { type: 'text', value: '召喚時、デッキから' },
          {
            type: 'link',
            value: `「${targetKeyword}」カード`,
            targetKeyword,
          },
          {
            type: 'text',
            value: '1枚を自分のレーンに召喚する。',
          },
        ];
      }
      if (val !== undefined && val !== null) {
        return [
          {
            type: 'text',
            value: `召喚時、デッキからパワー${val}以下のカード1枚を自分のレーンに召喚する。`,
          },
        ];
      }
      return [
        {
          type: 'text',
          value: '召喚時、デッキからカード1枚を自分のレーンに召喚する。',
        },
      ];
    },
  },
  standby: {
    name: '待機',
    icon: '⏳',
    desc: (val) => `召喚時、自身に${val}ターン防御を付与する。`,
  },
  artillery: {
    name: '砲撃',
    icon: '💥',
    desc: (val) => `召喚時、相手リーダーに${val}ダメージ`,
  },
  decree: {
    name: '宣告',
    icon: '🔔',
    desc: (val) =>
      `召喚時、相手リーダーに手札の「宣告」を持つカードの枚数×${val || 4}ダメージ`,
  },
  shuffle: {
    name: '攪乱',
    icon: '🃏',
    desc: () =>
      '召喚時、お互いの手札を全て捨て、墓地をリセットする。その後、お互いにカードを3枚引く。',
  },
  servant: {
    name: '使役',
    icon: '✨',
    desc: (val, sk) => {
      const summonId =
        sk?.summonId ||
        sk?.tokenId ||
        sk?.skills?.find((s) => s.id === 'servant')?.summonId;
      const summonCard = summonId
        ? CARD_MASTER.find((c) => c.id === summonId)
        : null;
      if (summonCard) {
        return [
          { type: 'text', value: '召喚時、自分のレーンに、' },
          {
            type: 'link',
            value: `「${summonCard.name}（パワー${val}）」`,
            targetId: summonId,
          },
          { type: 'text', value: 'を配置する。' },
        ];
      }
      return `召喚時、自分のレーンに、パワー${val}のトークンを配置する。`;
    },
  },
  ambush: {
    name: '奇襲',
    icon: '✨',
    desc: (val, sk) => {
      const summonId =
        sk?.summonId || sk?.skills?.find((s) => s.id === 'ambush')?.summonId;
      const summonCard = summonId
        ? CARD_MASTER.find((c) => c.id === summonId)
        : null;
      if (summonCard) {
        return [
          { type: 'text', value: '召喚時、自分のレーンに、' },
          {
            type: 'link',
            value: `「${summonCard.name}（パワー${val}）」`,
            targetId: summonId,
          },
          {
            type: 'text',
            value:
              'を配置する。その後、そのレーンのカードをただちに攻撃させる。',
          },
        ];
      }
      return `召喚時、自分のレーンに、パワー${val}のトークンを配置する。その後、そのレーンのカードをただちに攻撃させる。`;
    },
  },
  startup: {
    name: '起動',
    icon: '🏍',
    desc: () =>
      '1回まで自身の上にカードを配置するとき、代わりに防御を失う。(重ねたカードは墓地に送られる)',
  },
  immune: {
    name: '無効',
    icon: '🚫',
    desc: () => '能力による破壊やダメージを受けない。',
  },
  dodge: {
    name: '回避',
    icon: '💠',
    desc: (val) =>
      `${val}以上のダメージを無効化する。（防御が付与されている場合は無効）`,
  },
  fate: {
    name: '運命',
    icon: '🎲',
    desc: () => '召喚時、5/6で相手に1~3ダメージ、1/6で自分に6ダメージ。',
  },
  salvage: {
    name: '回収',
    icon: '🧲',
    desc: (val) =>
      `召喚時、手札を${val || 1}枚まで捨て、同数自分の墓地からカードを手札に加える。`,
  },
  reinforce: {
    name: '増援',
    icon: '📣',
    desc: (val) =>
      `召喚時、手札を${val || 1}枚まで捨て、同数自身と同じパワーのトークンを手札に加える。`,
  },
  extort: {
    name: '簒奪',
    icon: '💰',
    desc: (val) => [
      {
        type: 'text',
        value: `相手リーダーに戦闘ダメージを与えた時、相手の手札の最大パワーのカード${val || 1}枚を捨て、同数`,
      },
      { type: 'link', value: `「虚空（パワー0）」`, targetId: 'token_void' },
      { type: 'text', value: 'を加える。（同値の場合は左優先）' },
    ],
  },
  toxic: {
    name: '有毒',
    icon: '🧪',
    desc: (val) => `召喚時、正面のカードに成長${-val}を付与する。`,
  },
  convert: {
    name: '対価',
    icon: '⚖',
    desc: (val) => [
      { type: 'text', value: `召喚時、手札を${val || 1}枚捨て、同数` },
      { type: 'link', value: `「虚空（パワー0）」`, targetId: 'token_void' },
      { type: 'text', value: 'を加える。' },
    ],
  },
  madness: {
    name: '狂気',
    icon: '🚪',
    desc: () => '手札から捨てられた時、自分のレーンに召喚できる。',
  },
  reanimate: {
    name: '反魂',
    icon: '👻',
    /**
     * 「反魂」スキルの説明テキストを生成する。
     * @returns {string} スキル説明文
     */
    desc: () => 'デッキから墓地に送られた時、自分のレーンに召喚できる。',
  },
  dispel: {
    name: '解除',
    icon: '🔓',
    desc: () =>
      `召喚時、お互いの場の全ての「装備」を解除し、「装備」を持つカードを全て破壊する。`,
  },
  invade: {
    name: '侵略',
    icon: '🛸',
    desc: () => '召喚時、自分の墓地のカードの種類1枚につきパワーを+1する。',
  },
  replicate: {
    name: '複製',
    icon: '👯',
    desc: () =>
      '召喚時、最もパワーが高い自分の他のカード1体のパワー分、自身のパワーを+する。',
  },
  equip: {
    name: '装備',
    icon: '🗡️',
    desc: () =>
      'カードが配置されているレーンに配置するとき、下のカードに自身と同じパワーと能力を付与する。',
  },
  phase: {
    name: '位相',
    icon: '🌫️',
    desc: () =>
      '「位相」か「防御」を持たないカードと戦闘を行わず、互いにリーダーを直接攻撃する。（防御が付与されている場合は無効）',
  },
  petrify: {
    name: '石化',
    icon: '🗿',
    desc: () => [
      { type: 'text', value: '召喚時、正面のカードを' },
      {
        type: 'link',
        value: '「石像（パワー5、防御、頑丈）」',
        targetId: 'token_statue',
      },
      {
        type: 'text',
        value: 'に変身させる。（破壊時、元のカードが墓地に置かれる）',
      },
    ],
  },
  oblivion: {
    name: '沈黙',
    icon: '⚪',
    desc: () => '召喚時、お互いの場のカードの全ての能力をなくす。',
  },
  silence: {
    name: '忘却',
    icon: '⚪',
    desc: () => '召喚時、正面のカードの全ての能力をなくす。',
  },
  trigger: {
    name: '誘発',
    icon: '⚡',
    /**
     * 「誘発」スキルの説明テキストを生成する。
     * @returns {string} スキル説明文
     */
    desc: () =>
      '相手がカードを召喚したとき、手札から召喚できる。そうした場合、手札に「虚空（パワー0）」を加える。',
    /**
     * 「誘発」スキルのリッチテキストセグメントを生成する。
     * @returns {Array<object>} テキストセグメント配列
     */
    descSegments: () => [
      {
        type: 'text',
        value:
          '相手がカードを召喚したとき、手札から召喚できる。そうした場合、手札に',
      },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      { type: 'text', value: 'を加える。' },
    ],
  },
  call: {
    name: '号令',
    icon: '📯',
    desc: (val, sk) => {
      const targetIds = resolveTargetIds(sk, 'call');
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const links = createCardLinkSegments(targetIds);
        return [
          {
            type: 'text',
            value: '召喚時、自分のデッキの一番上のカードを公開し、',
          },
          ...links,
          {
            type: 'text',
            value:
              targetIds.length > 1
                ? 'のいずれかなら自分のレーンに召喚できる。'
                : 'なら自分のレーンに召喚できる。',
          },
        ];
      }
      const keyword =
        sk?.targetKeyword ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find((s) => s.id === 'call')?.targetKeyword
          : null);
      if (keyword) {
        return [
          {
            type: 'text',
            value: '召喚時、自分のデッキの一番上のカードを公開し、',
          },
          {
            type: 'link',
            value: `「${keyword}」カード`,
            targetKeyword: keyword,
          },
          { type: 'text', value: 'なら自分のレーンに召喚できる。' },
        ];
      }
      if (val !== undefined && val !== null) {
        return `召喚時、自分のデッキの一番上のカードを公開し、パワーが${val}以下なら自分のレーンに召喚できる。`;
      }
      return '召喚時、自分のデッキの一番上のカードを公開し、自分のレーンに召喚できる。';
    },
  },
  bless: {
    name: '祝福',
    icon: '🕯️',
    desc: (val) => `召喚時、手札のカード1枚を選択してパワーを+${val}する。`,
  },
  challenge: {
    name: '挑戦',
    icon: '🥋',
    desc: () => '正面にカードが置かれているレーンにしか召喚できない。',
  },
  move: {
    name: '移動',
    icon: '🏃',
    desc: () =>
      '自分のターン開始時、隣のレーンに移動できる。（防御が付与されている場合は無効）',
  },
  freeze: {
    name: '凍結',
    icon: '❄️',
    desc: (val) =>
      `召喚時、正面とその隣のカードに${val}ターンの間「防御」を付与する。`,
  },
  loss: {
    name: '喪失',
    icon: '🕳️',
    desc: (val) => `召喚時、自分のデッキの上から${val}枚墓地に送る。`,
  },
  teleport: {
    name: '神出',
    icon: '🚪',
    desc: () =>
      '自分のターン開始時、ランダムな自分の空きレーンに移動する。（防御が付与されている場合は無効）',
  },
  brutal: {
    name: '暴虐',
    icon: '🌪️',
    desc: (val) => `攻撃時、隣のカードに${val}ダメージ。`,
  },
  absorb: {
    name: '吸収',
    icon: '💖',
    desc: () =>
      '戦闘ダメージを与えた時、自分リーダーのHPをその数値の半分回復する（端数切り捨て）。',
  },
  decay: {
    name: '減衰',
    icon: '⏬',
    desc: () => '召喚時、パワーが半分になる。（端数切り捨て）',
  },
  seal: {
    name: '結界',
    icon: '🛑',
    desc: (val) =>
      `召喚時、正面のレーンを${val}ターン封印（召喚・配置・移動不可）する。`,
  },
  apex: {
    name: '頂点',
    icon: '☀️',
    desc: () =>
      '自分の場に伝説を持つカードが置かれているレーンにしか召喚できない。',
  },
  retaliate: {
    name: '報復',
    icon: '🔥',
    desc: (val) => `自分の場のカードが破壊された時、パワーを+${val || 2}する。`,
  },
  puppet: {
    name: '傀儡',
    icon: '🧵',
    desc: (val) =>
      `召喚時、相手の墓地からパワー${val}以下のカード1枚を選択して配置する。`,
  },
  union: {
    name: '合体',
    icon: '🔗',
    desc: (val, sk) => {
      const unionSk =
        sk && sk.id === 'union'
          ? sk
          : Array.isArray(sk?.skills)
            ? sk.skills.find((s) => s.id === 'union')
            : sk;
      const targetId = unionSk?.targetId;
      const targetIds = unionSk?.targetIds;
      const targetKeyword = unionSk?.targetKeyword;
      const summonId = unionSk?.summonId;

      const targetCard = targetId
        ? CARD_MASTER.find((c) => c.id === targetId)
        : null;
      const summonCard = summonId
        ? CARD_MASTER.find((c) => c.id === summonId)
        : null;

      if (
        !targetCard &&
        !targetKeyword &&
        (!Array.isArray(targetIds) || targetIds.length === 0) &&
        !summonCard
      ) {
        return '配置時、「対応するカード」の上に重ねた場合に「特別なカード」になる。';
      }

      const summonStr = summonCard
        ? `「${summonCard.name}」`
        : '「特別なカード」';

      let targetSegments = [];
      if (targetCard) {
        targetSegments = [
          { type: 'link', value: `「${targetCard.name}」`, targetId: targetId },
        ];
      } else if (Array.isArray(targetIds) && targetIds.length > 0) {
        targetSegments = createCardLinkSegments(targetIds);
      } else if (typeof targetKeyword === 'string' && targetKeyword) {
        targetSegments = [
          {
            type: 'link',
            value: `「${targetKeyword}」カード`,
            targetKeyword,
          },
        ];
      } else {
        targetSegments = [{ type: 'text', value: '「対応するカード」' }];
      }

      return [
        { type: 'text', value: '配置時、' },
        ...targetSegments,
        { type: 'text', value: 'の上に重ねた場合に' },
        { type: 'link', value: summonStr, targetId: summonId || null },
        { type: 'text', value: 'になる。' },
      ];
    },
  },
  crush: {
    name: '粉砕',
    icon: '🔨',
    desc: () => `召喚時、お互いの場の「防御」を持つカードを全て破壊する。`,
  },
  treason: {
    name: '反逆',
    icon: '👑',
    desc: () => `召喚時、お互いの場の「伝説」を持つカードを全て破壊する。`,
  },
  substitute: {
    name: '身替',
    icon: '🎭',
    desc: () => '隣のレーンの味方に戦闘で受けるダメージを肩代わりさせる。',
  },
  adversity: {
    name: '逆境',
    icon: '🥀',
    desc: (val) =>
      `召喚時、相手の埋まっているレーンにつきパワーを${val >= 0 ? '+' : ''}${val}する`,
  },
  invite: {
    name: '招来',
    icon: '🌌',
    desc: () => [
      {
        type: 'text',
        value:
          '召喚時、同じレーンに手札から1枚カードを召喚できる。そうした場合、手札に',
      },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      { type: 'text', value: 'を加える。' },
    ],
  },
  forge: {
    name: '鍛造',
    icon: '⚒️',
    desc: () => [
      {
        type: 'text',
        value:
          '召喚時、カードが配置されているレーンに手札から1枚「装備」を持つカードを召喚できる。または、「武装」を持つカードが配置されているレーンに手札から1枚カードを召喚できる。そうした場合、手札に',
      },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      { type: 'text', value: 'を加える。' },
    ],
  },
  hack: {
    name: '改竄',
    icon: '👾',
    desc: () => '召喚時、お互いのSPを合計し均等に振り分ける（端数切り捨て）',
  },
  double_power: {
    name: '倍化',
    icon: '⏫',
    desc: () => '召喚時、パワーが2倍になる。',
  },
  explore: {
    name: '探索',
    icon: '🗺',
    desc: (val, sk) => {
      const targetIds = resolveTargetIds(sk, 'explore');
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const links = createCardLinkSegments(targetIds);
        return [
          {
            type: 'text',
            value: '召喚時、デッキから',
          },
          ...links,
          {
            type: 'text',
            value:
              targetIds.length > 1
                ? 'のいずれか1枚まで選択して手札に加える。その後、手札を1枚捨ててデッキをシャッフルする。'
                : 'を1枚まで選択して手札に加える。その後、手札を1枚捨ててデッキをシャッフルする。',
          },
        ];
      }
      const keyword =
        sk?.targetKeyword ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find((s) => s.id === 'explore')?.targetKeyword
          : null);
      if (keyword) {
        return [
          {
            type: 'text',
            value: '召喚時、デッキから',
          },
          {
            type: 'link',
            value: `「${keyword}」カード`,
            targetKeyword: keyword,
          },
          {
            type: 'text',
            value:
              'を1枚まで選択して手札に加える。その後、手札を1枚捨ててデッキをシャッフルする。',
          },
        ];
      }
      return '召喚時、デッキからカードを1枚まで選択して手札に加える。その後、手札を1枚捨ててデッキをシャッフルする。';
    },
  },
  possession: {
    name: '憑依',
    icon: '💞',
    desc: () =>
      '戦闘で受けるダメージをリーダーに肩代わりさせる。また、カードを装備できず、装備になれない。',
  },
  awake: {
    name: '覚醒',
    icon: '💎',
    desc: (val, sk) => {
      const summonId =
        sk?.summonId ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find(
              (s) => s.id === 'awake' || s.id === 'awake_legendary'
            )?.summonId
          : null);
      const summonCard = summonId
        ? CARD_MASTER.find((c) => c.id === summonId)
        : null;
      if (summonCard) {
        return [
          { type: 'text', value: '自分のターン開始時、同じレーンに' },
          {
            type: 'link',
            value: `「${summonCard.name}（パワー${val}）」`,
            targetId: summonId,
          },
          { type: 'text', value: 'を配置する。' },
        ];
      }
      return `自分のターン開始時、同じレーンにパワー${val}のトークンを配置する。`;
    },
  },
  awake_legendary: {
    name: '覚醒(伝説)',
    icon: '💎',
    desc: (val, sk) => {
      const summonId =
        sk?.summonId ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find(
              (s) => s.id === 'awake' || s.id === 'awake_legendary'
            )?.summonId
          : null) ||
        'token_thebeast';
      const summonCard = summonId
        ? CARD_MASTER.find((c) => c.id === summonId)
        : null;
      if (summonCard) {
        return [
          { type: 'text', value: '自分のターン開始時、同じレーンに' },
          {
            type: 'link',
            value: `「${summonCard.name}（パワー${val}/伝説）」`,
            targetId: summonId,
          },
          { type: 'text', value: 'を配置する。' },
        ];
      }
      return `自分のターン開始時、同じレーンにパワー${val}の伝説トークンを配置する。`;
    },
  },
  cleave: {
    name: '一掃',
    icon: '🧹',
    desc: () =>
      '攻撃時、肩代わりを無視して正面とその隣のレーンに分散して戦闘ダメージを与える。（左>中央>右優先）',
  },
  leap: {
    name: '跳躍',
    icon: '⏭️',
    desc: () =>
      '召喚時、追加のターンを1回行う。（ただし、追加ターン中はSPは溜まらず攻撃もできない）',
  },
  chant: {
    name: '召喚',
    icon: '📢',
    desc: (val, sk) => SKILLS.summon.desc(val, sk),
  },
  arm_self: {
    name: '武装',
    icon: '🦾',
    desc: () =>
      '1回まで自身の上にカードを配置するとき、自身にそのカードと同じパワーと能力を付与する。',
  },
  burial: {
    name: '埋葬',
    icon: '💀',
    desc: (val) => `召喚時、相手のデッキの上から${val}枚墓地に送る。`,
  },
  recurse: {
    name: '再帰',
    icon: '♻️',
    desc: (val) =>
      `召喚時、お互いの墓地のカードを${val}枚まで選択してデッキに戻し、お互いのデッキをシャッフルする。`,
  },
  grave_keeper: {
    name: '墓守',
    icon: '🗝️',
    desc: () => '場に居る限り、お互いに墓地のカードを選択できない。',
  },
  miasma: {
    name: '瘴気',
    icon: '☣️',
    desc: () =>
      '場に居る限り、お互いにHPを回復する代わりに同じ値のダメージを受ける。',
  },
  cull: {
    name: '選別',
    icon: '🫳',
    desc: (val) =>
      `召喚時、相手は自分のカードを${val || 1}枚選択して破壊する。`,
  },
  execute: {
    name: '処刑',
    icon: '🪓',
    desc: () => '召喚時、自分のカード1枚を選択して破壊する。',
  },
  dominate: {
    name: '支配',
    icon: '🧠',
    desc: (val) =>
      `召喚時、相手のパワー${val}以下のカード1枚を選択して正面のレーンに移動する。`,
  },
  sublimation: {
    name: '昇華',
    icon: '🧿',
    desc: (val) => [
      { type: 'text', value: '召喚時、自分の手札の' },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      {
        type: 'text',
        value: `1枚につきパワーを${val >= 0 ? '+' : ''}${val}する。`,
      },
    ],
  },
  snipe_void: {
    name: '狙撃(虚)',
    icon: '🎯',
    desc: (val) => [
      { type: 'text', value: '召喚時、自分の手札の' },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      {
        type: 'text',
        value: `1枚につき相手の場の最大パワーのカード1枚に${val || 4}ダメージ。（同値の場合は左優先）`,
      },
    ],
  },
  heal_void: {
    name: '回復(虚)',
    icon: '💚',
    desc: (val) => [
      { type: 'text', value: '召喚時、自分の手札の' },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      {
        type: 'text',
        value: `1枚につき自分リーダーのHPを${val || 3}回復する。`,
      },
    ],
  },
  support_void: {
    name: '援護(虚)',
    icon: '🚩',
    desc: (val) => [
      { type: 'text', value: '召喚時、自分の手札の' },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      {
        type: 'text',
        value: `1枚につき隣のカードのパワーを+${val || 2}する。`,
      },
    ],
  },
  samsara: {
    name: '輪廻',
    icon: '🔄',
    desc: () =>
      'ターン開始時、お互いの手札を全て捨てる。その後、お互いにカードを3枚引く。',
  },
  grant_deadly: {
    name: '付与(必殺)',
    icon: '☠️',
    desc: () =>
      '召喚時、自分の場の元々の能力を持たないカード全てに「必殺」を付与する。',
  },
  grant_sturdy: {
    name: '付与(頑丈)',
    icon: '⛰',
    desc: () =>
      '召喚時、自分の場の元々の能力を持たないカード全てに「頑丈」を付与する。',
  },
  buff: {
    name: '強化',
    icon: '💪',
    desc: (val) => `召喚時、自身のパワーを+${val || 1}する。`,
  },
  inspire: {
    name: '鼓舞',
    icon: '🎺',
    desc: (val) =>
      `召喚時、自分の場の自身以外のカード1体を選択し、そのパワーを+${val || 1}する。`,
  },
  supremacy: {
    name: '覇道',
    icon: '🐉',
    desc: () =>
      '召喚時、自分の場に自身以外の元々のパワーが6以上のカードが存在する場合に以下の能力を発動する。',
  },
  unleash: {
    name: '解放',
    icon: '⛓',
    desc: () => '召喚時、自身の防御をなくす。',
  },
  all_forms: {
    name: '万相',
    icon: '🎭',
    desc: () => 'バトル中、すべてのカード名と同じとして扱う。',
  },
  protection: {
    name: '保護',
    icon: '🪽',
    desc: () =>
      '召喚時、自分の場のカード1体を選択し、次の自分のターン開始時まで「加護」（全てのダメージを受けず、破壊されない）を付与する。',
  },
};

// 召喚時に発動するスキル（配置時は発動しない）
export const ACTIVE_SKILLS = [
  'snipe',
  'spread',
  'heal',
  'draw',
  'support',
  'clone',
  'lone_wolf',
  'berserk',
  'sacrifice',
  'bind',
  'quick',
  'hero',
  'charge',
  'spend',
  'stealth',
  'morph',
  'choice',
  'force',
  'metamorph',
  'resurrect',
  'standby',
  'artillery',
  'decree',
  'shuffle',
  'servant',
  'summon',
  'assemble',
  'ambush',
  'fate',
  'salvage',
  'reinforce',
  'toxic',
  'convert',
  'invade',
  'petrify',
  'call',
  'portent',
  'bless',
  'dispel',
  'freeze',
  'loss',
  'seal',
  'replicate',
  'crush',
  'adversity',
  'invite',
  'double_power',
  'explore',
  'decay',
  'puppet',
  'leap',
  'chant',
  'burial',
  'recurse',
  'forge',
  'hack',
  'cull',
  'execute',
  'dominate',
  'sublimation',
  'snipe_void',
  'heal_void',
  'support_void',
  'treason',
  'oblivion',
  'silence',
  'grant_deadly',
  'grant_sturdy',
  'buff',
  'inspire',
  'supremacy',
  'unleash',
  'protection',
];

// 戦闘中やターン開始時など、継続的に影響を与えるスキル
export const PASSIVE_SKILLS = [
  'deadly',
  'sturdy',
  'guardian',
  'soul_bind',
  'growth',
  'defender',
  'split',
  'invincible',
  'reflect',
  'legendary',
  'takeover',
  'pierce',
  'explode',
  'contract',
  'double_strike',
  'immune',
  'dodge',
  'extort',
  'phase',
  'challenge',
  'move',
  'brutal',
  'absorb',
  'apex',
  'retaliate',
  'substitute',
  'possession',
  'cleave',
  'arm_self',
  'grave_keeper',
  'miasma',
  'awake',
  'awake_legendary',
  'startup',
  'intercept',
  'teleport',
  'samsara',
  'madness',
  'trigger',
  'reanimate',
  'all_forms',
];

export const SKILL_CATEGORIES = [
  {
    id: 'active',
    name: 'アクティブスキル (召喚時に発動)',
    groups: [
      {
        name: 'ダメージ',
        skills: ['snipe', 'snipe_void', 'spread'],
      },
      {
        name: 'リーダーダメージ',
        skills: ['artillery', 'decree', 'fate'],
      },
      {
        name: '状態付与',
        skills: [
          'bind',
          'freeze',
          'toxic',
          'seal',
          'petrify',
          'oblivion',
          'silence',
        ],
      },
      {
        name: '召喚',
        skills: [
          'summon',
          'assemble',
          'call',
          'invite',
          'forge',
          'trigger',
          'madness',
          'reanimate',
        ],
      },
      {
        name: '配置',
        skills: ['servant', 'ambush', 'clone', 'resurrect', 'puppet'],
      },
      {
        name: '手札・山札操作',
        skills: [
          'draw',
          'salvage',
          'reinforce',
          'explore',
          'burial',
          'recurse',
          'shuffle',
          'morph',
        ],
      },
      {
        name: '自己強化',
        skills: [
          'buff',
          'lone_wolf',
          'hero',
          'adversity',
          'sublimation',
          'double_power',
          'metamorph',
          'portent',
          'invade',
          'supremacy',
        ],
      },
      {
        name: '味方強化',
        skills: [
          'support',
          'support_void',
          'grant_deadly',
          'grant_sturdy',
          'bless',
          'inspire',
          'protection',
        ],
      },
      {
        name: '行動変化・特殊',
        skills: [
          'quick',
          'stealth',
          'leap',
          'dominate',
          'replicate',
          'unleash',
        ],
      },
      {
        name: '回復・SP',
        skills: ['heal', 'heal_void', 'charge', 'hack'],
      },
      {
        name: '破壊',
        skills: ['cull', 'crush', 'treason', 'dispel'],
      },
      { name: '選択・命令', skills: ['choice', 'force'] },
      {
        name: 'デメリット',
        skills: [
          'sacrifice',
          'berserk',
          'convert',
          'loss',
          'spend',
          'standby',
          'execute',
          'decay',
        ],
      },
    ],
  },
  {
    id: 'passive',
    name: 'パッシブスキル (継続・戦闘時効果)',
    groups: [
      {
        name: '戦闘補正',
        skills: ['sturdy', 'double_strike', 'deadly', 'pierce', 'cleave'],
      },
      {
        name: '戦闘時・破壊時',
        skills: ['soul_bind', 'absorb', 'extort', 'split', 'retaliate'],
      },
      {
        name: 'ターン開始時',
        skills: [
          'growth',
          'intercept',
          'awake',
          'awake_legendary',
          'samsara',
          'move',
          'teleport',
        ],
      },
      {
        name: '肩代わり',
        skills: ['guardian', 'substitute', 'possession', 'reflect'],
      },
      {
        name: '耐性',
        skills: ['invincible', 'immune', 'dodge'],
      },
      {
        name: '盤面影響・その他',
        skills: [
          'phase',
          'equip',
          'arm_self',
          'startup',
          'union',
          'grave_keeper',
          'miasma',
          'all_forms',
        ],
      },
      {
        name: 'デメリット',
        skills: ['defender', 'explode', 'brutal', 'contract'],
      },
    ],
  },
  {
    id: 'constraint',
    name: '制約スキル (召喚ルール制限)',
    groups: [
      {
        name: '配置制約',
        skills: ['legendary', 'takeover', 'challenge', 'apex'],
      },
    ],
  },
];

/**
 * 相手リーダーに直接ダメージを与えるカードスキルID一覧定数
 * バトルボーナス「攻撃以外のダメージで勝利 (win_by_skill)」の判定等で使用されます。
 */
export const DAMAGE_PLAYER_SKILL_IDS = ['artillery', 'decree', 'fate'];

/**
 * 運命（fate）スキルのAI思考シミュレーション用最大見積もりダメージ定数（相手リーダーに3ダメージ）
 * 運命スキルは確率でダメージが変動する（5/6で1~3ダメージ、1/6で自傷6）が、
 * AIは思考シミュレーション時に常に最高の結果を想定して盤面・打点を評価する。
 */
export const FATE_ESTIMATED_DAMAGE = 3;
