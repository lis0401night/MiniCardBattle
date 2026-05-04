const LIGHT = { name: '光の少女', color: '#fcd34d', image: 'assets/cards/card_light.jpg' };
const ROOKIE = { name: '新入りの若者', color: '#60a5fa', image: 'assets/cards/card_fighter.jpg' };
const BREAKER = { name: '鉄面の男', color: '#94a3b8', image: 'assets/cards/card_prisoner.jpg' };

export const NODE_1_2 = {
    '1-2': {
        enemyConfig: { id: 'campaign_shade', name: "嘆きの亡霊", color: "#a855f7", image: "assets/cards/card_shade.jpg", leaderSkill: null },
        aiLevel: 1,
        dialogueQueue: [
            { speaker: 'narrator', text: "スケルトンの群れを退け、さらに上層へと続く長い螺旋階段を登り続ける。\n息を切らしながら進むにつれ、周囲の風景はさらに陰惨なものへと変わっていく。" },
            { speaker: 'narrator', text: "だが、ある階層に入った途端、周囲の空気が急激に冷え込んだ。\n吐く息は白く染まり、石壁にはびっしりと不気味な霜が降り始めている。" },
            { speaker: 'enemy', charData: ROOKIE, text: "ブルッ……なんだこれ、急に寒くなってきたぞ。極寒の地かよ。" },
            { speaker: 'enemy', charData: BREAKER, text: "……立ち止まれ。ただの冷気じゃない。空気が重すぎる。\n濃密な『怨念』が渦巻いている。何かが来るぞ。" },
            { speaker: 'enemy', charData: ROOKIE, text: "怨念って……オバケが出るってことか？ 冗談キツイぜ……" },
            { speaker: 'narrator', text: "新入りの言葉が終わる前に、冷たい霧の中から、半透明の歪な姿をした亡霊たちが無数に浮かび上がってきた。" },
            { speaker: 'narrator', text: "彼らは生前の服のぼろきれを纏い、宙を浮遊している。\nその虚ろな目は、生者に対する果てしない憎悪と苦痛に満ちていた。" },
            { speaker: 'enemy', charId: 'campaign_shade', text: "ヒュゥゥゥ……クルシイ……" },
            { speaker: 'enemy', charId: 'campaign_shade', text: "ダシテ……ココカラ……！ ダシテ……！" },
            { speaker: 'enemy', charData: ROOKIE, text: "ヒィッ！？ マジで出やがった！" },
            { speaker: 'enemy', charData: ROOKIE, text: "おいおい、まさかここが噂に聞く『嘆きの区画』か！？\nひどい拷問で死んだ連中の霊が、永遠に彷徨い続けてるって……！" },
            { speaker: 'enemy', charData: BREAKER, text: "……噂は本当だったようだな。だが、ただの怨念じゃない。" },
            { speaker: 'enemy', charData: BREAKER, text: "この監獄の魔力溜まりのせいで、あいつらは完全な実体を持っている。\n触れられれば、ただでは済まんぞ。" },
            { speaker: 'enemy', charData: ROOKIE, text: "実体があるってことは、殴れるってことか？" },
            { speaker: 'enemy', charData: BREAKER, text: "ああ。だが、数が多すぎる。下手に暴れれば囲まれて終わりだ。\n生気を吸い取られ、ミイラになるだけだぞ。" },
            { speaker: 'narrator', text: "徐々に距離を詰めてくる亡霊たち。\nあなたは静かに息を吸い込み、魔導書のページを開く。" },
            {
                choices: [
                    { text: "召喚獣で蹴散らす", next: [{ speaker: 'enemy', charData: BREAKER, text: "……頼む。お前の召喚獣が亡霊どもを牽制してくれれば、俺の拳で確実にとどめを刺せる。" }] },
                    { text: "（無言で再び魔導書を開く）", next: [{ speaker: 'enemy', charData: ROOKIE, text: "あんなのに囲まれたら凍え死ぬぞ！ あんたの召喚獣で、一気に道を切り開いてくれ！" }] }
                ]
            },
            { speaker: 'enemy', charData: LIGHT, text: "（彼らはもう、自分が死んだことすら理解していないの……。\n果てのない苦痛を味わい続けているだけ。）" },
            { speaker: 'enemy', charData: LIGHT, text: "（……なんて可哀想な魂たち。）" },
            { speaker: 'enemy', charData: LIGHT, text: "（お願い、あなたの力で彼らを深い眠りにつかせてあげて！）" }
        ],
        next: '1-3'
    }
};
