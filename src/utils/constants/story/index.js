// Mini Card Battle - Story Mode Dialogue Database Index
import { CHARACTERS } from '../characters.js';
import { STORY_NARRATIONS } from './narrations.js';

// 各キャラクターデータの個別インポート
import * as android from './android.js';
import * as cleric from './cleric.js';
import * as cthulhu from './cthulhu.js';
import * as devilhunter from './devilhunter.js';
import * as dragon from './dragon.js';
import * as elf from './elf.js';
import * as knight from './knight.js';
import * as oni from './oni.js';
import * as priest from './priest.js';
import * as witch from './witch.js';

const charModules = {
  android,
  dragon,
  knight,
  cthulhu,
  elf,
  cleric,
  devilhunter,
  witch,
  oni,
  priest,
};

// 再エクスポート用の結合オブジェクト構築
export { STORY_NARRATIONS };

export const STORY_INTROS = {};
export const PLAYER_TALKS = {};
export const STORY_DIALOGUES = {};
export const STORY_ENDINGS = {};
export const STORY_ROMANTIC_TALKS = {};

for (const [charName, module] of Object.entries(charModules)) {
  STORY_INTROS[charName] = module.storyIntro;
  PLAYER_TALKS[charName] = module.playerTalks;
  STORY_DIALOGUES[charName] = module.storyDialogues;
  STORY_ENDINGS[charName] = module.storyEnding;
  STORY_ROMANTIC_TALKS[charName] = module.storyRomanticTalk;
}

// 汎用の対戦相手・プレイヤーの会話テンプレート (STORY_DIALOGUES 内に定義がない場合のフォールバック)
export function getFallbackStoryDialogue(
  playerId,
  enemyId,
  isPre = true,
  isLate = false
) {
  const pChar = CHARACTERS[playerId] || CHARACTERS.android;
  const eChar = CHARACTERS[enemyId] || CHARACTERS.android;

  // 主人公への呼称の判定
  let honorific = 'あなた';
  if (playerId === 'android') honorific = 'マスター';
  else if (playerId === 'dragon') honorific = 'あんた';
  else if (playerId === 'knight') honorific = '君';
  else if (playerId === 'cthulhu') honorific = '貴方';
  else if (playerId === 'elf') honorific = 'あなた';
  else if (playerId === 'cleric') honorific = 'あんた';
  else if (playerId === 'devilhunter') honorific = '雇い主さん';
  else if (playerId === 'witch') honorific = '先輩';
  else if (playerId === 'oni') honorific = '貴方様';
  else if (playerId === 'priest') honorific = '侵入者';

  if (isPre) {
    // 戦闘前会話（両者2回ずつの掛け合い、計4行）
    // 敵の1回目の台詞で「名乗り」をプログラム的に自動挿入！
    let enemyIntro = `私は${eChar.name}。この先へ進むため、立ち塞がる者と手合わせをさせてもらう。`;
    if (enemyId === 'void') {
      enemyIntro = `……（意思を持たぬ冷酷な瞳が、あなたたちの魂を捉えている）`; // ゼノンは名乗り不要
    } else if (enemyId === 'succubus') {
      enemyIntro = `ふふっ、私は隷属の女王ヴィオラよ。こんなところに迷い込むなんて、私に隷属したいのかしら？`;
    } else if (enemyId === 'warlock') {
      enemyIntro = `フフフ……私はかつて大賢者と呼ばれ、今は邪教を支配する者、バルタザール。魔王の力すらも私の野望を果たすための道具に過ぎん。邪魔する愚か者どもめ、塵にしてくれよう。`;
    } else if (enemyId === 'satan') {
      enemyIntro = `フハハハ！ 我こそは魔王サタン！ 世界を絶望と虚無の闇に沈める支配者なり！`;
    }

    let playerIntro = `私は${pChar.name}。手合わせ、お受けしましょう。`;
    if (isLate) {
      playerIntro = `私は${pChar.name}。サタン討伐のため、先へ進ませてもらう！`;
    }

    let enemySecond = `退くつもりはない。全力で相手をしよう！`;
    if (enemyId === 'void') {
      enemySecond = `……`;
    } else if (enemyId === 'succubus') {
      enemySecond = `あなたの綺麗な魂、絶望の快楽に沈めて差し上げましょう！`;
    } else if (enemyId === 'warlock') {
      enemySecond = `言い訳など不要……。私の闇の魔術の前に、ひれ伏して絶命するが良い！`;
    } else if (enemyId === 'satan') {
      enemySecond = `我が絶望の炎で、一瞬にして焼き尽くしてくれよう！`;
    }

    let playerSecond = `こちらも全力で参ります！`;
    if (isLate) {
      playerSecond = `魔王城の奥へ進むため、必ず打ち破ってみせる！`;
    }

    return [
      { speaker: 'enemy', text: enemyIntro },
      { speaker: 'player', text: playerIntro },
      { speaker: 'enemy', text: enemySecond },
      { speaker: 'player', text: playerSecond },
    ];
  } else {
    // 戦闘後会話（敵の敗北宣言、プレイヤーの勝利宣言、計2行）
    let enemyOut = `${eChar.name}、敗北を認めよう。見事な戦いだった。`;
    if (enemyId === 'void') {
      enemyOut = `……（黒き甲冑が崩れ去り、虚空の底へと消えていく……）`;
    } else if (enemyId === 'succubus') {
      enemyOut = `キャアアアッ！ この私が、負けるなんて……！ サタン様……！`;
    } else if (enemyId === 'warlock') {
      enemyOut = `バ、バカな……！ この私が、このような小童どもに敗れるなど……あり得ん……！`;
    } else if (enemyId === 'satan') {
      enemyOut = `グ、オオオオッ……！ 我が滅びるだと……！？ この魔王サタンが……！`;
    }

    let playerOut = `${pChar.name}の勝利です。前進を継続しましょう。`;
    if (isLate) {
      // 後半戦（第5〜6戦）のプレイヤー勝利宣言には「引き留め」を実装するルール！
      playerOut = `お前はもうボロボロだ。これ以上進めば、お前は確実に死ぬ。お前はここで大人しく傷を癒していろ。サタン討伐は、私と${honorific}で必ず成し遂げる。`;
    }

    return [
      { speaker: 'enemy', text: enemyOut },
      { speaker: 'player', text: playerOut },
    ];
  }
}
