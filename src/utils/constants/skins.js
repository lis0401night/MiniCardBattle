/**
 * Mini Card Battle - スキンマスタ定義
 *
 * スキン名・画像パス・アイコンパス・プレイマットパス・入手条件・説明文を
 * 一元管理する唯一の信頼源（Single Source of Truth）。
 *
 * 構造: SKIN_MASTER[skinType][charId]
 * - skinType: 'summer' | 'school' | 'high'
 * - charId: キャラクターID
 *
 * 新しいスキンを追加する際はこのファイルのみを更新してください。
 * avatars.js の EXTRA_ICONS、playmats.js の PLAYMAT_MASTER、
 * config.js の交換所ラインナップはこのマスタから自動生成されます。
 */

// ---------------------------------------------------------------------------
// ヘルパー関数
// ---------------------------------------------------------------------------

/**
 * キャラクター画像パスを生成する
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ ('summer', 'school', 'high')
 * @returns {string} 画像パス
 */
const charImg = (charId, skinType) =>
  `assets/characters/char_${charId}_${skinType}.webp`;

/**
 * キャラクター敗北時画像パスを生成する
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ ('summer', 'school', 'high')
 * @returns {string} 画像パス
 */
const charImgLose = (charId, skinType) =>
  `assets/characters/char_${charId}_${skinType}_lose.webp`;

/**
 * アイコン画像パスを生成する
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ ('summer', 'school', 'high')
 * @returns {string} 画像パス
 */
const iconImg = (charId, skinType) =>
  `assets/icons/icon_${charId}_${skinType}.webp`;

/**
 * アイコンダメージ画像パスを生成する
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ ('summer', 'school', 'high')
 * @returns {string} 画像パス
 */
const iconDmg = (charId, skinType) =>
  `assets/icons/icon_${charId}_${skinType}_damage.webp`;

/**
 * プレイマット画像パスを生成する
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ ('summer', 'school', 'high')
 * @returns {string} 画像パス
 */
const boardImg = (charId, skinType) =>
  `assets/boards/board_${charId}_${skinType}.webp`;

/** スキンタイプごとの既定入手条件 */
const DEFAULT_UNLOCK_CONDITIONS = {
  summer: '試練交換所で入手',
  school: '大会交換所で入手',
  high: '実績達成で入手',
};

/**
 * スキンエントリを生成する共通関数
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ
 * @param {string} name - スキン表示名
 * @param {Object} [overrides] - 上書きプロパティ（unlockCondition, description 等）
 * @returns {Object} スキンエントリ
 */
