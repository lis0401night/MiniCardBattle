import { getDialogue } from '../gameUtils.js';

export const TOURNAMENT_INTRO_DIALOGUE = (enemyConfig) => [
  {
    speaker: 'narrator',
    text: '気がつくと、見慣れない景色の場所に立っていた。',
  },
  {
    speaker: 'narrator',
    text: '周囲には近代的な建物が立ち並び、行き交う人々もどこか洗練されている。\n異世界に迷い込んだのか、それともこれは夢なのだろうか……？',
  },
  {
    speaker: 'enemy',
    charData: enemyConfig,
    text: 'あっ、こんなところにいたんですか！\nもう、ずっと探してたんですよ！',
  },
  {
    speaker: 'enemy',
    charData: enemyConfig,
    text: '今日は待ちに待ったカードゲーム\n「LANE DEFENDERS」の全国大会の日じゃないですか！',
  },
  {
    speaker: 'enemy',
    charData: enemyConfig,
    text: '絶対優勝するって約束したでしょ！\nさあ、急いで会場に行きますよ！',
  },
  {
    speaker: 'narrator',
    text: 'よく見知った顔によく似た相手に急かされ、\n戸惑いながらも、言われるがままに大会の会場へと向かうのだった……。',
  },
];

export function getTournamentPreMatchDialogue(
  round,
  enemyConfig,
  playerConfig
) {
  let roundText = `第${round}回戦`;
  if (round === 4) roundText = '決勝戦';

  const introEnemy =
    getDialogue(enemyConfig, playerConfig, 'intro', 'enemy') ||
    'いざ、尋常に勝負！';
  const introPlayer =
    getDialogue(playerConfig, enemyConfig, 'intro', 'player') || '負けません！';

  return [
    {
      speaker: 'narrator',
      speakerName: '大会司会者',
      text: `さあ、いよいよ${roundText}の開始です！\n会場のボルテージも最高潮に達しております！`,
    },
    {
      speaker: 'narrator',
      speakerName: '大会司会者',
      text: '両選手、位置について……バトルスタート！',
    },
    {
      speaker: 'enemy',
      text: introEnemy,
    },
    {
      speaker: 'player',
      text: introPlayer,
    },
  ];
}
