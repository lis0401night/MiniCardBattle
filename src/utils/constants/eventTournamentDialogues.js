import { getDialogue } from '../gameUtils.js';

// トーナメント参加校名（ブラケット画面・司会者台詞で共有）
export const SCHOOL_NAMES = {
  android: '学校法人機構学園',
  dragon: '竜ヶ峰高校',
  knight: '音奈岸高校',
  cthulhu: 'アザトス水産高校',
  cleric: '聖クロース女学院',
  elf: '迷いの森学院',
  devilhunter: 'リアニ工業高校',
  witch: '県立黒間道高校',
  oni: '鬼ヶ島高校',
  priest: '王谷ハイスクール',
  automata: 'X大学付属高校',
};

export const TOURNAMENT_CHARACTER_DIALOGUES = {
  android: {
    intro: [
      '先輩、ついに全国大会ですね！ 私たち、ずっとこの日のためにデッキ調整をしてきましたからね。',
      '一緒に優勝目指して頑張りましょうね！',
    ],
    venue: [
      'すごい熱気……さすが全国大会の会場ですね。',
      'でも大丈夫です、私がしっかりサポートしますから！',
    ],
    postMatch: {
      1: [
        '初戦突破、おめでとうございます！ 先輩のプレイング、完璧でした！',
        'この調子で次もどんどん勝ち進みましょうね！',
      ],
      2: [
        '第2回戦も難なくクリアですね！ さすが先輩です！',
        'でも油断は大敵です。次の相手はもっと強いはずですから！',
      ],
      3: [
        '準決勝も突破……すごいです、先輩！',
        '次はいよいよ決勝……全力で挑みましょう！ 私も全力でサポートします！',
      ],
      default: ['先輩、勝ちましたね！', '次の試合も一緒に頑張りましょう！'],
    },
    win: [
      '全試合終了……先輩、やりましたね！ 私たちの優勝です！',
      '先輩の一番近くでこの瞬間を見られて……私、本当に嬉しいです！',
    ],
  },
  dragon: {
    intro: [
      'いよいよカードゲームの全国大会ね！ 私のギターみたいに、ガンガン攻めていくわよ！',
      'アンタも私のビートにしっかりついてきなさいよね！',
    ],
    venue: [
      'うっわー、会場はすっごい人ね！ ライブハウスより熱気があるんじゃない？',
      'さあ、最高のセッションを見せつけてやりましょ！',
    ],
    postMatch: {
      1: [
        'あっはっは！ 私たちのリズムに全然乗れてなかったわね！',
        'このまま一気に駆け上がるわよ！ テンション上げてこ！',
      ],
      2: [
        '少しは骨のある相手だったけど、私の爆音ビートには敵わないわ！',
        'ここからが本番よ！ もっとボリューム上げていくわよ！',
      ],
      3: [
        'やったわ！ 次で決勝進出ね！',
        '私のテンション、もう最高潮よ！ このまま一気に優勝しちゃうわよ！',
      ],
      default: ['イェーイ！ 楽勝ね！', '次のステージも盛り上がっていくわよ！'],
    },
    win: [
      'やったぁ！ 私たちの優勝よ！！',
      'アンタとのセッション、最高だったわ！ 今日は打ち上げで朝まで騒ぐわよ！',
    ],
  },
  knight: {
    intro: [
      'ついに全国大会……剣道だけでなく、カードゲームでも頂点を極めます！',
      '君との特訓の成果、今こそ見せる時だ。いざ尋常に！',
    ],
    venue: [
      '静まり返るほどの闘気……いや、ただのカードゲームの会場か。',
      'しかし、武道もカードも心技体が重要だ。気を引き締めていくぞ！',
    ],
    postMatch: {
      1: [
        'まずは一本！ 立派な勝利だ。',
        '次の相手も全力で迎え撃つ。気を緩めるな！',
      ],
      2: [
        '良き手筋だった。対戦相手の健闘にも敬意を。',
        'だが、ここからが真の勝負。さらに剣を研ぎ澄ませよう。',
      ],
      3: [
        '見事だ……この一戦、我が剣道の精神に通じるものがあった。',
        '決勝への道が開けたぞ。最後まで正々堂々、全力を尽くそう！',
      ],
      default: ['勝負あり！', '次の相手も全力で迎え撃つのみ！'],
    },
    win: [
      'ついに、私たちが全国の頂点に立ったのですね……！',
      'この勝利は君の采配と私の鍛錬が合わさった結果です。感謝します！',
    ],
  },
  cthulhu: {
    intro: [
      'うふふ……ついに大会の日ね。部室の奥で見つけた、絶対勝てる呪いの儀式……試すのが楽しみだわ。',
      'さあ、一緒に相手を絶望の底に突き落としてあげましょう？',
    ],
    venue: [
      'あら、随分と賑やかな会場ね。この熱気……呪いに変えがいがあるわ。',
      '私の実験台に相応しい相手は見つかるかしら？',
    ],
    postMatch: {
      1: [
        'うふふ……儀式が効いたみたいね。あっけなかったわ。',
        'もっと強い相手がいないかしら？ 次の実験台が楽しみだわ。',
      ],
      2: [
        'いい顔をしていたわ……敗北の恐怖に歪む顔、嫌いじゃないわよ。',
        '次の相手にはもっと強力な呪いをかけてあげましょう。',
      ],
      3: [
        'これで決勝進出ね。学園七不思議の力、まだまだこんなものじゃないわよ。',
        '最後の儀式……最大級のものを用意してあるわ。楽しみにしていなさい？',
      ],
      default: ['あら、もう降参してしまったの？', '次の獲物を探しましょう。'],
    },
    win: [
      '優勝……うふふ、私たちの完全なる勝利ね。儀式は大成功よ。',
      'あなたもオカルト研究部の副部長にしてあげるわ。光栄に思いなさい？',
    ],
  },
  elf: {
    intro: [
      '大きな大会なのね……学校の動物たちも、お留守番しながら応援してくれてるわ。',
      'あなたと一緒なら、きっといい結果が出せると思う。',
    ],
    venue: [
      'ここが会場なのね。すごく人が多くて……動物園より騒がしいかも。',
      'でも、迷わず進みましょう。深呼吸してね。',
    ],
    postMatch: {
      1: [
        '初戦、無事に勝ててよかったわ。相手の子、泣いてなかったかしら？',
        'まだ先は長いけど……一歩ずつ、進みましょう。',
      ],
      2: [
        'だんだん相手が強くなってきてる気がする……。',
        'でも大丈夫。ウサギさんのように軽やかにいきましょう！',
      ],
      3: [
        'ここまで来れたなんて信じられない……。',
        'あと少しよ……最後まで一緒に頑張りましょう！',
      ],
      default: ['勝ててよかった。', '少し休憩してから、次も頑張りましょう。'],
    },
    win: [
      '本当に、私たちが優勝しちゃったのね……！',
      'あなたと頑張って練習したおかげよ。帰ったら、動物たちにも報告しなくちゃ！',
    ],
  },
  cleric: {
    intro: [
      '大会だからって浮かれるんじゃないわよ！ 特別指導の成果、全国に知らしめる時が来たわ。',
      'もし一回戦で負けたりしたら……その時は、わかっているわね？',
    ],
    venue: [
      'どの参加者もなかなかいじめがい…いえ、教育しがいがありそうね……。',
      '私が全員、叩き直してあげるわ！',
    ],
    postMatch: {
      1: [
        '当然の結果ね。私に指導されたあなたが負けるはずないでしょう。',
        '次の相手にも、私の教育の成果を思い知らせてあげるわ！',
      ],
      2: [
        '相手のプレイング、甘すぎるわ。当然の勝利ね！',
        'でも次はもう少し手強いはずよ。油断したら許さないわよ。',
      ],
      3: [
        'いよいよ準決勝も突破ね。',
        'ここまできたら優勝以外は許さないわよ！ 最後まで気を抜かないで！',
      ],
      default: ['まあ、悪くないわ。', '次の試合も気を抜かないように！'],
    },
    win: [
      '素晴らしい！ 全ての対戦相手を指導し、見事優勝よ！',
      'あなたの頑張りは私が一番分かっているわ。今日は特別に宿題を免除してあげる！',
    ],
  },
  devilhunter: {
    intro: [
      'カードの大会ねぇ……。優勝賞金が良いから付き合ってあげてるだけよ。',
      '私の足を引っ張ったら、容赦なくシメるからね。',
    ],
    venue: [
      '人が多くてイライラするわね……。',
      'さっさと全員ぶっ倒して、賞金もらって帰るわよ。',
    ],
    postMatch: {
      1: [
        'ま、こんなもんね。楽勝すぎてもうあくびが出そう。',
        'さっさと次行くわよ。時間の無駄は嫌いなの。',
      ],
      2: [
        '少しは骨のある奴が出てきたみたいね。でも私の敵じゃないわ。',
        'まだまだ余裕ね。次の奴も同じ目に遭わせてあげる。',
      ],
      3: [
        'フン、ここまで来ると相手もそれなりってことね。',
        '次で決勝？ ちゃっちゃと片付けて賞金もらうわよ。',
      ],
      default: ['はいはい、勝ったわ。', '次ね、次。早く終わらせたいのよ。'],
    },
    win: [
      '優勝……ふーん、あんたもなかなかやるじゃない。',
      '約束通り、賞金は山分けにしてあげる。帰りにおごってよね。',
    ],
  },
  witch: {
    intro: [
      'はぁ……なんで私が、先輩と一緒に大会なんて出なきゃいけないんですか。',
      'さっさと負けて、先輩の家でゲームしましょうよ……。',
    ],
    venue: [
      '人が多くてうるさいです……帰りたくなってきました。',
      'もう、適当にプレイして早く終わらせましょうよ。',
    ],
    postMatch: {
      1: [
        'えっ、勝っちゃったんですか？ ……まあ、適当にやっても勝てるレベルですね。',
        'もう帰りましょうよ……まだ続くんですか？',
      ],
      2: [
        'はぁ……まだ終わらないんですね。面倒くさ……。',
        '……まあ、ここまで来たら適当に最後まで付き合ってあげますよ。',
      ],
      3: [
        'まだ続くんですか！？ 本当に面倒くさいです……！',
        '……でも、ここまで来ちゃったし……負けるのも癪ですね。',
      ],
      default: ['はぁ……疲れました。', '早く終わってほしいです……。'],
    },
    win: [
      'やっと……やっと終わったんですね！ 優勝なんてどうでもいいです。',
      'これで解放されます！ さあ、一秒でも早く家に帰りますよ！',
    ],
  },
  oni: {
    intro: [
      'カードゲームの大会と言えど、ルールとマナーは絶対です！',
      '不正行為や遅延行為を行う者は、この私が厳正に処罰します！',
    ],
    venue: [
      '会場内は走らない！ ゴミは持ち帰る！……全く、風紀が乱れていますね。',
      'いざ、正々堂々勝負です！',
    ],
    postMatch: {
      1: [
        '服装の乱れは心の乱れ！ プレイングにも迷いが見えましたね。',
        '次の対戦でも、正々堂々の精神で臨みます！',
      ],
      2: [
        '見事なマナーでしたが、私には及びません。',
        'この大会、風紀を正すいい機会です。次も全力で参ります！',
      ],
      3: [
        '正義は必ず勝つのです！ 準決勝も突破しました！',
        '決勝の舞台……全校の模範となるような戦いを見せましょう！',
      ],
      default: [
        '次の試合も、油断せずいきましょう。',
        'ルールを守り、正々堂々と！',
      ],
    },
    win: [
      '見事な戦いぶりでした！ ルールを守り抜いての優勝、誇らしいです！',
      'あなたと共に戦えたこと、風紀委員として名誉に思います。',
    ],
  },
  priest: {
    intro: [
      '……大会……。日本のカードゲーム、興味深い……。',
      '……わかった。私にできること、やるだけ……。',
    ],
    venue: [
      '……人が、たくさん……。少し、息苦しい……。',
      '……でも、あなたが一緒なら……平気……。',
    ],
    postMatch: {
      1: [
        '……勝てた……。日本のプレイヤー、強い……。',
        '……でも、まだ……負けない……。',
      ],
      2: [
        '……カードのコンボ……すごく勉強になる……。',
        '……次も、頑張る……あなたと一緒に……。',
      ],
      3: ['……あと一つ、勝てば……決勝……。', '……絶対に……負けたくない……。'],
      default: ['……終わった……。', '……次、行く……。'],
    },
    win: [
      '……優勝……したの、私たち……？',
      '……ありがとう。日本のカードゲーム、すごく……楽しかった……。',
    ],
  },
  automata: {
    intro: [
      'カードゲームの大会に出るらしいわね！私も一緒にエントリーしておいたから！',
      '……何？とぼけた顔して。あなたを倒すのはこの私だから、他の奴に負けるなんて許さないわ',
    ],
    venue: [
      'こんなに人がいるのね……。研究室の機械と違って、人間ってうるさいわ。',
      '……でも、この熱気は嫌いじゃないかも。……聞こえた？ 今のは独り言よ。',
    ],
    postMatch: {
      1: [
        'ふん、まあこんなものでしょ。最初の相手にしては悪くなかったわ。',
        'あなたのプレイング？ ……まあまあね。褒めてないわよ？',
      ],
      2: [
        '少しは骨のある相手が出てきたわね。でも私の計算の範囲内よ。',
        '……あなたとの連携、少しだけ噛み合ってきた気がする。……気のせいよ、気のせい。',
      ],
      3: [
        'ここまで来ると、対戦相手のデッキ構築もなかなか理論的ね。',
        '決勝まであと一歩……ここで負けたら、学院の子たちに顔向けできないわ。……べ、別にあなたのためじゃなくて、私のプライドの問題よ！',
      ],
      default: ['勝ったわ。', 'さっさと次に行くわよ。'],
    },
    win: [
      '優勝……やったわ。ほら見なさい、私の理論は完璧だったでしょう？',
      '……ねえ。……ありがとう、なんて言わないわよ。でも……あなたとじゃなかったら、ここまで来れなかったかもしれない。……聞こえなかった？ じゃあもう一度は言わないから。',
    ],
  },
};

