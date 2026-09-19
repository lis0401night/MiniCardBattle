/**
 * Mini Card Battle - Status Definitions
 *
 * カードの「能力（スキル）」から独立した「状態（ステータス / バフ・デバフ）」の定数定義ファイル。
 * 忘却・沈黙・リーダースキル等の能力消去効果によって解除されず、ターン経過や戦闘解決で管理されます。
 * ※本ファイルにはゲームロジックは含めず、純粋な定義・メタデータのみを記述します。
 */

/**
 * 状態（ステータス）の定義マスター
 * 各状態の名称、アイコン、説明文生成関数、対応するカードプロパティ名、UIバッジクラス等を定義します。
 */
export const STATUSES = {
  /**
   * 戦乙女の加護（加護状態）
   * 全てのダメージ（戦闘・スキル・リーダースキル）を無効化し、破壊（即死含む）を防ぐ神聖な防壁状態。
   */
  valkyria_guard: {
    id: 'valkyria_guard',
    name: '加護',
    icon: '🔆',
    type: 'buff',
    property: 'valkyriaGuard',
    turnsProperty: 'valkyriaGuardTurns',
    badgeClass: 'badge-valkyria-guard',
    /**
     * 加護の説明文を生成する
     * @param {number} [turns] - 残り持続ターン数（省略時はターン数なし）
     * @returns {string} 説明文
     */
    desc: (turns) =>
      turns
        ? `${turns}ターンの間、全てのダメージを受けず、破壊されない。`
        : '全てのダメージを受けず、破壊されない。',
  },

  /**
   * 無敵状態
   * 「潜伏」スキル等によって付与される、戦闘ダメージを完全に無効化する防御状態。
   */
  invincible: {
    id: 'invincible',
    name: '無敵',
    icon: '🌟',
    type: 'buff',
    property: 'invincibleTurns',
    turnsProperty: 'invincibleTurns',
    badgeClass: 'badge-invincible',
    /**
     * 無敵の説明文を生成する
     * @param {number} [turns=1] - 残り持続ターン数
     * @returns {string} 説明文
     */
    desc: (turns) => `${turns || 1}ターンの間、戦闘でダメージを受けない。`,
  },

  /**
   * スタン状態（拘束 / 待機 / 凍結等）
   * 攻撃や反撃、スキル移動を行えず、戦闘行動が封じられた状態異常。
   */
  stun: {
    id: 'stun',
    name: 'スタン',
    icon: '💫',
    type: 'debuff',
    property: 'stunTurns',
    turnsProperty: 'stunTurns',
    badgeClass: 'badge-stun',
    /**
     * スタンの説明文を生成する
     * @param {number} [turns=1] - 残り持続ターン数
     * @returns {string} 説明文
     */
    desc: (turns) =>
      `${turns || 1}ターンの間、攻撃を行わず、敵カードや敵リーダーにダメージを与えられない。`,
  },

  /**
   * 攻撃不能状態
   * 戦闘攻撃を行うことができない状態異常。
   */
  cant_attack: {
    id: 'cant_attack',
    name: '攻撃不能',
    icon: '',
    type: 'debuff',
    property: 'cantAttackTurns',
    turnsProperty: 'cantAttackTurns',
    badgeClass: '',
    /**
     * 攻撃不能の説明文を生成する
     * @param {number} [turns=1] - 残り持続ターン数
     * @returns {string} 説明文
     */
    desc: (turns) => `${turns || 1}ターンの間、攻撃を行えない。`,
  },
};

/** 全状態IDのリスト */
export const STATUS_IDS = Object.keys(STATUSES);

/** バフ系状態IDのリスト */
export const BUFF_STATUS_IDS = Object.values(STATUSES)
  .filter((s) => s.type === 'buff')
  .map((s) => s.id);

/** デバフ系状態IDのリスト */
export const DEBUFF_STATUS_IDS = Object.values(STATUSES)
  .filter((s) => s.type === 'debuff')
  .map((s) => s.id);
