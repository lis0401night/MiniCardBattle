/**
 * Mini Card Battle - Skill Definitions
 */
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
    clone: { name: '分身', icon: '👥', desc: '空いているレーンに、自身と同じパワーの分身を生成する。' },
    lone_wolf: { name: '単騎', icon: '🐺', desc: '場に出た時、自分の空きレーンの数×3だけパワーを上げる。' },
    soul_bind: { name: '魂縛', icon: '⛓️', desc: '戦闘で敵を破壊した時、パワーを+2する。' },
    sturdy: { name: '頑丈', icon: '🪨', desc: '戦闘で受けるダメージを半減する（端数切り捨て）。' },

    tokenclone: { name: '分身', icon: '👥', desc: '本体から生み出された分身。' },
    token_knight: { name: '騎士', icon: '⚔️', desc: 'セレスティアの号令で召喚された騎士。' },
    token_ignis: { name: 'イグニス', icon: '🔥', desc: '降臨した竜族の姫。' },
    token_satan: { name: '魔王の化身', icon: '💀', desc: '魔王サタンの強大な化身。' }
};