export const TOURNAMENT_INTRO_DIALOGUE = (playerConfig) => {
  const introTexts = TOURNAMENT_CHARACTER_DIALOGUES[playerConfig.id]?.intro || [
    '……。',
    'さあ、大会に挑もう。',
  ];
  return [
    {
      speaker: 'narrator',
      text: '気がつくと、見慣れない景色の場所に立っていた。',
    },
    {
      speaker: 'narrator',
      text: '周囲には近代的な建物が立ち並び、行き交う人々もどこか洗練されている。\n異世界に迷い込んだのか、それともこれは夢なのだろうか……？',
    },
    ...introTexts.map((text) => ({
      speaker: 'player',
      charData: playerConfig,
      text: text,
    })),
    {
      speaker: 'narrator',
      text: '見知った顔によく似た彼女に急かされ、\n戸惑いながらも、言われるがままに大会の会場へと向かうのだった……。',
    },
  ];
};

export function getTournamentVenueDialogue(playerConfig) {
  const venueTexts = TOURNAMENT_CHARACTER_DIALOGUES[playerConfig.id]?.venue || [
    '会場に着いたぞ。',
    '頑張ろう。',
  ];
  return [
    {
      speaker: 'narrator',
      text: '大会会場に到着した。\n巨大なアリーナには、全国から集まった参加者たちの熱気が渦巻いている。',
    },
    ...venueTexts.map((text) => ({
      speaker: 'player',
      charData: playerConfig,
      text: text,
    })),
  ];
}

