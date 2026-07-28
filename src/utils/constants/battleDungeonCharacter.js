/**
 * Mini Card Battle - Battle Dungeon Characters
 * ダンジョンモードの敵リーダーとしての会話テキストを管理します。
 */
import { CHARACTERS } from './characters.js';
import { CARD_MASTER } from './cards.js';

export const DUNGEON_CHARACTER_DIALOGUE = {
  // デフォルトのセリフ
  default: {
    preBattleLine: '我が前に立ち塞がるか。',
    dialogue: {
      intro: { default: '……立チ去レ。' },
      win: { default: '……脆弱ナ。' },
      lose: { default: '……コレデ終ワリダト思ウナ……。' },
      damage: ['クッ', 'グヌ', 'ヤルカ', 'チッ'],
      skill: 'コノ力ヲ見ヨ！',
      ending: [],
    },
  },
  // --- モンスター・動物系 ---
  monster: {
    preBattleLine: 'グルルル……。',
    dialogue: {
      intro: { default: '……オ前、獲物カ？' },
      win: { default: '……チッ、食イデガナイ。' },
      lose: { default: '……逃ゲル、ゾ……。' },
      damage: ['グアッ', 'ギャア！', 'キシャ！'],
      skill: 'コノ……力……喰ラエ！',
      ending: [],
    },
  },

  beast: {
    preBattleLine: 'ガアアア！獲物を追い詰めたぞ！',
    dialogue: {
      intro: { default: '野生の掟を教えてやろう。' },
      win: { default: 'これが弱肉強食というものだ。' },
      lose: { default: 'よもや、人間ごときに……。' },
      damage: ['ガルッ', 'ヌウッ', 'やるな……'],
      skill: '野性の咆哮を聞け！',
      ending: [],
    },
  },
  wolf: {
    preBattleLine: '月の輝きがお前の血を求めている。',
    dialogue: {
      intro: { default: '狼の牙から逃れられると思うな。' },
      win: { default: '静寂が訪れる……。' },
      lose: { default: '月が……翳る……。' },
      damage: ['クゥン……', 'グルル……', 'まだだ！'],
      skill: '真夜中の狩りが始まる！',
      ending: [],
    },
  },
  dragon: {
    preBattleLine: '龍の息吹に焼かれる準備はできているか。',
    dialogue: {
      intro: { default: '我が焔の糧となるが良い。' },
      win: { default: '灰すらも残らぬ。' },
      lose: { default: '我が誇り……打ち砕かれるか……。' },
      damage: ['ヌオオッ', '小癪な', '熱を帯びるぞ'],
      skill: '万物を灰燼に帰せ！',
      ending: [],
    },
  },
  lizard: {
    preBattleLine: '冷たい鱗が戦いを求めているぞ。',
    dialogue: {
      intro: { default: '古の力、その身で味わえ。' },
      win: { default: '我が爪の錆となれ。' },
      lose: { default: '脱皮……やり直す必要があるか……。' },
      damage: ['シシュッ！', '硬いな……', 'グヌゥ'],
      skill: '原初の衝動を呼び覚ます！',
      ending: [],
    },
  },
  snake: {
    preBattleLine: 'シューッ……獲物の匂い……。',
    dialogue: {
      intro: { default: '逃げられると思うな。' },
      win: { default: '……丸呑みにしてやる。' },
      lose: { default: 'シャーッ！鱗が……！' },
      damage: ['シャァ！', 'ギチッ', 'シューッ'],
      skill: '猛毒に苦しむがいい！',
      ending: [],
    },
  },
  bird: {
    preBattleLine: '上空からの視線に気づかなかったか？',
    dialogue: {
      intro: { default: '風の刃でお前を切り刻もう。' },
      win: { default: '地上を這いつくばって死ね。' },
      lose: { default: '翼が……折れた……。' },
      damage: ['ピギャアッ', '高いな……', 'クッ！'],
      skill: '嵐の翼よ、舞い上がれ！',
      ending: [],
    },
  },
  insect: {
    preBattleLine: '……カサカサ……毒の針がお前を待っているぞ。',
    dialogue: {
      intro: { default: 'お前も、我が巣の一部となれ。' },
      win: { default: '……栄養補給完了。' },
      lose: { default: '……殻が……砕ける……。' },
      damage: ['ギチッ', 'シャアア！', '……ヌッ'],
      skill: '逃げられぬ罠に嵌まれ！',
      ending: [],
    },
  },
  horse: {
    preBattleLine: '蹄の音が死を告げにやってきたぞ。',
    dialogue: {
      intro: { default: 'この突撃、受け止めきれるか！' },
      win: { default: '戦場を駆け抜けるのみ。' },
      lose: { default: '落馬……か……。' },
      damage: ['ヒヒーンッ', 'グハッ！', '止まらん！'],
      skill: '蹂躙せよ、我が蹄！',
      ending: [],
    },
  },
  sea: {
    preBattleLine: 'ブクブク……深海の底へ沈めてやろう。',
    dialogue: {
      intro: { default: '息が……続くかな？' },
      win: { default: '……海の藻屑となったか。' },
      lose: { default: '……波間に……消える……。' },
      damage: ['ギョッ！', 'ブクブクッ！', '水が……'],
      skill: '深淵の恐怖を味わうがいい！',
      ending: [],
    },
  },

  // --- 人間系 ---
  human_male_normal: {
    preBattleLine: '悪いが、ここを通すわけにはいかないんでね。',
    dialogue: {
      intro: { default: '手加減は期待しないでくれよ。' },
      win: { default: 'これも仕事だ、悪く思うな。' },
      lose: { default: '参ったな……完敗だよ。' },
      damage: ['うおっ', 'やるねぇ', 'あぶねっ'],
      skill: 'これが俺の切り札だ！',
      ending: [],
    },
  },
  human_male_ikemen: {
    preBattleLine: '君のような挑戦者を待っていたよ。',
    dialogue: {
      intro: { default: '美しいデュエルを見せよう。' },
      win: { default: '輝きの差、というやつかな。' },
      lose: { default: 'フッ、君の勝ちだ。鮮やかだったよ。' },
      damage: ['クッ', '乱暴だな', '良い刺激だ'],
      skill: '至高の輝きに跪け！',
      ending: [],
    },
  },
  human_male_warrior: {
    preBattleLine: '鍛え直してやる。覚悟せよ！',
    dialogue: {
      intro: { default: '戦場の熱気、久々に思い出させてくれ。' },
      win: { default: 'まだまだ修行が足りんようだな。' },
      lose: { default: '見事な腕前だ。……後は頼むぞ。' },
      damage: ['ヌウッ', '効くぞ！', 'ハハハ！'],
      skill: '全軍、突撃ィー！',
      ending: [],
    },
  },
  human_male_trickstar: {
    preBattleLine: 'さあ、極上のショータイムを始めようか！',
    dialogue: {
      intro: { default: '種も仕掛けもない、ただの絶望さ。' },
      win: { default: 'おっと、もう退場かい？' },
      lose: { default: 'これは……計算外のイリュージョンだな……。' },
      damage: ['おっと！', 'やるねぇ', 'あぶないあぶない'],
      skill: 'さあ、とっておきのマジックだ！',
      ending: [],
    },
  },
  human_male_old: {
    preBattleLine: 'ゴホッ……若者よ、あまり無理はするなよ。',
    dialogue: {
      intro: { default: '亀の甲より年の功、というやつを見せてやろう。' },
      win: { default: 'フォッフォッ、まだまだ若いもんには負けんよ。' },
      lose: { default: 'ゴホッ、ゴホッ……歳には勝てんか……。' },
      damage: ['イタタ……', '腰が……', 'やるのう'],
      skill: '長年の経験を侮るな！',
      ending: [],
    },
  },
  human_female_cool: {
    preBattleLine: '私の前を歩こうなんて、100年早いわ。',
    dialogue: {
      intro: { default: '華麗に散らせてあげるわ。感謝なさい。' },
      win: { default: '実力不足ね。出直してきなさい。' },
      lose: { default: '驚いたわ。あなた、面白いじゃない。' },
      damage: ['あらっ', '不躾ね', 'やるわね'],
      skill: '私の舞台、幕引きの時間よ！',
      ending: [],
    },
  },
  human_female_cute: {
    preBattleLine: '私に勝てると思ってるんですか？',
    dialogue: {
      intro: { default: '一生懸命頑張りますから、覚悟してくださいね！' },
      win: { default: '勝ててよかったです。えへへ。' },
      lose: { default: '負けちゃいました……。悔しいです。' },
      damage: ['いたっ！', 'ひどいです', 'まだ負けません'],
      skill: '精一杯の奇跡、受けてください！',
      ending: [],
    },
  },
  human_female_normal: {
    preBattleLine: '油断しないで。手加減はしないから！',
    dialogue: {
      intro: { default: '私の前に立ち塞がるなら、全力でいくわよ！' },
      win: { default: 'ふぅ、なんとか勝てたわね。' },
      lose: { default: '負けちゃった……まだまだ修行不足ね。' },
      damage: ['ああっ！', '痛いっ！', 'やるわね！'],
      skill: 'これでもくらえっ！',
      ending: [],
    },
  },
  human_female_assassin: {
    preBattleLine: '……。',
    dialogue: {
      intro: { default: '……死角は、もうない。' },
      win: { default: '……任務、完了。' },
      lose: { default: '……影に、戻るだけ……。' },
      damage: ['（無言の苦悶）', '……！', '浅い……'],
      skill: '……急所を貫く。',
      ending: [],
    },
  },
  human_female_sexy: {
    preBattleLine: 'ふふっ、そんなに見つめられたら困っちゃうわ。',
    dialogue: {
      intro: { default: '優しくしてね……なんて、言わないわよ？' },
      win: { default: 'あら、もう終わり？ つまらないわね。' },
      lose: { default: 'ああっ……乱暴な人ね……。' },
      damage: ['いやんっ', 'ちょっと！', '痛いじゃない'],
      skill: '魅惑のひとときをプレゼント！',
      ending: [],
    },
  },

  // --- 魔族・不死系 ---
  devil: {
    preBattleLine: 'お前の魂、最高級の香りがするぜ……！',
    dialogue: {
      intro: { default: '絶望に染まる瞬間が楽しみだなあ！' },
      win: { default: 'ギャハハ！その魂、いただくぜ！' },
      lose: { default: '覚えてろよ……地獄の底で待ってるからな……！' },
      damage: ['グッ！', 'いいねえ！', 'もっと来いよ！'],
      skill: '奈落の底へ突き落としてやる！',
      ending: [],
    },
  },
  undead: {
    preBattleLine: '冷たい冥府への招待状を持ってきたぞ。',
    dialogue: {
      intro: { default: 'お前も、死の安らぎが欲しいのだろう？' },
      win: { default: 'これで、永遠に私の仲間だ。' },
      lose: { default: 'また、長い眠りにつくとしよう……。' },
      damage: ['あぁ……', '身体が……', '無駄だ……'],
      skill: '死者の慟哭を聞け！',
      ending: [],
    },
  },

  // --- 無機物・機械系 ---
  stone: {
    preBattleLine: '不壊の壁が、お前を拒む。',
    dialogue: {
      intro: { default: '沈黙の重圧、耐えられるか。' },
      win: { default: '変化なし。排除完了。' },
      lose: { default: '……風化……それも運命か。' },
      damage: ['ゴギッ', '揺るがぬ', '……ヌッ'],
      skill: '地脈の怒りを受けよ。',
      ending: [],
    },
  },
  machine_old: {
    preBattleLine: '【警告】侵入者を検知。直ちに排除フェーズへ移行します。',
    dialogue: {
      intro: { default: '【出力40%】戦闘用プロトコル……開始。' },
      win: { default: '……目標の生存反応消失を確認しました。' },
      lose: { default: 'システム……ダウン……。' },
      damage: ['バチンッ！', '修復中……', 'エラー回避'],
      skill: '緊急オーバードライブ発動！',
      ending: [],
    },
  },
  machine_new: {
    preBattleLine: '最新型の性能、お前の旧式な脳に刻んでやるよ。',
    dialogue: {
      intro: { default: '演算終了。お前の勝率は0.02%だ。' },
      win: { default: '予測通りの結果だ。効率的な戦いだった。' },
      lose: { default: '理解不能なバグだ……修正が必要か……。' },
      damage: ['計算外だな', 'シールド低下', 'クッ！'],
      skill: '全次元・最適化レーザー発射！',
      ending: [],
    },
  },

  // --- 特殊・上級系 ---
  giant: {
    preBattleLine: '踏み潰してやる。アリんこめ！',
    dialogue: {
      intro: { default: 'グハハハ！俺のサイズに驚いたか！' },
      win: { default: 'これぞ力の違いよ！' },
      lose: { default: 'こんな小癪なヤツに……山が崩れる……。' },
      damage: ['ぬおおお！', 'ハエが！', '痛くねえ！'],
      skill: '天地を揺るがす一撃だ！',
      ending: [],
    },
  },
  sword: {
    preBattleLine: '我が剣に、斬れぬものなし。',
    dialogue: {
      intro: { default: '無駄な足掻きだ。その身で悟るが良い。' },
      win: { default: '一閃。それだけの話だ。' },
      lose: { default: '見事な一太刀。これ以上の言葉は不要か。' },
      damage: ['甘い', 'ふむ……', '良き太刀筋だ'],
      skill: '極致の剣、見せてやろう！',
      ending: [],
    },
  },

  magic: {
    preBattleLine: '大地に流れるマナよ、我が呼びかけに応えよ。',
    dialogue: {
      intro: { default: '魔術の深淵、その身で味わうが良いわ。' },
      win: { default: 'ふふん、計算通りの結末ね。' },
      lose: { default: '術式が……破綻した……？' },
      damage: ['きゃっ！', '魔力が……', 'くっ！'],
      skill: '秘められし魔力よ、解き放たれよ！',
      ending: [],
    },
  },
};

