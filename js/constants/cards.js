/**
 * Mini Card Battle - Card Master Data
 */
const CARD_MASTER = [
    { id: 'golem', name: '旧型タイタン', power: 6, skill: 'none', flavor: '古代文明の造兵兵器。旧式ながらもその重厚な装甲は今なお健在である。' },
    { id: 'scorpion', name: 'ブラック・スコーピオン', power: 2, skill: 'deadly', flavor: '夜の砂漠に潜む漆黒の巨蠍。その尾から放たれる猛毒は対象を一瞬で絶命させる。' },
    { id: 'diviner', name: '星詠みの占術士', power: 5, skill: 'draw', flavor: '天球の運行を読み解き、運命の糸を紡ぎ直す導き手。' },
    { id: 'cheetah', name: '稲妻の猟豹', power: 2, skill: 'quick', flavor: '稲妻を纏って戦場を駆ける最速の野獣。その爪が空気を切り裂く。' },
    { id: 'cleric', name: '見習い修道女', power: 4, skill: 'heal', skillValue: 3, flavor: '救済を志し修業に励む乙女。未熟ながらもその祈りは傷ついた心を癒やす。' },
    { id: 'sniper', name: '王国レンジャー兵', power: 2, skill: 'snipe', skillValue: 4, flavor: '王国の辺境を守備する精鋭部隊。隠密からの精密な狙撃で敵の要人を射抜く。' },
    { id: 'mage', name: '未熟な魔導士', power: 2, skill: 'spread', skillValue: 2, flavor: '魔導アカデミーの門を叩いたばかりの若者。制御しきれない魔力が周囲に拡散する。' },
    { id: 'copy', name: 'ホムンクルスの実験体', power: 1, skill: 'copy', flavor: '錬金術の過程で生み出された不安定な生命。周囲の情報を読み取り、その姿を不完全に模倣する。' },
    { id: 'commander', name: '前線の司令官', power: 3, skill: 'support', skillValue: 2, flavor: '最前線で兵を鼓舞し続ける老将。彼の掲げる軍旗は兵士たちの士気を極限まで高める。' },
    { id: 'wall', name: '城壁', power: 10, skill: 'defender', flavor: '幾多の戦火を耐え抜いた鉄壁の防塁。王国の平和を守り続ける沈黙の守護者。' },
    { id: 'wolf', name: '真夜中の狩人', power: 3, skill: 'lone_wolf', skillValue: 3, flavor: '月の光を浴びて強靭な力を得る孤高の戦士。群れを嫌い、独りで獲物を追い詰める。' },
    { id: 'shade', name: '墓の亡霊', power: 4, skill: 'soul_bind', skillValue: 2, flavor: '古い墓地に漂う無念の霧。生者の温もりを嫌い、その魂を冷たい死の淵へと引き摺り込む。' },
    { id: 'tortoise', name: '鉄亀', power: 4, skill: 'sturdy', flavor: '鉱石を食べて成長し、鋼鉄の如き硬度を得た霊亀。物理的な衝撃をほぼ無効化する。' },
    { id: 'clone', name: '鏡の戦士', power: 2, skill: 'clone', skillValue: 1, flavor: '妖精の鏡から這い出した実体のない騎士。本体と寸分違わぬ動きで幻惑する。' },
    { id: 'berserker', name: '狂戦士', power: 8, skill: 'berserk', skillValue: 2, flavor: '破壊の衝動に魂を売った禁忌の戦士。痛みすら悦びとして斧を振り回す。' },
    { id: 'octopus', name: '深海の悪魔', power: 4, skill: 'split', skillValue: 1, flavor: '暗黒の海溝に棲む巨大な魔物。切り離された触手が独自に獲物を求めて蠢き出す。' },
    // トークンカード
    { id: 'token_soldier', name: '騎士', power: 1, skill: 'none', isToken: true, flavor: 'セレスティアの号令で召喚された騎士。' },
    { id: 'token_ignis', name: 'イグニス', power: 7, skill: 'none', isToken: true, flavor: '降臨した竜族の姫。' },
    { id: 'token_satan', name: '魔王の化身', power: 10, skill: 'none', isToken: true, flavor: '魔王サタンの強大な化身。' },
    { id: 'token_clone', name: '分身', power: 1, skill: 'none', isToken: true, flavor: '本体から生み出された分身。' },
    { id: 'legs', name: '蛸足', power: 1, skill: 'none', isToken: true, flavor: '切り離されてもなお蠢き続ける蛸の足。' }
];