export function getTournamentPostMatchDialogue(round, playerConfig) {
  const charDialogues =
    TOURNAMENT_CHARACTER_DIALOGUES[playerConfig.id]?.postMatch;
  let postMatchTexts = ['勝ちましたね！'];
  if (charDialogues) {
    if (charDialogues[round]) {
      postMatchTexts = charDialogues[round];
    } else if (charDialogues.default) {
      postMatchTexts = charDialogues.default;
    }
  }

  return postMatchTexts.map((text) => ({
    speaker: 'player',
    charData: playerConfig,
    text: text,
  }));
}

/**
 * 戦闘直後（両キャラ表示中）に流す司会者の実況コメントを取得する
 * @param {number} round - ラウンド番号（1-4）
 * @param {boolean} playerWon - プレイヤーが勝利したかどうか
 * @param {Object} playerConfig - プレイヤーのconfig
 * @param {Object} enemyConfig - 敵のconfig
 */
export function getTournamentPostBattleAnnounce(
  round,
  playerWon,
  playerConfig,
  enemyConfig
) {
  const winnerSchool = playerWon
    ? SCHOOL_NAMES[playerConfig.id] || '不明高校'
    : SCHOOL_NAMES[enemyConfig.id] || '不明高校';

  let line1 = '';
  let line2 = '';
  switch (round) {
    case 1:
      line1 = '第1回戦、決着です！';
      line2 = `${winnerSchool}、見事な勝利です！ この勢いは次の試合でも続くのか！？`;
      break;
    case 2:
      line1 = '準々決勝、決着！';
      line2 = `${winnerSchool}、ベスト4進出決定！ 素晴らしい戦いでした！`;
      break;
    case 3:
      line1 = '準決勝、決着ーー！';
      line2 = `${winnerSchool}、決勝進出です！！ 優勝まであと一歩！！`;
      break;
    default:
      line1 = '試合終了です！';
      line2 = `${winnerSchool}、素晴らしい戦いでした！`;
      break;
  }

  return [
    { speaker: 'narrator', speakerName: '大会司会者', text: line1 },
    { speaker: 'narrator', speakerName: '大会司会者', text: line2 },
  ];
}