/**
 * ダンジョン敵がモブ敵（キャラクターでない敵）かどうかを判定します。
 * @param {object} opp - 敵オブジェクト
 * @param {boolean} isBoss - ボスフラグ
 * @returns {boolean}
 */
export function checkIsGenericMob(opp, isBoss) {
  return !!(opp && opp.isDungeonEnemy && !isBoss && !opp.charId);
}

export function getDungeonCharacterDialogue(id, opp) {
  if (typeof id !== 'string' || !id) {
    return DUNGEON_CHARACTER_DIALOGUE.default;
  }

  let charId = id;
  const isBoss = id.startsWith('dungeon_boss_');
  if (isBoss) {
    const parts = id.split('_');
    if (parts[2]) charId = parts[2];
  }

  // 1. キャラクターボス (dungeon_boss_) またはプレイヤーキャラクターで、モブ敵でない場合
  const isGenericMob = checkIsGenericMob(opp, isBoss);

  if (CHARACTERS[charId] && !isGenericMob) {
    const char = CHARACTERS[charId];
    return {
      preBattleLine:
        char.preBattleLine || char.dialogue?.intro?.default || '……',
      dialogue: char.dialogue || {},
    };
  }

  // 2. モブ敵・カードの場合（モブドラゴン等）
  let rawId = id.replace('dungeon_', '');
  if (rawId.includes('_') && !rawId.startsWith('token_')) {
    rawId = rawId.split('_')[0];
  }

  // 直接のID一致をチェック（golem, vampire, dragon等）
  if (DUNGEON_CHARACTER_DIALOGUE[rawId]) {
    return DUNGEON_CHARACTER_DIALOGUE[rawId];
  }

  // cards.js の CARD_MASTER から直接ボイスカテゴリを取得
  const cardData = CARD_MASTER.find((c) => c.id === rawId);
  const voiceCategoryId = cardData ? cardData.voiceCategory : null;
  if (voiceCategoryId && DUNGEON_CHARACTER_DIALOGUE[voiceCategoryId]) {
    return DUNGEON_CHARACTER_DIALOGUE[voiceCategoryId];
  }

  return DUNGEON_CHARACTER_DIALOGUE.default;
}
