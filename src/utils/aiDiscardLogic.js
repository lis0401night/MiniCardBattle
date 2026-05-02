import { shuffleArray } from './gameUtils.js';

/**
 * AIが手札からカードを捨てる（またはコストとして選ぶ）際の共通ロジック
 * 
 * 【選定基準】
 * 1. 「虚空（token_void）」がある場合は優先して選ぶ
 * 2. それ以外はランダムに選ぶ
 * 
 * @param {Array} hand 現在の手札配列
 * @param {number} count 捨てる（選ぶ）枚数
 * @returns {Array} 選ばれたカードの手札内インデックス配列
 */
export function getAIDiscardIndices(hand, count) {
    if (!hand || hand.length === 0 || count <= 0) return [];

    let candidates = hand.map((c, i) => ({ card: c, idx: i })).filter(x => x.card !== null);
    
    // 1. 虚空 (token_void) を優先
    let voids = candidates.filter(x => x.card.id === 'token_void' || x.card.baseId === 'token_void');
    let nonVoids = candidates.filter(x => x.card.id !== 'token_void' && x.card.baseId !== 'token_void');
    
    // 2. それ以外はランダム
    nonVoids = shuffleArray(nonVoids);
    
    // 虚空を先にし、残りをランダムで埋める
    let sortedCandidates = [...voids, ...nonVoids];
    
    const selectedCount = Math.min(count, hand.length);
    const selected = sortedCandidates.slice(0, selectedCount);

    // インデックスの配列を返す
    return selected.map(x => x.idx);
}
