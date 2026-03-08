/**
 * Mini Card Battle - Card Master Data
 */
const CARD_MASTER = [
    { id: 'golem', name: '旧型タイタン', power: 5, skill: 'none', rarity: 1, flavor: '古代文明の造兵兵器。旧式ながらもその重厚な装甲は今なお健在である。' },
    { id: 'cleric', name: '見習い修道女', power: 4, skill: 'heal', skillValue: 3, rarity: 1, flavor: '救済を志し修業に励む乙女。未熟ながらもその祈りは傷ついた心を癒やす。' },
    { id: 'diviner', name: '星詠みの占術士', power: 4, skill: 'draw', rarity: 1, flavor: '天球の運行を読み解き、運命の糸を紡ぎ直す導き手。' },
    { id: 'clone', name: '鏡の戦士', power: 2, skill: 'clone', skillValue: 1, rarity: 1, flavor: '妖精の鏡から這い出した実体のない騎士。本体と寸分違わぬ動きで幻惑する。' },
    { id: 'commander', name: '前線の司令官', power: 3, skill: 'support', skillValue: 2, rarity: 2, flavor: '最前線で兵を鼓舞し続ける老将。彼の掲げる軍旗は兵士たちの士気を極限まで高める。' },
    { id: 'sniper', name: '王国レンジャー兵', power: 2, skill: 'snipe', skillValue: 4, rarity: 1, flavor: '王国の辺境を守備する精鋭部隊。隠密からの精密な狙撃で敵の要人を射抜く。' },
    { id: 'mage', name: '未熟な魔導士', power: 2, skill: 'spread', skillValue: 2, rarity: 2, flavor: '魔導アカデミーの門を叩いたばかりの若者。制御しきれない魔力が周囲に拡散する。' },
    { id: 'cheetah', name: '稲妻の猟豹', power: 2, skill: 'quick', rarity: 2, flavor: '稲妻を纏って戦場を駆ける最速の野獣。その爪が空気を切り裂く。' },
    { id: 'wall', name: '城壁', power: 10, skill: 'defender', rarity: 2, flavor: '幾多の戦火を耐え抜いた鉄壁の防塁。王国の平和を守り続ける沈黙の守護者。' },
    { id: 'copy', name: 'ホムンクルスの実験体', power: 1, skill: 'copy', rarity: 3, flavor: '錬金術の過程で生み出された不安定な生命。周囲の情報を読み取り、その姿を不完全に模倣する。' },
    { id: 'scorpion', name: '黒サソリ', power: 1, skill: 'deadly', rarity: 1, flavor: '夜の砂漠に潜む漆黒の巨蠍。その尾から放たれる猛毒は対象を一瞬で絶命させる。' },
    { id: 'spider', name: 'スパイダー', power: 3, skill: 'bind', skillValue: 1, rarity: 1, flavor: '暗闇に潜み、粘着質の糸を紡ぐ毒蜘蛛。獲物の自由を奪い、死の抱擁へと誘う。' }
    { id: 'wolf', name: '真夜中の狩人', power: 2, skill: 'lone_wolf', skillValue: 3, rarity: 3, flavor: '月の光を浴びて強靭な力を得る孤高の戦士。群れを嫌い、独りで獲物を追い詰める。' },
    { id: 'shade', name: '墓の亡霊', power: 4, skill: 'soul_bind', skillValue: 2, rarity: 2, flavor: '古い墓地に漂う無念の霧。生者の温もりを嫌い、その魂を冷たい死の淵へと引き摺り込む。' },
    { id: 'tortoise', name: '鉄亀', power: 4, skill: 'sturdy', rarity: 2, flavor: '鉱石を食べて成長し、鋼鉄の如き硬度を得た霊亀。物理的な衝撃をほぼ無効化する。' },
    { id: 'octopus', name: '深海の魔物', power: 4, skill: 'split', skillValue: 1, rarity: 3, flavor: '深海に潜む異形の魔物。全身が筋肉の塊で、足を失ってもすぐに生えてくる。' },
    { id: 'berserker', name: '狂戦士', power: 7, skill: 'berserk', skillValue: 2, rarity: 2, flavor: '破壊の衝動に魂を売った禁忌の戦士。痛みすら悦びとして斧を振り回す。' },
    { id: 'daemon', name: '魔界の尖兵', power: 6, skill: 'sacrifice', skillValue: 2, rarity: 3, flavor: '強固な力と引き換えに契約者の魂を喰らう悪魔の兵士。その渇望は主ですら例外ではない。' },
    // トークンカード
    { id: 'token_soldier', name: '騎士', power: 1, skill: 'none', isToken: true, rarity: 1, flavor: 'セレスティアの号令で召喚された騎士。' },
    { id: 'token_ignis', name: 'イグニス', power: 7, skill: 'none', isToken: true, rarity: 1, flavor: '降臨した竜族の姫。' },
    { id: 'token_satan', name: '魔王の化身', power: 10, skill: 'none', isToken: true, rarity: 1, flavor: '魔王サタンの強大な化身。' },
    { id: 'token_clone', name: '分身', power: 1, skill: 'none', isToken: true, rarity: 1, flavor: '本体から生み出された分身。' },
    { id: 'legs', name: '蛸足', power: 1, skill: 'none', isToken: true, rarity: 1, flavor: '切り離されてもなお蠢き続ける蛸の足。' },
];
