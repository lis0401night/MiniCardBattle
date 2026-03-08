/**
 * Mini Card Battle - Skill Definitions
 */
const SKILLS = {
    none: { name: '通常', icon: '', desc: (val) => '' },
    quick: { name: '速攻', icon: '⚡', desc: (val) => '場に出たターンの終わりに攻撃する。' },
    deadly: { name: '必殺', icon: '☠️', desc: (val) => '戦闘した相手を確実に破壊する。' },
    draw: { name: '入替', icon: '🃏', desc: (val) => '手札の最もパワーが低いカードを全て捨て、同数引く。' },
    heal: { name: '回復', icon: '💚', desc: (val) => `リーダーのHPを${val || 3}回復する。` },
    snipe: { name: '狙撃', icon: '🎯', desc: (val) => `相手の場で最大パワーのカード1枚に${val || 4}ダメージ。` },
    spread: { name: '拡散', icon: '☄️', desc: (val) => `相手の場のすべてのカードに${val || 2}ダメージ。` },
    copy: { name: '複製', icon: '👯', desc: (val) => '自分の場の隣のレーンのカードのパワーの合計を自身に+する。' },
    support: { name: '援護', icon: '🚩', desc: (val) => `自分の場の隣のレーンのカードのパワーを+${val || 2}する。` },
    defender: { name: '防御', icon: '🧱', desc: (val) => '【デメリット】敵カードやリーダーにダメージを与えられない。' },
    clone: { name: '分身', icon: '👥', desc: (val) => `空いているレーンに、自身と同じパワーの分身を${val || 1}体生成する。` },
    lone_wolf: { name: '単騎', icon: '🐺', desc: (val) => `場に出た時、自分の空きレーンの数×${val || 3}だけパワーを上げる。` },
    soul_bind: { name: '魂縛', icon: '⛓️', desc: (val) => `戦闘で敵を破壊した時、パワーを+${val || 2}する。` },
    sturdy: { name: '頑丈', icon: '🛡', desc: (val) => '戦闘で受けるダメージを半減する（端数切り捨て）。' },
    berserk: { name: '狂乱', icon: '💢', desc: (val) => `【デメリット】自分の場の隣のレーンのカードに${val}ダメージ。` },
    split: { name: '分裂', icon: '🐙', desc: (val) => `破壊された時、同じレーンにパワー${val}のトークンを出す。` }
};
