/**
 * Mini Card Battle - Skill Definitions
 */
import { CARD_MASTER } from './cards.js';

export const SKILLS = {
  none: { name: '通常', icon: '', desc: (val) => '' },
  quick: {
    name: '速攻',
    icon: '⚡',
    desc: (val) => '召喚時、ただちに攻撃する。',
  },
  deadly: {
    name: '必殺',
    icon: '☠️',
    desc: (val) => '戦闘した時、相手を破壊する。',
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
      `召喚時、相手の場で最大パワーのカード1枚に${val || 4}ダメージ。（同値の場合は左優先）`,
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
    desc: (val) => '攻撃せず、敵カードや敵リーダーにダメージを与えられない。',
  },
  clone: {
    name: '分身',
    icon: '👥',
    desc: (val) =>
      `召喚時、自分のレーンに、自身と同じパワーと能力のトークンを${val || 1}体まで配置する。`,
  },
  lone_wolf: {
    name: '単騎',
    icon: '🐺',
    desc: (val) =>
      `召喚時、自分の空いているレーンの数×${val || 3}だけパワーを上げる。`,
  },
  soul_bind: {
    name: '魂縛',
    icon: '⛓️',
    desc: (val) => `戦闘で敵を破壊した時、パワーを+${val || 2}する。`,
  },
  sturdy: {
    name: '頑丈',
    icon: '⛰',
    desc: (val) => '戦闘時、受けるダメージを半減する（端数切り捨て）。',
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
    desc: (val) => `召喚時、正面のカードに${val}ターンの間「防御」を持たせる。`,
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
      `自分のターン開始時、相手の場で最大パワーのカード1枚に${val || 2}ダメージ。（同値の場合は左優先）`,
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
    desc: (val) => `召喚時、自身に無敵${val || 1}を付与する。`,
  },
  invincible: {
    name: '無敵',
    icon: '✨',
    desc: (val) => `${val}ターンの間、戦闘でダメージを受けない。`,
  },
  reflect: {
    name: '反射',
    icon: '↩️',
    desc: (val) =>
      '戦闘で受けるダメージを正面のカードに肩代わりさせる。また、カードを装備できず、装備になれない。',
  },
  guardian: {
    name: '守護',
    icon: '🛡️',
    desc: (val) => '隣のレーンの味方が戦闘で受けるダメージを肩代わりする。',
  },
  legendary: {
    name: '伝説',
    icon: '👑',
    desc: (val) => '中央のレーンにしか召喚できない。',
  },
  takeover: {
    name: '生贄',
    icon: '🦖',
    desc: (val) => 'カードが配置されているレーンにしか召喚できない。',
  },
  pierce: {
    name: '貫通',
    icon: '🏹',
    desc: (val) =>
      '攻撃時、自身のパワーの差分だけ相手リーダーにダメージを与える。',
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
    desc: (val) =>
      '召喚時、全カードの中からランダムに1枚に変身し、その能力を発動する。',
  },
  resurrect: {
    name: '復活',
    icon: '⚰️',
    desc: (val) =>
      `召喚時、自分の墓地からパワー${val}以下のカード1枚を選択して配置する。`,
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
    desc: (val) =>
      '召喚時、お互いの手札を全て捨て、墓地をリセットする。その後、お互いにカードを3枚引く。',
  },
  summon: {
    name: '召喚',
    icon: '✨',
    desc: (val, sk) => {
      const summonId =
        sk?.summonId || sk?.skills?.find((s) => s.id === 'summon')?.summonId;
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
  immune: {
    name: '無効',
    icon: '🚫',
    desc: (val) => '能力による破壊やダメージを受けない。',
  },
  resist: {
    name: '耐性',
    icon: '💠',
    desc: (val) => `${val}以上のダメージを無効化する。`,
  },
  fate: {
    name: '運命',
    icon: '🎲',
    desc: (val) => '召喚時、5/6で相手に1~5ダメージ、1/6で自分に6ダメージ。',
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
        value: `相手リーダーにダメージを与えた時、相手の手札からランダムに${val || 1}枚を捨て、同数`,
      },
      { type: 'link', value: `「虚空（パワー0）」`, targetId: 'token_void' },
      { type: 'text', value: 'を加える。' },
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
  dispel: {
    name: '解除',
    icon: '🔓',
    desc: (val) =>
      `召喚時、お互いの場の全ての「装備中」のカードを解除し、「装備」を持つカードを全て破壊する。`,
  },
  invade: {
    name: '侵略',
    icon: '🛸',
    desc: (val) => '召喚時、自分の墓地のカードの種類1枚につきパワーを+1する。',
  },
  replicate: {
    name: '複製',
    icon: '👯',
    desc: (val) =>
      '召喚時、最もパワーが高い自分の他のカード1体のパワー分、自身のパワーを+する。',
  },
  equip: {
    name: '装備',
    icon: '🗡️',
    desc: (val) =>
      'カードが配置されているレーンに配置するとき、下のカードに自身と同じパワーと能力を付与する。',
  },
  phase: {
    name: '位相',
    icon: '🌫️',
    desc: (val) =>
      '位相を持たないカードと戦闘を行わず、互いにリーダーを直接攻撃する。ただし「防御」にはブロックされる。',
  },
  petrify: {
    name: '石化',
    icon: '🗿',
    desc: (val) => [
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
    desc: (val) =>
      '場に居る間、この能力以外の全ての能力を失い、新たな能力も得られない。',
  },
  call: {
    name: '号令',
    icon: '📯',
    desc: (val) =>
      `召喚時、自分のデッキの一番上のカードを公開し、その数値が${val}以下なら自分のレーンに召喚できる。`,
  },
  bless: {
    name: '祝福',
    icon: '🕯️',
    desc: (val) => `召喚時、手札のカード1枚を選び、パワーを+${val}する。`,
  },
  wall_create: {
    name: '造壁',
    icon: '🏰',
    desc: (val) => [
      { type: 'text', value: '召喚時、自分のレーンに、' },
      {
        type: 'link',
        value: `「防壁（パワー${val}）」`,
        targetId: 'token_wall',
      },
      { type: 'text', value: 'を配置する。' },
    ],
  },
  challenge: {
    name: '挑戦',
    icon: '🥋',
    desc: (val) => '正面にカードが置かれているレーンにしか召喚できない。',
  },
  move: {
    name: '移動',
    icon: '🏃',
    desc: (val) =>
      '自分のターン開始時に隣のレーンに移動できる。（防御が付与されている場合は無効）',
  },
  freeze: {
    name: '凍結',
    icon: '❄️',
    desc: (val) =>
      `召喚時、正面とその隣のカードに${val}ターンの間「防御」を持たせる。`,
  },
  loss: {
    name: '喪失',
    icon: '🕳️',
    desc: (val) => `召喚時、自分のデッキの上から${val}枚墓地に送る。`,
  },
  brutal: {
    name: '暴虐',
    icon: '🌪️',
    desc: (val) => `攻撃時、隣のカードに${val}ダメージ。`,
  },
  absorb: {
    name: '吸収',
    icon: '💖',
    desc: (val) =>
      '戦闘で敵にダメージを与えた時、その数値の半分リーダーを回復する（端数切り捨て）。',
  },
  decay: {
    name: '減衰',
    icon: '⏬',
    desc: (val) => '召喚時、パワーが半分になる。（端数切り捨て）',
  },
  seal: {
    name: '結界',
    icon: '🛑',
    desc: (val) => `召喚時、正面のレーンを${val}ターン封印する。`,
  },
  apex: {
    name: '頂点',
    icon: '☀️',
    desc: (val) =>
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
      const targetCard =
        sk && sk.targetId
          ? CARD_MASTER.find((c) => c.id === sk.targetId)
          : null;
      const summonCard =
        sk && sk.summonId
          ? CARD_MASTER.find((c) => c.id === sk.summonId)
          : null;

      if (!targetCard && !summonCard) {
        return '配置時、「対応するカード」の上に重ねた場合に「特別なカード」になる。';
      }

      const targetStr = targetCard
        ? `「${targetCard.name}」`
        : '「対応するカード」';
      const summonStr = summonCard
        ? `「${summonCard.name}」`
        : '「特別なカード」';

      return [
        { type: 'text', value: '配置時、' },
        { type: 'link', value: targetStr, targetId: sk.targetId || null },
        { type: 'text', value: 'の上に重ねた場合に' },
        { type: 'link', value: summonStr, targetId: sk.summonId || null },
        { type: 'text', value: 'になる。' },
      ];
    },
  },
  crush: {
    name: '粉砕',
    icon: '🔨',
    desc: (val) => `召喚時、お互いの場の「防御」を持つカードを全て破壊する。`,
  },
  substitute: {
    name: '身替',
    icon: '🎭',
    desc: (val) => '隣のレーンの味方に戦闘で受けるダメージを肩代わりさせる。',
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
    desc: (val) => [
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
    desc: (val) => [
      {
        type: 'text',
        value:
          '召喚時、カードが配置されているレーンに手札から1枚「装備」を持つカードを召喚できる。または、「武装」を持つカードが配置されているレーンに手札から1枚カードを召喚できる。そうした場合、手札に',
      },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      { type: 'text', value: 'を加える。' },
    ],
  },
  destroy: {
    name: '破壊',
    icon: '🚪',
    desc: (val) => '召喚時、相手の場のカード1枚を選び、破壊する。',
  },
  hack: {
    name: '改竄',
    icon: '👾',
    desc: (val) => '召喚時、お互いのSPを合計し均等に振り分ける（端数切り捨て）',
  },
  double_power: {
    name: '倍化',
    icon: '⏫',
    desc: (val) => '召喚時、パワーが2倍になる。',
  },
  explore: {
    name: '探索',
    icon: '🗺',
    desc: () =>
      '召喚時、デッキからカードを1枚まで選択して手札に加える。その後、手札を1枚捨ててデッキをシャッフルする。',
  },
  possession: {
    name: '憑依',
    icon: '💞',
    desc: (val) =>
      '戦闘で受けるダメージをリーダーに肩代わりさせる。また、カードを装備できず、装備になれない。',
  },
  martyr: {
    name: '犠牲',
    icon: '✝️',
    desc: (val) => '自分のリーダーが戦闘で受けるダメージを肩代わりする。',
  },
  awake: {
    name: '覚醒',
    icon: '💎',
    desc: (val, sk) => {
      const summonId =
        sk?.summonId ||
        (Array.isArray(sk?.skills)
          ? sk.skills.find((s) => s.id === 'awake')?.summonId
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
  cleave: {
    name: '一掃',
    icon: '🧹',
    desc: (val) =>
      '攻撃時、肩代わりを無視して正面とその隣のレーンに分散してダメージを与える。（左>中央>右優先）',
  },
  leap: {
    name: '跳躍',
    icon: '⏭️',
    desc: (val) =>
      '召喚時、追加のターンを1回行う。（ただし、追加ターン中はSPは溜まらず攻撃もできない）',
  },
  chant: {
    name: '詠唱',
    icon: '🔮',
    desc: (val) => [
      {
        type: 'text',
        value: `召喚時、手札からパワー${val}以下のカードを1枚召喚できる。そうした場合、手札に`,
      },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      { type: 'text', value: 'を加える。' },
    ],
  },
  arm_self: {
    name: '武装',
    icon: '🦾',
    desc: (val) =>
      '自身の上にカードを配置するとき、自身にそのカードと同じパワーと能力を付与する。',
  },
  burial: {
    name: '埋葬',
    icon: '💀',
    desc: (val) => `召喚時、相手のデッキの上から${val}枚墓地に送る。`,
  },
  maintain: {
    name: '維持',
    icon: '⚙️',
    desc: (val) => [
      {
        type: 'text',
        value: `自分のターン開始時、自分の手札の最大パワーのカード${val || 1}枚を捨て、同数`,
      },
      { type: 'link', value: '「虚空（パワー0）」', targetId: 'token_void' },
      { type: 'text', value: 'を加える。（同値の場合は左優先）' },
    ],
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
    desc: '場に居る限り、お互いに墓地のカードを選択できない。',
  },
  amplify: {
    name: '増幅',
    icon: '📡',
    desc: '場に居る限り、自分の「選択」「命令」の選択数を+1する。（選択肢の数は超えない）',
  },
  cull: {
    name: '選別',
    icon: '🚪',
    desc: '召喚時、相手は自分のカード1枚を選択する。そのカードを破壊する。',
  },
  execute: {
    name: '処刑',
    icon: '🪓',
    desc: '召喚時、自分のカード1枚を選択する。そのカードを破壊する。',
  },
  dominate: {
    name: '支配',
    icon: '🧠',
    desc: (val) =>
      `召喚時、相手の場のパワー${val}以下のカード1枚を選び、正面のレーンに移動する。`,
  },
  sublimation: {
    name: '昇華',
    icon: '🧿',
    desc: (val) =>
      `召喚時、自分の手札の「虚空」1枚につきパワーを${val >= 0 ? '+' : ''}${val}する。`,
  },
  snipe_void: {
    name: '狙撃(虚)',
    icon: '🎯',
    desc: (val) =>
      `召喚時、自分の手札の「虚空」1枚につき相手の場で最大パワーのカード1枚に${val || 4}ダメージ。（同値の場合は左優先）`,
  },
  heal_void: {
    name: '回復(虚)',
    icon: '💚',
    desc: (val) =>
      `召喚時、自分の手札の「虚空」1枚につき自分リーダーのHPを${val || 3}回復する。`,
  },
  spread_void: {
    name: '拡散(虚)',
    icon: '☄️',
    desc: (val) =>
      `召喚時、自分の手札の「虚空」1枚につき正面とその隣のカードに${val || 2}ダメージ。`,
  },
  support_void: {
    name: '援護(虚)',
    icon: '🚩',
    desc: (val) =>
      `召喚時、自分の手札の「虚空」1枚につき隣のカードのパワーを+${val || 2}する。`,
  },
  grant_deadly: {
    name: '付与(必殺)',
    icon: '✡️',
    desc: (val) => `召喚時、自分の場のトークン全てに「必殺」を付与する。`,
  },
  grant_pierce: {
    name: '付与(貫通)',
    icon: '✡️',
    desc: (val) => `召喚時、自分の場のトークン全てに「貫通」を付与する。`,
  },
  grant_absorb: {
    name: '付与(吸収)',
    icon: '✡️',
    desc: (val) => `召喚時、自分の場のトークン全てに「吸収」を付与する。`,
  },
  grant_sturdy: {
    name: '付与(頑丈)',
    icon: '✡️',
    desc: (val) => `召喚時、自分の場のトークン全てに「頑丈」を付与する。`,
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
  'summon',
  'fate',
  'salvage',
  'reinforce',
  'toxic',
  'convert',
  'invade',
  'petrify',
  'call',
  'bless',
  'wall_create',
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
  'destroy',
  'hack',
  'cull',
  'execute',
  'dominate',
  'sublimation',
  'snipe_void',
  'heal_void',
  'spread_void',
  'support_void',
  'grant_deadly',
  'grant_pierce',
  'grant_absorb',
  'grant_sturdy',
];

// 戦闘中やターン開始時など、継続的に影響を与えるスキル
export const PASSIVE_SKILLS = [
  'deadly',
  'sturdy',
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
  'resist',
  'extort',
  'phase',
  'oblivion',
  'challenge',
  'move',
  'brutal',
  'absorb',
  'apex',
  'retaliate',
  'substitute',
  'possession',
  'martyr',
  'cleave',
  'arm_self',
  'maintain',
  'grave_keeper',
  'awake',
  'amplify',
  'intercept',
];
