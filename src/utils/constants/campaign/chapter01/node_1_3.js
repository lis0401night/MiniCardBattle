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

export const NODE_1_3 = {
  '1-3': {
    enemyConfig: {
      id: 'campaign_warden',
      name: '大監獄長',
      color: '#dc2626',
      image: 'assets/cards/card_warden.jpg',
      leaderSkill: null,
    },
    aiLevel: 1,
    dialogueQueue: [
      {
        speaker: 'narrator',
        text: '幾多の危険と亡霊たちの嘆きを乗り越え、ついに出口となる巨大な鉄扉の前に辿り着いた。\nその扉の向こうには、待望の自由が待っているはずだ。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'やったぞ……！ ついにここまで来た！ \nあの扉さえ開ければ、こんなカビ臭い場所ともおさらばだ！',
      },
      {
        speaker: 'narrator',
        text: 'だが、その扉の前には、周囲の空気を歪ませるほどの圧倒的な威圧感を放つ、巨大な影が立ちはだかっていた。',
      },
      {
        speaker: 'narrator',
        text: '鋼鉄の鎧に身を包んだ、見上げるほどの巨漢。\n手にした巨大な戦斧からは、禍々しい血の匂いが漂っている。',
      },
      {
        speaker: 'enemy',
        charId: 'campaign_warden',
        text: 'ふん……薄汚いドブネズミどもが。ここまで這い上がってくるとは、少々見くびっていたようだな。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'ヒィッ……！ ウソだろ……こいつがこの大監獄を支配する長か……！',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: '見上げるほどの巨体じゃねえか。いくらなんでも、まともにやり合って勝てるわけが……！',
      },
      {
        speaker: 'enemy',
        charId: 'campaign_warden',
        text: 'カカカッ！ 絶望の顔が見れて嬉しいぞ。\nお前のような弱虫、アリーナのゴミクズは見覚えがあるぞ。',
      },
      {
        speaker: 'enemy',
        charId: 'campaign_warden',
        text: 'そしてそっちの鉄面の男……貴様は、かつて王国に反逆し、すべてを失った愚か者だな。\nこんな辺境の監獄で野垂れ死ぬのがお似合いだ。',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……口を閉じろ。俺の過去がどうであれ、俺はただ、あの方の元へ帰るだけだ。',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '貴様のような外道の番犬に、ここで立ち止まっている暇はない。',
      },
      {
        speaker: 'enemy',
        charId: 'campaign_warden',
        text: 'ほざけ。そして、そこの名もなきゴミ。魔導書など持ち出して、魔術師の真似事か？',
      },
      {
        choices: [
          {
            text: 'ここをどいてもらおう',
            next: [
              {
                speaker: 'enemy',
                charId: 'campaign_warden',
                text: 'カカカッ！小癪な召喚士めが！己の矮小さも忘れたか！',
              },
            ],
          },
          {
            text: '（無言で魔導書を開く）',
            next: [
              {
                speaker: 'enemy',
                charId: 'campaign_warden',
                text: 'ほう……その抗う目、気に入らないな。真っ先にその両目を抉り出してやろう！',
              },
            ],
          },
        ],
      },
      {
        speaker: 'enemy',
        charId: 'campaign_warden',
        text: '貴様らには、自由など与えん。',
      },
      {
        speaker: 'enemy',
        charId: 'campaign_warden',
        text: 'ここで永遠の苦痛と絶望を味わいながら、私の退屈を紛らわす肉塊となるがいい！',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……気を引き締めろ。奴の力は強大だ。まともに打ち合えば一瞬で粉砕される。',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '俺たちが左右から死ぬ気で隙を作る。\nお前は冷静に召喚獣を展開し、奴の急所を突け！',
      },
      {
        choices: [
          {
            text: '総力戦だ、行くぞ！',
            next: [
              {
                speaker: 'enemy',
                charData: ROOKIE,
                text: 'ああ、やってやるぜ！ ここで死んでたまるかよ！',
              },
            ],
          },
          {
            text: '（静かにカードをドローする）',
            next: [
              {
                speaker: 'enemy',
                charData: BREAKER,
                text: '……頼んだぞ、名もなき召喚士。',
              },
            ],
          },
        ],
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（これが最後の壁……！あの男は今までの魔物とは格が違うわ！）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（でも、あなたなら勝てる。あなたの持つ全ての力をぶつけて、自由を掴み取って！！）',
      },
    ],
    next: '1-3_post',
  },
  '1-3_post': {
    appState: 'ending_dialogue',
    enemyConfig: () => LIGHT,
    dialogueQueue: [
      {
        speaker: 'narrator',
        text: '激戦の末、あなたの召喚した戦士たちの渾身の一撃が、ついに監獄長の分厚い装甲を打ち砕いた。',
      },
      {
        speaker: 'enemy',
        charId: 'campaign_warden',
        text: 'グオォォォォォォォッ！！ ば、馬鹿な……この私が、こんなウジ虫どもに……！！',
      },
      {
        speaker: 'narrator',
        text: '断末魔の叫びが監獄全体に木霊し、やがて静寂が戻る。',
      },
      {
        speaker: 'narrator',
        text: '巨大な戦斧が地に落ち、監獄長の巨体が膝を突く。\nその身体は内側から燃え上がるように光り、ゆっくりと灰となって消えていった。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'はぁ、はぁ……ウソだろ……本当にあの化け物を倒しちまったのか……！',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'やった……！ 俺たち、生き残ったんだな……！',
      },
      {
        speaker: 'narrator',
        text: '鉄面の男が無言で前へ進み、巨大な鉄扉の歯車に手をかける。\n軋むような重厚な音を立てて扉が開くと、眩いばかりの強烈な日差しが三人を包み込んだ。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'やった……！ついに外だ！本物の空だ！外の空気だ！！',
      },
      {
        speaker: 'narrator',
        text: 'だが、歓喜の声はすぐに途絶えた。\n扉の先に広がっていたのは、彼らが夢見た緑豊かな大地ではなかった。',
      },
      {
        speaker: 'narrator',
        text: '見渡す限りの荒涼とした赤茶色の砂漠が地平の果てまで続き、容赦ない熱風が吹き荒れている。\n乾いた砂の匂い。生命の息吹は一切感じられない、死の荒野だった。',
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……浮かれるな。ここは砂漠地帯『アッシュランド』だ。\n一歩間違えれば、監獄の中よりも無惨な死が待っている。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'そんな……せっかく脱出できたのに、これじゃあ地獄の釜の底から這い出ただけじゃねえか……！',
      },
      { speaker: 'enemy', charData: BREAKER, text: '俺は南へ向かう。' },
      {
        choices: [
          {
            text: 'これからどうするつもりだ？',
            next: [
              {
                speaker: 'enemy',
                charData: ROOKIE,
                text: '俺はなんとしても『セレスタリア王国』の首都に戻る！俺を罠にはめた連中に借りを返さなきゃならねえ！',
              },
            ],
          },
          {
            text: '一番近い町はどこだ？',
            next: [
              {
                speaker: 'enemy',
                charData: BREAKER,
                text: '……南に集落があるが、活火山帯を越える必要がある。今の装備では命の保証はないな。',
              },
            ],
          },
        ],
      },
      {
        speaker: 'enemy',
        charData: BREAKER,
        text: '……お前たちの戦いぶりは見事だったが、ここからは互いの道を行くべきだ。\n忠告しておく。この世界では、簡単に人を信じるな。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: '冷たいおっさんだな！……まあいい。\nあんたは北東にある未来都市『セクター7』を目指すといい。あそこなら、記憶の手がかりも見つかるかもしれないぜ。',
      },
      {
        speaker: 'enemy',
        charData: ROOKIE,
        text: 'じゃあな、召喚士のあんた！ 助かったぜ！',
      },
      {
        speaker: 'narrator',
        text: 'それぞれの目的のため、二人は容赦なく吹き付ける砂嵐の中へと、振り返ることなく姿を消していった。\n残されたあなたは、静まり返った過酷な大地に一人、立ち尽くしている。',
      },
      { speaker: 'enemy', charData: LIGHT, text: '（……行ってしまったわね）' },
      {
        speaker: 'narrator',
        text: '頭の中に、再びあの透き通った少女の声が響く。',
      },
      {
        choices: [
          {
            text: '君は一緒に来ないのか？',
            next: [
              {
                speaker: 'enemy',
                charData: LIGHT,
                text: '（私はこの監獄の呪縛霊。魂がこの場所に縫い付けられているから、一緒に行くことはできないの……）',
              },
            ],
          },
          {
            text: '（無言で遠くの砂嵐を見つめる）',
            next: [
              {
                speaker: 'enemy',
                charData: LIGHT,
                text: '（不安に思わないで。私はここから、ずっとあなたを見守っているから……）',
              },
            ],
          },
        ],
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（いい？ この世界は5年前の『大厄災』によっていくつもの時空の歪みが生じ、過去と未来が入り混じる混沌の世界になってしまったの）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（あの若者が言っていた『セクター7』も、時空の歪みから突如として現れた超科学都市。\n今は大国『セレスタリア王国』と一触即発の冷戦状態にあるそうよ）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（あなたの失われた記憶も、きっとこの世界の謎と深く結びついているはず……）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（さあ、行って……。決して振り返らないで。）',
      },
      {
        speaker: 'enemy',
        charData: LIGHT,
        text: '（あなたの過酷な旅路に、いつか必ず『光』があらんことを……！）',
      },
      {
        speaker: 'narrator',
        text: '少女の声はふっつりと途絶え、耳をつんざくような風の音だけが残った。',
      },
      {
        speaker: 'narrator',
        text: 'あなたは魔導書を強く握りしめ、失われた記憶を求めて、見知らぬ荒野へと力強い第一歩を踏み出した。',
      },
      { speaker: 'narrator', text: '【 チャプター1 - 監獄からの脱出 完 】' },
    ],
    next: null,
  },
};
