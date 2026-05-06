const LIGHT = {
  name: '光の少女',
  color: '#fcd34d',
  image: 'assets/cards/card_light.jpg',
};
const ROOKIE = {
  name: '新入りの若者',
  color: '#60a5fa',
  image: 'assets/cards/card_fighter.jpg',
};
const BREAKER = {
  name: '鉄面の男',
  color: '#94a3b8',
  image: 'assets/cards/card_prisoner.jpg',
};

export const NODE_1_1 = {
  '1-1_pre': {
    appState: 'pre_dialogue',
    gameMode: 'campaign',
    enemyConfig: () => LIGHT,
    dialogueQueue: [
      {
        speaker: 'narrator',
        text: '冷たく、湿った石畳の感触が背中を突き刺す。\n鼻をつくのは、ひどく淀んだ鉄サビと腐敗の入り混じった異臭だ。',
      },
      {
        speaker: 'narrator',
        text: 'ピチャリ、と、どこか遠くで水滴が落ちる音が反響している。\nここはどこだ？ 自分が誰なのか、なぜここに倒れているのか、何も思い出せない。',
      },
      {
        speaker: 'narrator',
        text: '意識が泥海から浮上するように、ゆっくりと目を開ける。\n脳は濃い霧に包まれたように重く、過去の記憶の一切がすっぽりと抜け落ちている。',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（……起きて。お願い、目を覚まして……）',
      },
      {
        speaker: 'narrator',
        text: '不意に、脳内に直接語りかけてくるような、透き通った少女の声が響いた。\n視線をさまよわせると、暗闇の中に微かな光の粒が蛍のように舞っている。',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（ああ、よかった……！ あなたの意識が戻ったのね。）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（私は……この絶望の檻に縛られた、ただの思念体。\nここは『還らずの孤島』に築かれた大監獄。恐ろしい魔物たちが看守として支配する、死と忘却の底よ……）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（でも、あなただけはここから逃がさなければならない。\n……しーっ。気を引いて。同室の囚人たちが、何かを決行しようとしているみたい）',
      },
      {
        speaker: 'narrator',
        text: '光がスッと消え去ると同時に、牢獄の薄明かりの中に二人の男のシルエットが浮かび上がった。',
      },
      {
        speaker: 'narrator',
        text: '一人は落ち着きのない小柄な若者。怯えたように周囲をキョロキョロと見回している。\nもう一人は、不気味な鉄仮面を被り、壁際にどっしりと佇む巨漢だ。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'おっ、あんたもようやくお目覚めか。ずいぶんとうなされてたぜ。\n俺はアリーナでちょっとした『八百長』を断っただけで、こんな地獄に放り込まれた新入りだ。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'ったく、最悪だぜ。こんな薄暗い檻の中で一生を終えるなんてまっぴらだ。',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……無駄口を叩くな、新入り。看守が巡回に来るぞ。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'へいへい、分かってるよ。声がデカかったのは謝る。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'で、あんたはどうする？ ここで干からびるつもりはないだろ？\nこの鉄面のおっさんが、何ヶ月もかけて壁の脆い部分を削ってたらしいんだ。今から脱獄する！',
      },
      {
        speaker: 'narrator',
        text: '若者が興奮した様子で鉄面の男を指差す。\n鉄面の男は何も言わず、ただ静かに脚に括り付けられた巨大な鉄球に触れていた。',
      },
      {
        choices: [
          {
            text: '自分の名前すら思い出せない……',
            next: [
              {
                speaker: 'enemy',
                charData: ROOKIE,
                text: 'マジかよ、記憶喪失ってやつか！？\nまあいい、どうせなら人数が多い方が囮にもなるしな！ ついてきな！',
              },
            ],
          },
          {
            text: '（首を横に振り、記憶がないことを伝える）',
            next: [
              {
                speaker: 'enemy',
                charData: BREAKER,
                text: '……記憶喪失か。だが、身体は動くようだな。\nここで死にたくなければ、俺たちの後ろについてこい。',
              },
            ],
          },
        ],
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……下がるんだな。この鉄球ごと、壁を粉砕する。',
      },
      {
        speaker: 'narrator',
        text: '鉄面の男が、脚に繋がれた重厚な鎖を掴み、巨大な鉄球を頭上で大きく振り回し始める。\n風を切る凄まじい音と共に、鉄球が壁に向かって投げ放たれた。',
      },
      { speaker: 'enemy', charData: BREAKER, text: '……フンッ！！' },
      { speaker: 'narrator', text: 'ドゴォォォンッ！！' },
      {
        speaker: 'narrator',
        text: '凄まじい轟音と共に、堅牢なはずの石壁が粉々に砕け散る。\n土煙が晴れると、そこには外へと続く暗く長い通路が口を開けていた。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'ハハッ！本当にやりやがった！すげえ威力じゃねえか！',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'さあ、看守が来る前にここを抜け出すぞ！ 出口まで一気に走るんだ！',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（気をつけて……！この振動で、見張りの『死者たち』が目を覚ましてしまったわ！）',
      },
    ],
    next: '1-1',
  },
  '1-1': {
    enemyConfig: {
      id: 'campaign_skeleton',
      name: '白骨化した囚人',
      color: '#64748b',
      image: 'assets/cards/card_skeleton.jpg',
      leaderSkill: null,
    },
    aiLevel: 1,
    dialogueQueue: [
      {
        speaker: 'narrator',
        text: '崩れた壁の先、埃が舞う暗い通路を駆け抜ける。\nだが、その奥から、カチャカチャと骨が触れ合う不気味な音が響いてきた。',
      },
      {
        speaker: 'enemy',
        charId: 'campaign_skeleton',
        text: 'カタ……カタタタ……！',
      },
      {
        speaker: 'narrator',
        text: '薄暗い影の中から、白骨化した戦士たちが次々と姿を現す。\n彼らの空洞の眼窩には、怪しい青い光が宿っていた。',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……過去に脱獄に失敗し、見せしめにされた囚人たちの成れの果てか。\n死してなお看守の操り人形として働かされるとは、悪趣味なことだ。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'うわっ、冗談きついぜ！生きた人間より数が多いじゃないか！\nどうすんだよこれ！？ 囲まれたら骨までしゃぶられちまう！',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'おいあんた、丸腰でどうする気だ！？ 武器なんか持ってないだろ！？',
      },
      {
        speaker: 'narrator',
        text: 'ひるむ新入りを庇うように一歩前へ出たあなたは、無意識のうちに古い『魔導書』を開いていた。',
      },
      {
        speaker: 'narrator',
        text: '記憶がなくても、身体が戦い方を覚えている。\nページから引き抜いたカードがまばゆい光を放ち、実体を持った戦士へと姿を変えた。',
      },
      {
        speaker: 'narrator',
        text: '魔力の奔流が通路を吹き抜け、空気そのものが震動する。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'うおっ！？ なんだ今の光！？',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'カードから魔物や人が出てきたぞ！ あんた、まさか伝説の『召喚士』なのか！？',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……ほう。おとぎ話の存在だと思っていたがな。',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '記憶がなくても、召喚の術は失われていないようだな。頼もしい限りだ。',
      },
      {
        choices: [
          {
            text: '正面は引き受ける',
            next: [
              {
                speaker: 'enemy',
                charData: BREAKER,
                text: '……いい目だ。迷いがない。俺たちは左右の通路を塞ぐ、正面の敵は召喚で突破してくれ。',
              },
            ],
          },
          {
            text: '（無言で召喚獣をけしかける）',
            next: [
              {
                speaker: 'enemy',
                charData: ROOKIE,
                text: 'お、おう！ マジで助かるぜ！ 俺も後方から援護する！',
              },
            ],
          },
        ],
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（その魔導書……やはりあなたは……！）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（お願い、あなたの持つ召喚の力で、この死者たちを退けて！）',
      },
    ],
    next: '1-2',
  },
};