export function getTournamentWinDialogue(playerConfig) {
  const winTexts = TOURNAMENT_CHARACTER_DIALOGUES[playerConfig.id]?.win || [
    'やりました、優勝です！',
    '応援ありがとうございました！',
  ];
  return [
    {
      speaker: 'narrator',
      speakerName: '大会司会者',
      text: '決着ーー！！\n今、ここに新たなチャンピオンが誕生しました！！',
    },
    {
      speaker: 'narrator',
      text: '会場全体が割れんばかりの歓声に包まれている。',
    },
    ...winTexts.map((text) => ({
      speaker: 'player',
      charData: playerConfig,
      text: text,
    })),
  ];
}

export function getTournamentPreMatchDialogue(
  round,
  enemyConfig,
  playerConfig
) {
  let roundText = '';
  switch (round) {
    case 1:
      roundText = '第1回戦';
      break;
    case 2:
      roundText = '準々決勝';
      break;
    case 3:
      roundText = '準決勝';
      break;
    case 4:
      roundText = '決勝戦';
      break;
    default:
      roundText = `第${round}回戦`;
      break;
  }

  const introEnemy =
    getDialogue(enemyConfig, playerConfig, 'intro', 'enemy') ||
    'いざ、尋常に勝負！';
  const introPlayer =
    getDialogue(playerConfig, enemyConfig, 'intro', 'player') || '負けません！';

  // プレイヤーと相手の高校名を取得
  const playerSchool = SCHOOL_NAMES[playerConfig.id] || '不明高校';
  const enemySchool = SCHOOL_NAMES[enemyConfig.id] || '不明高校';

  // ラウンドごとに司会者の台詞を変える
  let announcerLine1 = '';
  let announcerLine2 = '';
  let announcerLine3 = '';
  let announcerLine4 = '';
  switch (round) {
    case 1:
      announcerLine1 = `さあ、${roundText}の開始です！\nどのような戦いが繰り広げられるのか、注目していきましょう！`;
      announcerLine2 = `まずはこちら、${playerSchool}！`;
      announcerLine3 = `対するは、${enemySchool}！`;
      announcerLine4 = '両選手、位置について……バトルスタート！';
      break;
    case 2:
      announcerLine1 = `続いては${roundText}！\nここからは一段とレベルの高い戦いが予想されます！`;
      announcerLine2 = `勢いに乗る${playerSchool}！ この勢いは止められるのか！？`;
      announcerLine3 = `迎え撃つは${enemySchool}！`;
      announcerLine4 = 'さあ両選手、準備はいいですか……バトルスタート！';
      break;
    case 3:
      announcerLine1 = `いよいよ${roundText}です！\n会場の緊張感が一気に高まってまいりました！`;
      announcerLine2 = `ここまで勝ち上がってきた${playerSchool}！ 決勝の舞台は目の前です！`;
      announcerLine3 = `立ちはだかるは${enemySchool}！ こちらも一歩も引きません！`;
      announcerLine4 = '決勝への切符を懸けて……バトルスタート！！';
      break;
    case 4:
      announcerLine1 = `ついに${roundText}！！\n会場のボルテージも最高潮に達しております！！`;
      announcerLine2 = `激戦を勝ち抜いてきた${playerSchool}！！`;
      announcerLine3 = `そして${enemySchool}！！ 両校ともに一歩も譲らぬ戦いを見せてくれました！`;
      announcerLine4 = '栄冠を手にするのはどちらだ……バトルスタート！！！';
      break;
    default:
      announcerLine1 = `${roundText}の開始です！`;
      announcerLine2 = `こちら、${playerSchool}！`;
      announcerLine3 = `対するは、${enemySchool}！`;
      announcerLine4 = '両選手、位置について……バトルスタート！';
      break;
  }

  return [
    {
      speaker: 'narrator',
      speakerName: '大会司会者',
      text: announcerLine1,
    },
    {
      speaker: 'narrator',
      speakerName: '大会司会者',
      text: announcerLine2,
    },
    {
      speaker: 'narrator',
      speakerName: '大会司会者',
      text: announcerLine3,
    },
    {
      speaker: 'narrator',
      speakerName: '大会司会者',
      text: announcerLine4,
    },
    {
      speaker: 'enemy',
      charData: enemyConfig,
      text: introEnemy,
    },
    {
      speaker: 'player',
      charData: playerConfig,
      text: introPlayer,
    },
  ];
}
