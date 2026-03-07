// ==========================================
// キャラクターデータ設定
// ==========================================
const CHARACTERS = {
    android: {
        id: 'android', name: '機動戦姫 アイギス', 
        desc: '最新鋭のAIを搭載した戦闘用アンドロイド。感情を持たないが、マスターへの忠誠心は絶対的。',
        filter: 'hue-rotate(180deg) saturate(1.5) contrast(1.2)', cardType: 'set1', cardBg: 'bg1',
        image: 'assets/char_android.png', imageLose: 'assets/char_android_lose.png', icon: 'assets/icon_android.png', imageEnding: 'assets/char_android_ending.png', color: '#38bdf8',
        leaderSkill: { name: '殲滅光線', desc: '(SP:4) 敵の場のすべてのカードに4ダメージを与える。', cost: 4, action: 'annihilation' },
        dialogue: {
            intro: { dragon: '対象の熱源反応を確認。冷却プロトコルを起動します。', knight: '対象の装甲、旧式と推測。物理演算を開始します。', cthulhu: '非論理的生命体を検出。排除プログラムを実行します。', satan: '分類不能な超高エネルギー体を確認。リミッターを解除します。', default: 'マスター、バトルプロトコルを開始します。' },
            win: { dragon: '熱源の鎮火を確認。', knight: '旧式装甲の突破完了。', cthulhu: '非論理的エラーを排除。', satan: '対象の完全消滅を確認。私の、勝ちです。', default: '対象の沈黙を確認。ミッションコンプリート。' },
            lose: { dragon: '装甲溶解……システムダウン……', knight: '計算外の攻撃力……機能停止します……', cthulhu: '精神侵染……マスター、逃げ……て……', satan: 'マスター……ごめんなさい……', default: '致命的なエラー……再起動します……' },
            damage: ['シールド損傷！', 'ダメージ軽微。', 'エラー発生！', '出力低下。'],
            skill: 'リミッター解除、対象を殲滅します！',
            ending: [
                { speaker: 'player', text: '全対象の排除を完了しました。マスター、私の性能はいかがでしたか？' },
                { speaker: 'player', text: 'これからも、あなたの剣として、盾として。ずっとおそばにいます。' }
            ]
        }
    },
    dragon: {
        id: 'dragon', name: '焔竜姫 イグニス', 
        desc: '火山地帯を縄張りとする竜族の姫。圧倒的な炎の力とワガママな性格で敵を焼き尽くす。',
        filter: 'sepia(0.8) hue-rotate(-50deg) saturate(2) contrast(1.2)', cardType: 'set2', cardBg: 'bg2',
        image: 'assets/char_dragon.png', imageLose: 'assets/char_dragon_lose.png', icon: 'assets/icon_dragon.png', imageEnding: 'assets/char_dragon_ending.png', color: '#fb7185',
        leaderSkill: { name: '竜王の降臨', desc: '(SP:4) 空いているレーンに「イグニス(P:7)」を1体召喚する。', cost: 4, action: 'dragon_summon' },
        dialogue: {
            intro: { android: 'なんだか鉄臭いヤツ！ 溶かしてやる！', knight: 'また騎士？ 私の巣を荒らしたヤツの仲間ね！', cthulhu: 'うわ、気持ち悪いタコ！ 焼きダコにしてやる！', satan: '魔王だかなんだか知らないけど、私の炎のほうが強いんだから！', default: 'ガウッ！ 私の炎で丸焦げにしてやるんだから！' },
            win: { android: 'ただのガラクタになっちゃったわね！', knight: 'ふんっ、ノロマね！', cthulhu: 'うげぇ、美味しそうじゃない……。', satan: 'へへーん！ ドラゴンが一番強いに決まってるでしょ！', default: 'ふんっ、他愛ないわね！' },
            lose: { android: '冷たいのやだー！', knight: '痛いっ！ 鱗が……きゅ〜。', cthulhu: '触手でベタベタにしないでぇ……！', satan: 'うそ……私の炎が、負けるなんて……. default: 'きゅ〜……お腹が空いただけなんだからねっ！' },
            damage: ['あだっ！', '熱くないもん！', 'やりやがったわね！', '痛いじゃない！'],
            skill: '私が直接焼き尽くしてあげるわ！！',
            ending: [
                { speaker: 'player', text: 'ぜーんぶやっつけてやったわ！ 私が一番強いって証明できたわね！' },
                { speaker: 'player', text: 'あんた、マスターにしてはなかなかやるじゃない。これからも背中は任せてあげる！' }
            ]
        }
    },
    knight: {
        id: 'knight', name: '聖騎士 セレスティア', 
        desc: '王国騎士団を率いる誇り高き騎士。聖なる加護と鉄壁の防御で仲間を守り抜く。',
        filter: 'sepia(0.6) saturate(1.5) contrast(1.1)', cardType: 'set5', cardBg: 'bg1',
        image: 'assets/char_knight.png', imageLose: 'assets/char_knight_lose.png', icon: 'assets/icon_knight.png', imageEnding: 'assets/char_knight_ending.png', color: '#facc15',
        leaderSkill: { name: '聖なる進軍', desc: '(SP:5) 空きレーンに「騎士(P:1)」を最大2体召喚し、自分の場のすべてのカードのパワーを+3する。', cost: 5, action: 'holy_march' },
        dialogue: {
            intro: { android: '魔導人形か……油断はしない！', dragon: '竜の落とし子よ、容赦はしないぞ！', cthulhu: '邪神の眷属め！ 聖剣で浄化してくれる！', satan: '魔王……！ ここで貴様を討ち、世界に平和を！', default: '我が剣に誓って、正々堂々と勝負しよう！' },
            win: { android: '見事な剣筋だった。', dragon: '少しは懲りたか。', cthulhu: '光の前に邪悪は滅びるのだ！', satan: 'ついに、悲願は達成された！ 我が剣の勝利だ！', default: '素晴らしい勝負だった。君の戦術も見事だ。' },
            lose: { android: '動きが読めない……。', dragon: '竜の力、圧倒的すぎる……。', cthulhu: '正気が……奪われる……！', satan: '世界が……闇に……飲まれる……。', default: 'くっ……私の采配ミスだ。敗北を認めよう。' },
            damage: ['くっ！', 'まだだ！', '浅い！', 'なんの！'],
            skill: '全軍突撃！ 光よ、我らに勝利の加護を！！',
            ending: [
                { speaker: 'player', text: 'すべての戦いを終えたか。私の剣も、少しは君の役に立てたかな？' },
                { speaker: 'player', text: '君という名将に出会えたこと、誇りに思う。これからも共に歩ませてくれ！' }
            ]
        }
    },
    cthulhu: {
        id: 'cthulhu', name: '深淵の巫女 ナイア', 
        desc: '深き海より来たりし名状しがたき存在の眷属。相手の精神を削り、狂気へと誘う。',
        filter: 'sepia(1) hue-rotate(240deg) saturate(2) contrast(1.5) brightness(0.8)', cardType: 'set2', cardBg: 'bg3',
        image: 'assets/char_cthulhu.png', imageLose: 'assets/char_cthulhu_lose.png', icon: 'assets/icon_cthulhu.png', imageEnding: 'assets/char_cthulhu_ending.png', color: '#c084fc',
        leaderSkill: { name: '深淵の儀式', desc: '(SP:4) 手札のパワーが低いカードを最大2枚捨てて同数引き、手札すべてのパワーを+2する。', cost: 4, action: 'abyss_ritual' },
        dialogue: {
            intro: { android: '感情のないお人形……つまらないわね。', dragon: '爬虫類は嫌いですの。', knight: '無駄な信念ですねぇ……。', satan: 'あら、魔界の王様？ 私の深淵とどちらが深いか、試してみます？', default: 'フフフ……深淵の理に触れる覚悟はありまして？' },
            win: { android: 'あら、壊れちゃいました。', dragon: '沈みなさい、暗い海の底へ。', knight: '狂気に歪むその顔、素敵ですわ。', satan: 'フフフ、魔王の絶望する顔……最高の極上ですわ。', default: 'アハハハ！ 貴方のSAN値、もう空っぽですわよ？' },
            lose: { android: '理性が……論理が……私を浸食する……！', dragon: 'あつい、私の海が蒸発してしまう……！', knight: 'その眩しい光、目障りですわ……！', satan: '深淵が……塗り潰されていく……。', default: 'いあ！ いあ！ ……まさか、退けられるとは……' },
            damage: ['あぁんっ！', '痛いですわ！', '無礼な！', 'フフフ…'],
            skill: 'フフフ…深淵の力で、すべてを狂わせてあげますわ。',
            ending: [
                { speaker: 'player', text: 'あらあら、みーんな狂ってしまいましたわ。貴方のおかげですわね。' },
                { speaker: 'player', text: '私を満たしてくれたご褒美に、貴方だけは最後まで正気を残して差し上げますわ。フフフ……。' }
            ]
        }
    },
    satan: {
        id: 'satan', name: '魔王 サタン', 
        desc: '魔界を統べる絶対的な恐怖の象徴。すべてを無に帰す圧倒的な力を持つ。',
        filter: 'contrast(1.5) brightness(0.7) sepia(1) hue-rotate(-50deg) saturate(3)', cardType: 'set3', cardBg: 'bg3',
        image: 'assets/char_satan.png', imageLose: 'assets/char_satan_lose.png', icon: 'assets/icon_satan.png', color: '#dc2626',
        leaderSkill: { name: '魔王の化身', desc: '(SP:6) 空いているレーンに「サタンの化身(P:10)」を1体召喚する。', cost: 6, action: 'satan_avatar' },
        dialogue: {
            intro: { default: '我は魔王サタン……絶望の淵へ沈むがよい。' },
            win: { default: 'フハハハ！ 脆弱な者どもよ、永遠の闇に惑え！' },
            lose: { default: 'バカな……この我が……貴様らごときに……グアアアッ！' },
            damage: ['ヌゥッ！', '小賢しい！', '効かぬわ！', 'おのれ…！'],
            skill: '絶望を教えてやろう。出でよ、我が化身！！',
            ending: []
        }
    }
};

// ==========================================
// スキルの定義と説明
// ==========================================
const SKILLS = {
    none: { name: 'なし', icon: '', desc: '特殊な能力を持たない。' },
    quick: { name: '速攻', icon: '⚡', desc: '場に出たターンにすぐ攻撃する。' },
    deadly: { name: '必殺', icon: '☠️', desc: '戦闘した相手を確実に破壊する。' },
    draw: { name: '入替', icon: '🃏', desc: '手札の最もパワーが低いカードを全て捨て、同数引く。' },
    heal: { name: '回復', icon: '💚', desc: 'リーダーのHPを3回復する。' },
    snipe: { name: '狙撃', icon: '🎯', desc: '相手の場で最大パワーのカード1枚に4ダメージ。' },
    spread: { name: '拡散', icon: '☄️', desc: '相手の場のすべてのカードに2ダメージ。' },
    copy: { name: '複製', icon: '👯', desc: '自分の場の最大パワーのカードと同じパワーになる。' },
    support: { name: '援護', icon: '🛡️', desc: '自分の場の他のすべてのカードのパワーを+2する。' },
    defender: { name: '防御', icon: '🧱', desc: '【デメリット】敵カードやリーダーにダメージを与えられない。' },
    clone: { name: '分身', icon: '👥', desc: '空いているレーンに「分身(P:2)」を1体生成する。' },
    lone_wolf: { name: '単騎', icon: '🐺', desc: '場に出た時、自分の空きレーンの数×3だけパワーを上げる。' },
    soul_bind: { name: '魂縛', icon: '⛓️', desc: '戦闘で敵を破壊した時、パワーを+2する。' },
    sturdy: { name: '頑丈', icon: '🪨', desc: '戦闘で受けるダメージを半減する（端数切り捨て）。' },
    
    token_clone: { name: '分身', icon: '👥', desc: '本体から生み出された分身。' },
    token_knight: { name: '騎士', icon: '⚔️', desc: 'セレスティアの号令で召喚された騎士。' },
    token_ignis: { name: 'イグニス', icon: '🔥', desc: '降臨した竜族の姫。' },
    token_satan: { name: '魔王の化身', icon: '💀', desc: '魔王サタンの強大な化身。' }
};

// ==========================================
// 定数設定
// ==========================================
const MAX_HP = 20;

// ==========================================
// サウンド設定
// ==========================================
const SOUNDS = {
    bgmTitle: new Audio('assets/bgm_title.mp3'),
    bgmBattle: new Audio('assets/bgm_battle.mp3'),
    bgmEnding: new Audio('assets/bgm_ending.mp3'),
    bgmLastBattle: new Audio('assets/bgm_lastbattle.mp3'),
    seClick: new Audio('assets/se_click.mp3'),
    sePlace: new Audio('assets/se_place.mp3'),
    seAttack: new Audio('assets/se_attack.mp3'),
    seDamage: new Audio('assets/se_damage.mp3'),
    seSkill: new Audio('assets/se_skill.mp3'),
    seDestroy: new Audio('assets/se_destroy.mp3'),
    seContinue: new Audio('assets/se_skill.mp3'),
    seLegend: new Audio('assets/se_legend.mp3')
};
SOUNDS.bgmTitle.loop = true; SOUNDS.bgmBattle.loop = true; SOUNDS.bgmEnding.loop = true; SOUNDS.bgmLastBattle.loop = true;
Object.values(SOUNDS).forEach(audio => { audio.volume = 0.3; });