function makeSkinEntry(charId, skinType, name, overrides = {}) {
  return {
    name,
    image: charImg(charId, skinType),
    imageLose: charImgLose(charId, skinType),
    icon: iconImg(charId, skinType),
    iconDamage: iconDmg(charId, skinType),
    playmat: boardImg(charId, skinType),
    unlockCondition: DEFAULT_UNLOCK_CONDITIONS[skinType],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 水着スキン
// ---------------------------------------------------------------------------

/** @type {Record<string, Object>} 水着スキンマスタ */
const SUMMER_SKINS = {
  android: makeSkinEntry('android', 'summer', '水陸両用装備', {
    description: '研究所より支給された耐熱・耐水処理を施した特殊換装とのこと。',
  }),
  dragon: makeSkinEntry('dragon', 'summer', '真夏の焔竜姫', {
    description:
      '太陽の熱よりも熱い竜の息吹。水辺でも彼女の炎が消えることは決してない。',
  }),
  knight: makeSkinEntry('knight', 'summer', '波打ち際の騎士', {
    description:
      '鎧を脱ぎ捨て、ひとときの休息を楽しむ騎士。その剣腕は水着姿でも少しも鈍らない。',
  }),
  cthulhu: makeSkinEntry('cthulhu', 'summer', '深海のサマースイム', {
    description:
      '深淵から現れた名状しがたき水着姿。彼女が泳ぐたび、波間に狂気が蠢くという。',
  }),
  elf: makeSkinEntry('elf', 'summer', '水辺の流浪者', {
    description:
      '森を抜け出し、海辺にやってきた流浪のエルフ。波の音に耳を傾ける穏やかな時間。',
  }),
  cleric: makeSkinEntry('cleric', 'summer', '背徳のサマーバカンス', {
    description:
      '神職の務めを忘れ、開放的な夏を満喫する聖職者。神の慈悲は海よりも広いらしい。',
  }),
  devilhunter: makeSkinEntry('devilhunter', 'summer', '渚の悪魔狩り', {
    description:
      '悪魔を狩るのも夏休みが必要だ。ただし、銃の手入れだけは怠らない。',
  }),
  witch: makeSkinEntry('witch', 'summer', '不機嫌なサマー・グリモワール', {
    description:
      '無理矢理取らされた夏休み。慣れない水着と照りつける太陽のせいで、全く読書に集中できていないようだ。',
  }),
  oni: makeSkinEntry('oni', 'summer', '涼み鬼の波打ち肌', {
    description:
      '普段は和装の鬼娘も、たまには羽を伸ばして海辺で遊ぶ。しかしその圧倒的な力は健在である。',
  }),
  priest: makeSkinEntry('priest', 'summer', '墓守の休息', {
    description:
      '千年の眠りから覚め、海辺で静かに涼む墓守。水面に映る太陽の光を静かに見つめている。',
  }),
  automata: makeSkinEntry('automata', 'summer', 'ウェイブライダー', {
    description:
      '波を切り裂くように疾走する鉄の少女。彼女の心にも、夏の潮風は届くらしい。',
  }),
};

// ---------------------------------------------------------------------------
// 学園スキン
// ---------------------------------------------------------------------------

/** @type {Record<string, Object>} 学園スキンマスタ */
const SCHOOL_SKINS = {
  android: makeSkinEntry('android', 'school', '献身的な後輩', {
    description: 'いつも先輩の背中を追いかける、一途で献身的な後輩。',
  }),
  dragon: makeSkinEntry('dragon', 'school', '放課後ディストーション', {
    description:
      '軽音部でギターをかき鳴らすサークルの姫。彼女のライブはいつも爆音。',
  }),
  knight: makeSkinEntry('knight', 'school', '必勝の剣道部主将', {
    description: '剣道部を全国大会へ導く熱血主将。その竹刀の太刀筋は見えない。',
  }),
  cthulhu: makeSkinEntry('cthulhu', 'school', '妖しきオカ研部長', {
    description: '放課後の旧校舎で怪しげな儀式を行うオカルト研究部の部長。',
  }),
  elf: makeSkinEntry('elf', 'school', '癒しの飼育委員', {
    description:
      '動物をこよなく愛する飼育委員。彼女の周りには常に動物が集まる。',
  }),
  cleric: makeSkinEntry('cleric', 'school', '恐怖の特別指導', {
    description: '逆らう生徒には容赦しない、学園で最も恐れられるスパルタ教師。',
  }),
  devilhunter: makeSkinEntry('devilhunter', 'school', '孤高のスケバン', {
    description: '群れることを嫌う孤高のスケバン。喧嘩の強さは学園一との噂。',
  }),
  witch: makeSkinEntry('witch', 'school', '気怠げな親友の妹', {
    description: '親友の妹で、いつも気怠げにしている。放課後は早く帰りたがる。',
  }),
  oni: makeSkinEntry('oni', 'school', '鬼の風紀委員', {
    description: '校則違反を絶対に許さない風紀委員。その取り締まりはまさに鬼。',
  }),
  priest: makeSkinEntry('priest', 'school', 'ミステリアスな留学生', {
    description: '遠い異国からやってきた留学生。いつも何かを調べているらしい。',
  }),
  automata: makeSkinEntry('automata', 'school', '喧嘩腰なライバル', {
    description: '何故かあなたを一方的にライバル視し、突っかかってくる特待生。',
  }),
};

// ---------------------------------------------------------------------------
// 高難易度スキン
// ---------------------------------------------------------------------------

/** @type {Record<string, Object>} 高難易度スキンマスタ */
const HIGH_SKINS = {
  android: makeSkinEntry('android', 'high', 'フルアーマーユニット'),
  dragon: makeSkinEntry('dragon', 'high', '熱砂の客人'),
  knight: makeSkinEntry('knight', 'high', '暗黒騎士'),
  cthulhu: makeSkinEntry('cthulhu', 'high', '魔界の征服者'),
  elf: makeSkinEntry('elf', 'high', 'リナ&ヴォイテク'),
  cleric: makeSkinEntry('cleric', 'high', '断罪の執行者'),
  devilhunter: makeSkinEntry('devilhunter', 'high', 'ゴーストライダー'),
  witch: makeSkinEntry('witch', 'high', '時空の探索者'),
  oni: makeSkinEntry('oni', 'high', '紅月ノ狂鬼'),
  priest: makeSkinEntry('priest', 'high', '前世の記憶'),
};

// ---------------------------------------------------------------------------
// エクスポート
// ---------------------------------------------------------------------------

/**
 * スキンマスタ定義
 * @type {Object<string, Object<string, Object>>}
 * @example SKIN_MASTER.summer.android.name // '水陸両用装備'
 * @example SKIN_MASTER.summer.android.unlockCondition // '試練交換所で入手'
 * @example SKIN_MASTER.summer.android.description // '研究所より支給された...'
 */
export const SKIN_MASTER = {
  summer: SUMMER_SKINS,
  school: SCHOOL_SKINS,
  high: HIGH_SKINS,
};

/**
 * スキンタイプの表示情報
 * @type {Object<string, Object>}
 */
export const SKIN_TYPE_INFO = {
  summer: { label: '水着' },
  school: { label: '学園' },
  high: { label: '高難易度' },
};

/**
 * スキンタイプごとのキー・ID生成マップ。
 * characters.js と skinDialogues.js の両方で共有し、
 * キー生成ルールの重複・不整合を防止する。
 *
 * @type {Object<string, (charId: string) => { key: string, id: string }>}
 */
export const SKIN_KEY_MAP = {
  summer: (_charId) => ({ key: 'summer', id: 'summer' }),
  school: (_charId) => ({ key: 'school', id: 'school' }),
  high: (charId) => ({ key: `${charId}_high`, id: `${charId}_high` }),
};

/**
 * スキンID（アイコンID・交換所IDと共通）を生成する
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ
 * @returns {string} スキンID（例: 'android_summer'）
 */
export const buildSkinId = (charId, skinType) => `${charId}_${skinType}`;

/**
 * プレイマットIDを生成する
 * @param {string} charId - キャラクターID
 * @param {string} skinType - スキンタイプ
 * @returns {string} プレイマットID（例: 'pm_android_summer'）
 */
export const buildPlaymatId = (charId, skinType) => `pm_${charId}_${skinType}`;

/**
 * スキンマスタから特定キャラクターの全スキン名マップを取得する
 * @param {string} charId - キャラクターID
 * @returns {Object<string, string>} { skinType: name } のマップ
 */
export function getSkinNamesForCharacter(charId) {
  const result = {};
  for (const [skinType, skins] of Object.entries(SKIN_MASTER)) {
    if (skins[charId]) {
      result[skinType] = skins[charId].name;
    }
  }
  return result;
}

/** skinId をキーにしたスキン検索用インデックス */
const SKIN_INDEX = (() => {
  const index = new Map();
  for (const [skinType, skins] of Object.entries(SKIN_MASTER)) {
    for (const [charId, entry] of Object.entries(skins)) {
      index.set(buildSkinId(charId, skinType), { skinType, charId, entry });
    }
  }
  return index;
})();

/**
 * スキンIDからスキンマスタのエントリを検索する
 * IDのフォーマット: '{charId}_{skinType}' (例: 'android_summer', 'knight_school')
 * @param {string} skinId - スキンID
 * @returns {{ skinType: string, charId: string, entry: Object } | null} マッチしたエントリ情報、見つからない場合はnull
 */
export function findSkinEntry(skinId) {
  return SKIN_INDEX.get(skinId) ?? null;
}
