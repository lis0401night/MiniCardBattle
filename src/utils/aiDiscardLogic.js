import { shuffleArray } from './gameUtils.js';

/**
 * 対象のカードが「生贄(takeover)」または「頂点(apex)」スキルを保持しているか判定します。
 * @param {Object} card - 判定対象のカードオブジェクト
 * @returns {boolean} 生贄または頂点スキルを所持していれば true
 */
function isTakeoverOrApex(card) {
  if (!card || !card.skills) return false;
  return card.skills.some((s) => s.id === 'takeover' || s.id === 'apex');
}

/**
 * AIが手札からカードを捨てる（またはコストとして選ぶ）際の共通優先決定ロジック
 *
 * 【選定基準】
 * 1. 「虚空（token_void）」がある場合は最優先で選ぶ
 * 2. 「〇枚まで（任意: isExact=false）」の場合：
 *    - 虚空を優先的に破棄し、残る手札が「生贄」「頂点」のみで召喚不能事故が発生する場合に限り、生贄・頂点を追加破棄
 *    - それ以外は有用な通常カードを無駄に捨てずに1枚〜必要最小限の枚数で決定（それ以上捨てない）
 * 3. 「〇枚（強制: isExact=true）」の場合：
 *    - 指定枚数に達するまで「生贄/頂点」＞「通常カード」の優先順位で追加選定して必ずcount枚を確保する
 *
 * @param {Array} hand - 現在の手札配列
 * @param {number} count - 破棄する最大枚数（または指定枚数）
 * @param {boolean} [isExact=false] - true: 指定枚数をぴったり強制で破棄 / false: 最大count枚まで任意（必要分のみ破棄）
 * @returns {Array<number>} 選ばれたカードの手札内インデックス配列
 */
export function getAIDiscardIndices(hand, count, isExact = false) {
  if (!hand || hand.length === 0 || count <= 0) return [];

  // インデックスを保持した候補配列を作成
  const candidates = hand
    .map((c, i) => ({ card: c, idx: i }))
    .filter((x) => x.card !== null);

  // 1. 属性別に分類
  const voidCards = candidates.filter(
    (x) => x.card.id === 'token_void' || x.card.baseId === 'token_void'
  );
  const takeoverApexCards = candidates.filter(
    (x) => !voidCards.includes(x) && isTakeoverOrApex(x.card)
  );
  const normalCards = candidates.filter(
    (x) => !voidCards.includes(x) && !takeoverApexCards.includes(x)
  );

  const selected = [];

  // 【ステップ1】「虚空」を最優先で破棄対象に選定
  for (const item of shuffleArray(voidCards)) {
    if (selected.length < count) {
      selected.push(item);
    }
  }

  // 【ステップ2】「〇枚まで（任意: isExact=false）」の場合の必要最小限判定
  if (!isExact) {
    // 虚空を破棄した後、残りの手札が「生贄」「頂点」のみで事故が起きるか確認
    const selectedIndicesSet = new Set(selected.map((x) => x.idx));
    const remainingCandidates = candidates.filter(
      (x) => !selectedIndicesSet.has(x.idx)
    );

    const remainingTakeoverApex = remainingCandidates.filter((x) =>
      isTakeoverOrApex(x.card)
    );
    const remainingNormal = remainingCandidates.filter(
      (x) => !isTakeoverOrApex(x.card)
    );

    // 残る手札が「生贄/頂点」のみで、手札事故（通常召喚できるカードが手札に無い状態）の場合
    if (
      remainingCandidates.length > 0 &&
      remainingNormal.length === 0 &&
      remainingTakeoverApex.length > 0
    ) {
      // プレイ可能な通常カードが残るまで、またはcount上限に達するまで「生贄/頂点」を追加破棄
      for (const item of shuffleArray(takeoverApexCards)) {
        if (selected.length < count && !selected.includes(item)) {
          selected.push(item);
          break; // 1枚破棄して入れ替えることで状況改善を図り打ち切る
        }
      }
    }

    // 「〇枚まで」の場合はここで確定（有用な通常カードは余分に捨てず打ち切り）
    return selected.map((x) => x.idx);
  }

  // 【ステップ3】「〇枚（強制: isExact=true）」の場合のみ、規定数(count)に達するまで追加破棄
  // 3-A: 手札事故が起きやすい「生贄/頂点」を優先消化
  for (const item of shuffleArray(takeoverApexCards)) {
    if (selected.length < count && !selected.includes(item)) {
      selected.push(item);
    }
  }
  // 3-B: それでも規定枚数に足りなければ通常カードを選定
  for (const item of shuffleArray(normalCards)) {
    if (selected.length < count && !selected.includes(item)) {
      selected.push(item);
    }
  }

  return selected.map((x) => x.idx);
}
