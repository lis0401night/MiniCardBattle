/**
 * チュートリアルエンジン
 *
 * GameState.tutorial にチュートリアル進行状態を保持し、
 * バトル中のプレイヤー操作をフィルタリング（ブロック or 許可）する。
 *
 * チュートリアルモードの設計:
 * - ステップごとに「期待するアクション」を定義
 * - 期待と異なる操作を行った場合はブロックメッセージを表示
 * - 敵の行動は各ステップで完全にスクリプト制御
 * - 報酬なし、勝敗ダイアログなし
 */

import { CARD_MASTER } from '../utils/constants/cards.js';
import { CHARACTERS } from '../utils/constants/characters.js';
import { playSound, sleep, switchScreen } from '../utils/gameUtils.js';
import { AUDIO_INSTANCES, SOUNDS } from '../utils/sounds.js';
import { prepareBattle } from './battle.js';
import { GameState } from './gameState.js';
import { showAlertModal, showConfirmModal } from './uiModals.js';

// ============================
// チュートリアルステップ定義
// ============================

// ステップ内のアクションタイプ:
// 'message'       - メッセージ表示のみ（タップで次へ）
// 'selectCard'    - 手札の特定カードを選択させる
// 'placeCard'     - 選択したカードを特定レーンに配置させる
// 'longPressBoard'- 場の特定カードを長押しさせる
// 'longPressHand' - 手札の特定カードを長押しさせる
// 'waitCombat'    - 戦闘フェーズの自動進行を待つ
// 'enemyAction'   - 敵のスクリプト行動（プレイヤー操作なし）
// 'waitEnd'       - 勝利後のメッセージ表示

const TUTORIAL_BASIC_RULES = [
  // === ターン1: ゴーレム召喚 ===
  {
    id: 'intro_1',
    type: 'message',
    text: 'バトルの基本を教えるね！',
  },
  {
    id: 'intro_2',
    type: 'message',
    text: '毎ターン手札から1枚、左・中央・右のレーンに出して戦うよ。',
  },
  {
    id: 'intro_3',
    type: 'message',
    text: 'まずは「大理石のゴーレム」をタップしてみて！',
  },
  {
    id: 'select_golem',
    type: 'selectCard',
    targetCardId: 'golem',
    blockMessage: '「大理石のゴーレム」を選んでね！',
  },
  {
    id: 'intro_4',
    type: 'message',
    text: '黄色のレーンをタップで召喚！\n最初のターンは中央だけだよ。',
  },
  {
    id: 'place_golem',
    type: 'placeCard',
    targetCardId: 'golem',
    targetLane: 1,
    blockMessage: '中央のレーンに召喚してね！',
  },
  // 敵ターン：鉄亀を左に召喚
  {
    id: 'enemy_tortoise',
    type: 'message',
    text: '相手が左に「鉄亀」を召喚したよ。',
  },

  // === ターン2: 攻撃フェーズの説明 ===
  {
    id: 'combat_explain_1',
    type: 'message',
    text: 'ターン開始時にカードが自動攻撃するよ。\n正面に敵がいれば戦闘、いなければリーダーを攻撃！',
    resumeCombatAfter: true, // このメッセージ後に攻撃フェーズを再開
  },
  {
    id: 'combat_explain_2',
    type: 'message',
    text: 'ゴーレムの正面は空だから、相手に5ダメージ！',
    waitBattleIdle: true, // 攻撃完了後に表示
  },

  // ターン2: 鉄亀の長押し確認
  {
    id: 'longpress_explain',
    type: 'message',
    text: '相手の「鉄亀」を長押しして能力を確認してみて！',
  },
  {
    id: 'longpress_tortoise',
    type: 'longPressBoard',
    targetSide: 'enemy',
    targetLane: 0,
    blockMessage: '相手の左レーンにいる「鉄亀」を長押ししてね！',
  },
  {
    id: 'longpress_result',
    type: 'message',
    text: '「頑丈」は戦闘ダメージを半減するスキル。\n正面から倒すのは大変だね……。',
  },

  // ターン2: エルフの射手の長押し確認
  {
    id: 'longpress_hand_explain',
    type: 'message',
    text: '手札も長押しで確認できるよ。\n「森の射手」を長押ししてみて！',
  },
  {
    id: 'longpress_sniper',
    type: 'longPressHand',
    targetCardId: 'sniper',
    blockMessage: '手札の「森の射手」を長押ししてね！',
  },
  {
    id: 'longpress_sniper_result',
    type: 'message',
    text: '「狙撃」は召喚時に敵1体にダメージ！\nこれなら鉄亀を倒せるね。',
  },

  // ターン2: エルフの射手を召喚
  {
    id: 'select_sniper_explain',
    type: 'message',
    text: '「森の射手」を左のレーンに召喚してみて！',
  },
  {
    id: 'select_sniper',
    type: 'selectCard',
    targetCardId: 'sniper',
    blockMessage: '「森の射手」を選んでね！',
  },
  {
    id: 'place_sniper',
    type: 'placeCard',
    targetCardId: 'sniper',
    targetLane: 0,
    blockMessage: '左のレーンに召喚してね！',
    pauseBeforeEnemyTurn: true, // 敵ターン開始前に一時停止（スキル発動結果を見せるため）
  },

  // 狙撃スキル発動の説明（自ターン終了時に表示）
  {
    id: 'snipe_explain',
    type: 'message',
    text: '「狙撃」で鉄亀を撃破！',
    resumeEnemyTurnAfter: true, // このメッセージ後に敵ターンを再開
  },

  // 敵ターン：ゴブリンを中央に召喚（敵ターン＋攻撃フェーズ前の一時停止完了後に表示）
  {
    id: 'enemy_goblin',
    type: 'message',
    text: '相手が中央に「ゴブリンの司令官」を召喚。\nパワー6の強敵だ……。',
    waitBattleIdle: true, // 敵ターン完了＋攻撃前一時停止後に表示
  },

  // === ターン3: 戦闘の詳細説明 ===
  {
    id: 'combat_detail_1',
    type: 'message',
    text: 'ゴーレムとゴブリンが正面で戦闘！',
    resumeCombatAfter: true, // このメッセージ後に攻撃フェーズを再開
  },
  {
    id: 'combat_detail_2',
    type: 'message',
    text: '戦闘は互いのパワー分ダメージを同時に与え合うよ。\nパワー5のゴーレムは6ダメージで破壊されちゃった……。',
    waitBattleIdle: true, // 攻撃完了後に表示
  },
  {
    id: 'combat_detail_3',
    type: 'message',
    text: 'でもゴブリンもパワー1に！\n射手は相手リーダーを攻撃したね。',
  },

  // ターン3: 稲妻の猟豹を召喚
  {
    id: 'cheetah_explain',
    type: 'message',
    text: '「稲妻の猟豹」を右に召喚！\n「速攻」持ちは出してすぐ攻撃できるよ。',
  },
  {
    id: 'select_cheetah',
    type: 'selectCard',
    targetCardId: 'cheetah',
    blockMessage: '「稲妻の猟豹」を選んでね！',
  },
  {
    id: 'place_cheetah',
    type: 'placeCard',
    targetCardId: 'cheetah',
    targetLane: 2,
    blockMessage: '右のレーンに召喚してね！',
  },

  // 勝利メッセージ
  {
    id: 'victory_1',
    type: 'message',
    text: 'やったー！ 速攻で相手を倒して勝利！',
  },
  {
    id: 'victory_2',
    type: 'message',
    text: 'おさらい：\n・手札からレーンに召喚\n・ターン開始時に自動攻撃\n・カードごとに固有スキルあり',
  },
  {
    id: 'victory_3',
    type: 'message',
    text: 'リーダーごとに固有の「リーダースキル」もあるよ。\n詳しくは個別チュートリアルを見てね',
  },
  {
    id: 'end',
    type: 'end',
    text: '',
  },
];

// ============================
// アイギス リーダースキルチュートリアル
// ============================

const TUTORIAL_LEADER_ANDROID = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'リーダーには固有の「リーダースキル」があるよ。\nSPが溜まると使えるの！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: 'アイギスのリーダースキルは「殲滅光線」。\n敵の場のすべてのカードに4ダメージ！',
  },
  {
    id: 'ls_intro_3',
    type: 'message',
    text: 'SPが満タンだよ。\nリーダースキルで一気に形勢逆転を狙おう！',
  },
  {
    id: 'ls_intro_4',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    blockMessage: 'リーダースキルボタンをタップして！',
  },
  {
    id: 'ls_result',
    type: 'message',
    text: '殲滅光線で全体ダメージを与えたよ！',
    waitBattleIdle: true,
  },
  {
    id: 'ls_mantis_explain',
    type: 'message',
    text: '「旧式マンティス」を出そう！\n「速攻」持ちは出してすぐ攻撃できるよ。',
  },
  {
    id: 'select_mantis',
    type: 'selectCard',
    targetCardId: 'mantis',
    blockMessage: '「旧式マンティス」を選んでね！',
  },
  {
    id: 'place_mantis',
    type: 'placeCard',
    targetCardId: 'mantis',
    targetLane: null, // 自由配置
    blockMessage: null,
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ 速攻で相手を倒して勝利！',
  },
  {
    id: 'ls_victory_2',
    type: 'message',
    text: '全体ダメージで敵を一掃したあとに\n「速攻」で攻撃したり、強力なカードを出そう！',
  },
  {
    id: 'end',
    type: 'end',
    text: '',
  },
];

// ============================
// イグニス リーダースキルチュートリアル
// ============================

const TUTORIAL_LEADER_DRAGON = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'イグニスのリーダースキルは「竜王の降臨」。\nパワー7の「イグニス」トークンを配置するよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    targetLane: 0,
    blockMessage: 'リーダースキルボタンをタップしてね！',
    placementBlockMessage: '左のレーンに配置してね！',
  },
  {
    id: 'ls_result',
    type: 'message',
    text: 'イグニスを配置したよ！\n次は「狂戦士」を右のレーンに召喚しよう！',
    waitBattleIdle: true,
  },
  {
    id: 'select_berserker',
    type: 'selectCard',
    targetCardId: 'berserker',
    blockMessage: '「狂戦士」を選んでね！',
  },
  {
    id: 'place_berserker',
    type: 'placeCard',
    targetCardId: 'berserker',
    targetLane: 2,
    blockMessage: '右のレーンに召喚してね！',
    pauseBeforeEnemyTurn: true,
  },
  {
    id: 'resume_enemy',
    type: 'message',
    text: '次は相手のターンだよ。',
    resumeEnemyTurnAfter: true,
  },
  {
    id: 'enemy_golem',
    type: 'message',
    text: '相手が「大理石のゴーレム」を召喚したよ。\nでも、イグニスの正面は空だから相手リーダーに攻撃！',
    waitBattleIdle: true,
    resumeCombatAfter: true,
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ イグニスの攻撃で勝利！',
  },
  {
    id: 'ls_victory_2',
    type: 'message',
    text: 'リーダースキルと一緒に強力なカードを場に出して\n一気に攻勢をかけよう！',
  },
  {
    id: 'end',
    type: 'end',
    text: '',
  },
];

// ============================
// セレスティア リーダースキルチュートリアル
// ============================

const TUTORIAL_LEADER_KNIGHT = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'セレスティアのリーダースキルは「聖なる進軍」。\n騎士を2体配置して、味方全体のパワーを+2するよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    targetLanes: [0, 2],
    blockMessage: 'リーダースキルボタンをタップしてね！',
    placementBlockMessage: '左と右のレーンに配置してね！',
  },
  {
    id: 'ls_result',
    type: 'message',
    text: '騎士を配置して味方全体を強化したよ！\n次は「前線の司令官」を中央に召喚しよう！',
    waitBattleIdle: true,
  },
  {
    id: 'select_commander',
    type: 'selectCard',
    targetCardId: 'commander',
    blockMessage: '「前線の司令官」を選んでね！',
  },
  {
    id: 'place_commander',
    type: 'placeCard',
    targetCardId: 'commander',
    targetLane: 1,
    blockMessage: '中央のレーンに召喚してね！',
    pauseBeforeEnemyTurn: true,
  },
  {
    id: 'ls_support_explain',
    type: 'message',
    text: '「援護」スキルで隣の騎士をさらに強化！',
    resumeEnemyTurnAfter: true,
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ 仲間の力を合わせて勝利！',
  },
  {
    id: 'ls_victory_2',
    type: 'message',
    text: 'リーダースキルで味方を強化してから\nカードを出すと効果的だよ！',
  },
  {
    id: 'end',
    type: 'end',
    text: '',
  },
];

// ============================
// ナイア リーダースキルチュートリアル
// ============================

const TUTORIAL_LEADER_CTHULHU = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'ナイアのリーダースキルは「深淵の儀式」。\n手札を捨ててドローし直し、手札全体のパワーを+1するよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: 'ゴーレム2枚を捨てて新しいカードを引こう！',
  },
  {
    id: 'ls_intro_3',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    discardTargetCardId: 'golem',
    requiredDiscardCount: 2,
    blockMessage: 'リーダースキルボタンをタップしてね！',
    discardBlockMessage: '「大理石のゴーレム」を選んでね！',
  },
  {
    id: 'ls_result',
    type: 'message',
    text: '新しいカードを引いて手札を強化したよ！\n「這い寄るスライム」を中央のゴーレムに重ねて召喚しよう！',
    waitBattleIdle: true,
  },
  {
    id: 'select_slime',
    type: 'selectCard',
    targetCardId: 'slime',
    blockMessage: '「這い寄るスライム」を選んでね！',
  },
  {
    id: 'place_slime',
    type: 'placeCard',
    targetCardId: 'slime',
    targetLane: 1,
    blockMessage: '中央のゴーレムに重ねて配置してね！',
    nextPlacementTargetLane: 0,
    nextPlacementBlockMessage: '左のレーンに分身を配置してね！',
  },
  {
    id: 'resume_combat',
    type: 'waitCombat',
  },
  {
    id: 'select_cheetah',
    type: 'selectCard',
    targetCardId: 'cheetah',
    blockMessage: '「稲妻の猟豹」を選んでね！',
  },
  {
    id: 'place_cheetah',
    type: 'placeCard',
    targetCardId: 'cheetah',
    targetLane: 2,
    blockMessage: '右の空いているレーンに配置してね！',
  },
  {
    id: 'ls_cheetah_explain',
    type: 'message',
    text: '猟豹もリーダースキルでパワーが上がっているよ！\n「速攻」で敵リーダーにトドメだ！',
    waitBattleIdle: true,
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ 手札を強化して勝利だね！',
    waitBattleIdle: true,
  },
  {
    id: 'ls_victory_2',
    type: 'message',
    text: '「分身」や「速攻」を持つカードを\n強化すると戦術の幅が広がるよ！',
  },
  {
    id: 'end',
    type: 'endTutorial',
    text: '',
  },
];

// ============================
// リナ リーダースキルチュートリアル
// ============================

const TUTORIAL_LEADER_ELF = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'リナのリーダースキルは「星墜ちの矢」。\n相手の場のカード1枚を選んで破壊するよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: '相手の場に「古代の大蜥蜴」が3体！\nリーダースキルで1体を倒そう！',
  },
  {
    id: 'ls_intro_3',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    blockMessage: 'リーダースキルボタンをタップしてね！',
    requiredEnemyTargetCount: 1,
    targetLanesBlockMessage: '相手のカードを選んで破壊してね！',
  },
  {
    id: 'ls_result',
    type: 'message',
    text: '大蜥蜴を1体破壊したよ！\n空いたレーンに「稲妻の猟豹」を出してトドメだ！',
    waitBattleIdle: true,
  },
  {
    id: 'select_cheetah',
    type: 'selectCard',
    targetCardId: 'cheetah',
    blockMessage: '「稲妻の猟豹」を選んでね！',
  },
  {
    id: 'place_cheetah',
    type: 'placeCard',
    targetCardId: 'cheetah',
    blockMessage: '敵がいないレーンに配置してね！',
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ リナの一矢で道を切り開いたよ！',
  },
  {
    id: 'ls_victory_2',
    type: 'message',
    text: '敵をピンポイントで除去して\n「速攻」カードで一気に攻めよう！',
  },
  {
    id: 'end',
    type: 'end',
    text: '',
  },
];

// ============================
// エリシア リーダースキルチュートリアル
// ============================

const TUTORIAL_LEADER_CLERIC = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'エリシアのリーダースキルは「神炎の審判」。\n相手に3ダメージ＆自分のHPを3回復するよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: '相手の場に「城壁」が3体！\n「城壁」は「防御」持ちで攻撃しないけど壁になる！',
  },
  {
    id: 'ls_intro_3',
    type: 'message',
    text: 'リーダースキルなら壁を無視して\n直接ダメージを与えられるよ！',
  },
  {
    id: 'ls_intro_4',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    blockMessage: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'ls_result',
    type: 'message',
    text: '3ダメージ！ 相手の残りHPは1だよ。\n「インシネレーター」の「砲撃」でトドメだ！',
    waitBattleIdle: true,
  },
  {
    id: 'select_incinerator',
    type: 'selectCard',
    targetCardId: 'incinerator',
    blockMessage: '「インシネレーター」を選んでね！',
  },
  {
    id: 'place_incinerator',
    type: 'placeCard',
    targetCardId: 'incinerator',
    blockMessage: 'レーンに配置してね！',
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ リーダースキルと砲撃で勝利！',
  },
  {
    id: 'ls_victory_2',
    type: 'message',
    text: '場を固められても直接ダメージで\n突破できるのがエリシアの強みだよ！',
  },
  {
    id: 'end',
    type: 'end',
    text: '',
  },
];

// ============================
// マリア リーダースキルチュートリアル
// ============================
const TUTORIAL_LEADER_DEVILHUNTER = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'マリアのリーダースキルは「棺の解放」。\n墓地のカードを1枚場に復活させるよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    blockMessage: 'リーダースキルボタンをタップしてね！',
    targetDiscardId: 'dinosaur',
    discardBlockMessage: '「古代の大蜥蜴」を選んでね！',
    targetLane: 0, // 左のレーンに置く
    placementBlockMessage: '左のレーンに配置してね！',
  },
  {
    id: 'place_necromancer_explain',
    type: 'message',
    text: '手札の「ヴィス・ガルドの背教者」も「復活」のスキルを持っているよ！\n中央のレーンに召喚しよう。',
    pauseBeforeEnemyTurn: true,
  },
  {
    id: 'select_necromancer',
    type: 'selectCard',
    targetCardId: 'necromancer',
    blockMessage: '「ヴィス・ガルドの背教者」を選んでね！',
  },
  {
    id: 'place_necromancer',
    type: 'placeCard',
    targetCardId: 'necromancer',
    targetLane: 1, // 中央
    blockMessage: '中央のレーンに召喚してね！',
    targetDiscardId: 'shade', // 復活対象
    discardBlockMessage: '「墓の亡霊」を選んでね！',
    nextPlacementTargetLane: 2, // 復活したカードを右のレーンに
    nextPlacementBlockMessage: '右のレーンに配置してね！',
  },
  {
    id: 'enemy_golem',
    type: 'message',
    text: '相手が「大理石のゴーレム」を召喚したよ。\nでも、残りの2体で相手リーダーに直接攻撃できる！',
    resumeCombatAfter: true,
    waitBattleIdle: true,
  },
  {
    id: 'wait_for_win',
    type: 'waitEnd',
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ 墓地のカードを活用して見事勝利！',
  },
  {
    id: 'end',
    type: 'endTutorial',
    text: '',
  },
];

// ============================
// クロエ リーダースキルチュートリアル
// ============================
const TUTORIAL_LEADER_WITCH = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'クロエのリーダースキル「因果律の掌握」は、追加のターンを2回行うことができる強力なスキルだよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    blockMessage: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'ls_intro_3',
    type: 'message',
    text: '追加のターンが2回もらえるから、連続してカードを出すチャンス！\nまずは手札の「ガーゴイル」を左のレーンに召喚してね！',
  },
  {
    id: 'place_gargoyle',
    type: 'placeCard',
    targetCardId: 'gargoyle',
    targetLane: 0, // 左
    blockMessage: '左のレーンに「ガーゴイル」を召喚してね！',
  },
  {
    id: 'post_golem_intro',
    type: 'message',
    text: '「待機」スキルを持つカードは、召喚されてから指定されたターン数だけ「防御」状態になり、攻撃ができないよ',
  },
  {
    id: 'post_golem_1',
    type: 'message',
    text: '追加のターンだから、続けてカードを出せるよ！\n手札の「大理石のゴーレム」を選んで、中央のレーンに召喚してね！',
    resumeCombatAfter: true,
  },
  {
    id: 'place_golem_1',
    type: 'placeCard',
    targetCardId: 'golem',
    targetLane: 1, // 中央
    blockMessage: '中央のレーンに「大理石のゴーレム」を召喚してね！',
    onSelectMessage: '中央のレーンにゴーレムを召喚してね！',
  },
  {
    id: 'post_golem_2',
    type: 'message',
    text: 'さらにもう1ターン！手札のもう一枚の「大理石のゴーレム」を選んで、右のレーンに召喚してね！',
    resumeCombatAfter: true,
  },
  {
    id: 'place_golem_2',
    type: 'placeCard',
    targetCardId: 'golem',
    targetLane: 2, // 右
    blockMessage: '右のレーンに「大理石のゴーレム」を召喚してね！',
    onSelectMessage: '右のレーンにゴーレムを召喚してね！',
    pauseBeforeEnemyTurn: true,
  },
  {
    id: 'enemy_goblin',
    type: 'message',
    text: 'ガーゴイルは「頑丈」でダメージを半減するから、相手のゴブリンの攻撃を耐えて破壊できるよ！',
    resumeEnemyTurnAfter: true,
    waitBattleIdle: true,
  },
  {
    id: 'player_counterattack',
    type: 'message',
    text: 'いよいよこちらの反撃だ！',
    waitBattleIdle: true,
    resumeCombatAfter: true,
  },
  {
    id: 'wait_for_win',
    type: 'waitEnd',
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ 一斉攻撃で見事勝利！',
  },
  {
    id: 'end',
    type: 'endTutorial',
    text: '',
  },
];

// ============================
// カグラ リーダースキルチュートリアル
// ============================
const TUTORIAL_LEADER_ONI = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'カグラのリーダースキル「急急如律令」は、相手のレーンを2つまで選んでダメージを与え、さらにそのレーンを「封印」する強力なスキルだよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    blockMessage: 'リーダースキルボタンをタップしてね！',
    requiredEnemyTargetCount: 2,
    targetLanesBlockMessage: '左と右のレーンを選んでね！',
    targetLanes: [0, 2], // 左と右
  },
  {
    id: 'ls_result',
    type: 'message',
    text: '相手の左と右のレーンを封印したよ！\n「封印」されたレーンには、指定されたターン数の間、カードを配置できなくなるんだ！',
  },
  {
    id: 'place_omyouji_intro',
    type: 'message',
    text: 'これで相手は左右にカードを出せなくなったよ。\n手札の「漆黒の除霊師」を選んで、空いている中央のレーンに召喚してね！',
  },
  {
    id: 'place_omyouji',
    type: 'placeCard',
    targetCardId: 'omyouji',
    targetLane: 1, // 中央
    blockMessage: '中央のレーンに「漆黒の除霊師」を召喚してね！',
    pauseBeforeEnemyTurn: true,
  },
  {
    id: 'enemy_turn_skip',
    type: 'message',
    text: '相手のターンだよ。\nでも、相手は何もできないみたいだね！',
    waitBattleIdle: true,
    resumeEnemyTurnAfter: true,
  },
  {
    id: 'player_counterattack',
    type: 'message',
    text: 'いよいよこちらの反撃だ！\n漆黒の除霊師の直接攻撃で決着をつけよう！',
    waitBattleIdle: true,
    resumeCombatAfter: true,
  },
  {
    id: 'wait_for_win',
    type: 'waitEnd',
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ 相手の行動を完全に封じて見事勝利！',
  },
  {
    id: 'end',
    type: 'endTutorial',
    text: '',
  },
];

// ============================
// ネフティ リーダースキルチュートリアル
// ============================
const TUTORIAL_LEADER_PRIEST = [
  {
    id: 'ls_intro_1',
    type: 'message',
    text: 'ネフティのリーダースキル「王墓の呪縛」は、相手のデッキからカードを4枚墓地に送り、さらに相手の場のカード1枚に4ダメージを与えるよ！',
  },
  {
    id: 'ls_intro_2',
    type: 'message',
    text: '相手の場に「竜人族の斥候」がいるね！',
  },
  {
    id: 'ls_intro_3',
    type: 'message',
    text: 'リーダースキルボタンをタップしてね！',
  },
  {
    id: 'use_leader_skill',
    type: 'useLeaderSkill',
    blockMessage: 'リーダースキルボタンをタップしてね！',
    requiredEnemyTargetCount: 1,
    targetLanesBlockMessage: '相手の「竜人族の斥候」を選んでね！',
  },
  {
    id: 'ls_result',
    type: 'message',
    text: '竜人族の斥候を倒して、相手のデッキを4枚削ったよ！',
  },
  {
    id: 'ls_result_2',
    type: 'message',
    text: '次は空いた左のレーンに「王墓の番人」を召喚しよう！',
  },
  {
    id: 'select_mummy',
    type: 'selectCard',
    targetCardId: 'mummy',
    blockMessage: '「王墓の番人」を選んでね！',
  },
  {
    id: 'place_mummy',
    type: 'placeCard',
    targetCardId: 'mummy',
    targetLane: 0,
    blockMessage: '左のレーンに配置してね！',
    pauseBeforeEnemyTurn: true,
  },
  {
    id: 'burial_explain',
    type: 'message',
    text: '「王墓の番人」の「埋葬」スキルで、さらに相手のデッキを3枚削ったよ！\nこれで相手のデッキは0枚になったはずだ！',
  },
  {
    id: 'resume_enemy',
    type: 'message',
    text: 'デッキが0枚の時にカードを引こうとすると、墓地のカードが山札に戻る代わりにリーダーの体力が半分になるんだ！',
    resumeEnemyTurnAfter: true,
    waitBattleIdle: true,
  },
  {
    id: 'player_counterattack',
    type: 'message',
    text: '相手の体力が半分に減ったね！\n引いてきた「稲妻の猟豹」を空いているレーンに召喚して、トドメを刺そう！',
    resumeCombatAfter: true,
  },
  {
    id: 'select_cheetah',
    type: 'selectCard',
    targetCardId: 'cheetah',
    blockMessage: '「稲妻の猟豹」を選んでね！',
  },
  {
    id: 'place_cheetah',
    type: 'placeCard',
    targetCardId: 'cheetah',
    targetLanes: [1, 2],
    blockMessage: '中央か右のレーンに配置してね！',
  },
  {
    id: 'wait_for_win',
    type: 'waitEnd',
  },
  {
    id: 'ls_victory_1',
    type: 'message',
    text: 'やったー！ デッキ破壊と速攻の見事なコンボで勝利！',
  },
  {
    id: 'ls_victory_2',
    type: 'message',
    text: 'デッキを削りきれば、相手の体力を大幅に減らすことができるよ！',
  },
  {
    id: 'end',
    type: 'endTutorial',
    text: '',
  },
];

// ============================
// チュートリアル設定テーブル
// ============================

/**
 * 各チュートリアルのID → 設定マッピング
 * steps: ステップ定義配列
 * playerCharId: プレイヤーキャラクターID
 * enemyCharId: 敵キャラクターID
 * stageId: ステージID（省略時は'practice'）
 * preset: バトルプリセット（手札・盤面・HP・SP等）
 * clearMessage: クリア時に表示するメッセージ
 * startMessage: 開始時に表示するメッセージ
 */
const TUTORIAL_CONFIGS = {
  basic_rules: {
    steps: TUTORIAL_BASIC_RULES,
    playerCharId: 'android',
    enemyCharId: 'dragon',
    preset: {
      firstPlayer: 'blue',
      playerHand: ['golem', 'sniper', 'cheetah'],
      enemyHand: ['tortoise', 'goblin', 'goblin'],
      playerDeck: ['diviner', 'cleric', 'clone', 'golem', 'golem'],
      enemyDeck: ['goblin', 'goblin', 'goblin', 'goblin', 'goblin'],
      playerHP: 20,
      enemyHP: 10,
      playerSP: 0,
      enemySP: 0,
    },
    clearMessage: 'チュートリアル「基本ルール」をクリアしました！',
    startMessage: 'チュートリアル「基本ルール」を開始します。',
  },
  leader_android: {
    steps: TUTORIAL_LEADER_ANDROID,
    playerCharId: 'android',
    enemyCharId: 'dragon',
    stageId: 'android',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['mantis', 'golem', 'golem', 'golem'],
      enemyHand: [],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['goblin', 'goblin', 'goblin', 'goblin', 'goblin'],
      playerHP: 20,
      enemyHP: 4,
      playerSP: 4,
      enemySP: 0,
      enemyBoard: [
        { id: 'token_reinforce', imgUrl: 'assets/cards/card_lizardman.jpg' },
        'lizardman',
        { id: 'token_reinforce', imgUrl: 'assets/cards/card_lizardman.jpg' },
      ],
    },
    clearMessage: 'チュートリアル「リーダー：アイギス」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：アイギス」を開始します。',
  },
  leader_dragon: {
    steps: TUTORIAL_LEADER_DRAGON,
    playerCharId: 'dragon',
    enemyCharId: 'android',
    stageId: 'dragon',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['berserker', 'golem', 'golem', 'golem'],
      enemyHand: ['golem'],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 5,
      playerSP: 4,
      enemySP: 0,
      enemyBoard: [
        'clone',
        null,
        { id: 'token_clone', power: 2, imgUrl: 'assets/cards/card_clone.jpg' },
      ],
    },
    clearMessage: 'チュートリアル「リーダー：イグニス」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：イグニス」を開始します。',
  },
  leader_knight: {
    steps: TUTORIAL_LEADER_KNIGHT,
    playerCharId: 'knight',
    enemyCharId: 'dragon',
    stageId: 'knight',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['commander', 'golem', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 4,
      playerSP: 5,
      enemySP: 0,
      enemyBoard: [
        'lizardman',
        null,
        { id: 'token_reinforce', imgUrl: 'assets/cards/card_lizardman.jpg' },
      ],
    },
    clearMessage: 'チュートリアル「リーダー：セレスティア」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：セレスティア」を開始します。',
  },
  leader_cthulhu: {
    steps: TUTORIAL_LEADER_CTHULHU,
    playerCharId: 'cthulhu',
    enemyCharId: 'dragon',
    stageId: 'cthulhu',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['slime', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['golem', 'golem', 'cheetah', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 5,
      playerSP: 3,
      enemySP: 0,
      playerBoard: [null, 'golem', null],
      enemyBoard: [
        { id: 'token_reinforce', imgUrl: 'assets/cards/card_lizardman.jpg' },
        'sniper',
        'lizardman',
      ],
    },
    clearMessage: 'チュートリアル「リーダー：ナイア」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：ナイア」を開始します。',
  },
  leader_elf: {
    steps: TUTORIAL_LEADER_ELF,
    playerCharId: 'elf',
    enemyCharId: 'dragon',
    stageId: 'elf',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['cheetah', 'golem', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 3,
      playerSP: 4,
      enemySP: 0,
      enemyBoard: ['dinosaur', 'dinosaur', 'dinosaur'],
    },
    clearMessage: 'チュートリアル「リーダー：リナ」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：リナ」を開始します。',
  },
  leader_cleric: {
    steps: TUTORIAL_LEADER_CLERIC,
    playerCharId: 'cleric',
    enemyCharId: 'dragon',
    stageId: 'cleric',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['incinerator', 'golem', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 4,
      playerSP: 3,
      enemySP: 0,
      enemyBoard: ['wall', 'wall', 'wall'],
    },
    clearMessage: 'チュートリアル「リーダー：エリシア」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：エリシア」を開始します。',
  },
  leader_devilhunter: {
    steps: TUTORIAL_LEADER_DEVILHUNTER,
    playerCharId: 'devilhunter',
    enemyCharId: 'dragon',
    stageId: 'devilhunter',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['necromancer', 'golem', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerDiscard: ['dinosaur', 'shade'],
      playerHP: 20,
      enemyHP: 5,
      playerSP: 4,
      enemySP: 0,
      enemyBoard: ['lizardman', null, null],
    },
    clearMessage: 'チュートリアル「リーダー：マリア」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：マリア」を開始します。',
  },
  leader_witch: {
    steps: TUTORIAL_LEADER_WITCH,
    playerCharId: 'witch',
    enemyCharId: 'dragon',
    stageId: 'witch',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['gargoyle', 'golem', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 8,
      playerSP: 6,
      enemySP: 0,
      enemyBoard: ['goblin', null, null],
    },
    clearMessage: 'チュートリアル「リーダー：クロエ」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：クロエ」を開始します。',
  },
  leader_oni: {
    steps: TUTORIAL_LEADER_ONI,
    playerCharId: 'oni',
    enemyCharId: 'dragon',
    stageId: 'oni',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['omyouji', 'golem', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 4,
      playerSP: 5,
      enemySP: 0,
      enemyBoard: [
        'lizardman',
        null,
        { id: 'token_reinforce', imgUrl: 'assets/cards/card_lizardman.jpg' },
      ],
    },
    clearMessage: 'チュートリアル「リーダー：カグラ」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：カグラ」を開始します。',
  },
  leader_priest: {
    steps: TUTORIAL_LEADER_PRIEST,
    playerCharId: 'priest',
    enemyCharId: 'dragon',
    stageId: 'priest',
    preset: {
      firstPlayer: 'blue',
      turnCount: 2,
      playerHand: ['mummy', 'golem', 'golem', 'golem'],
      enemyHand: ['golem', 'golem', 'golem'],
      playerDeck: ['cheetah', 'golem', 'golem', 'golem', 'golem'],
      enemyDeck: ['golem', 'golem', 'golem', 'golem', 'golem'],
      playerHP: 20,
      enemyHP: 6,
      playerSP: 5,
      enemySP: 0,
      enemyBoard: ['lizardman', null, null],
    },
    clearMessage: 'チュートリアル「リーダー：ネフティ」をクリアしました！',
    startMessage: 'チュートリアル「リーダー：ネフティ」を開始します。',
  },
};

// ============================
// チュートリアル状態管理
// ============================

/** チュートリアルの台詞表示用コールバック（BattleScreen側で登録） */
let showTutorialMessageCallback = null;

/** チュートリアルメッセージの「次へ」待ちのPromise resolver */
let tutorialMessageResolver = null;

/** チュートリアルの長押し検出コールバック */
let tutorialLongPressResolver = null;

/**
 * BattleScreen側から呼ばれるコールバック登録
 */
export function setTutorialMessageCallback(callback) {
  showTutorialMessageCallback = callback;
}

/**
 * チュートリアルメッセージのタップ（次へ）を処理
 */
export function advanceTutorialMessage() {
  if (tutorialMessageResolver) {
    const resolve = tutorialMessageResolver;
    tutorialMessageResolver = null;
    resolve();
  }
}

/**
 * チュートリアルの長押し完了を通知
 */
export function notifyTutorialLongPress(side, lane) {
  if (tutorialLongPressResolver) {
    const resolve = tutorialLongPressResolver;
    tutorialLongPressResolver = null;
    resolve({ side, lane });
  }
}

/**
 * 手札の長押し完了を通知
 */
export function notifyTutorialHandLongPress(cardId, baseId) {
  if (tutorialLongPressResolver) {
    const resolve = tutorialLongPressResolver;
    tutorialLongPressResolver = null;
    resolve({ cardId, baseId });
  }
}

/**
 * チュートリアルの攻撃フェーズ一時停止を解除し、戦闘を再開する
 */
export function resumeTutorialCombat() {
  if (GameState.tutorial && GameState.tutorial.combatResumeResolver) {
    const resolve = GameState.tutorial.combatResumeResolver;
    GameState.tutorial.combatResumeResolver = null;
    resolve();
  }
}

/**
 * メッセージを表示して、タップ待ちするPromise
 */
export function showMessage(text) {
  return new Promise((resolve) => {
    tutorialMessageResolver = resolve;
    if (showTutorialMessageCallback) {
      showTutorialMessageCallback(text);
    }
  });
}

/**
 * メッセージを非表示にする
 */
export function hideMessage() {
  if (showTutorialMessageCallback) {
    showTutorialMessageCallback(null);
  }
}

/**
 * チュートリアルモードかどうかを判定
 */
export function isTutorialMode() {
  return GameState.tutorial && GameState.tutorial.active;
}

/**
 * チュートリアルの現在ステップを取得
 */
export function getCurrentTutorialStep() {
  if (!isTutorialMode()) return null;
  const steps = GameState.tutorial.steps;
  const idx = GameState.tutorial.stepIndex;
  return steps[idx] || null;
}

// ============================
// 操作フィルタリング
// ============================

/**
 * 手札クリックをチュートリアルでフィルタリング
 * @returns {boolean} true = ブロック（操作を止める）
 */
export function filterHandCardClick(cardIndex) {
  if (!isTutorialMode()) return false;
  const step = getCurrentTutorialStep();
  if (!step) return false;

  if (step.type === 'selectCard') {
    const card = GameState.playerHand[cardIndex];
    if (
      card &&
      (card.id === step.targetCardId || card.baseId === step.targetCardId)
    ) {
      // 正しいカードが選択された → 少し遅延してステップ進行
      // handleHandCardClickの後続処理（selectedCardIndex設定）が完了してから進行させる
      setTimeout(() => advanceStep(), 50);
      return false; // ブロックしない（選択を許可）
    } else {
      // 間違ったカード
      showBlockMessage(step.blockMessage);
      return true;
    }
  }

  // selectCard以外のステップでは手札操作をブロック
  // ただし手札破棄モード（リーダースキル等）中は許可する
  if (step.type !== 'placeCard' && !GameState.isDiscardingMode) {
    showBlockMessage(step.blockMessage || 'まだカードを選べないよ！');
    return true;
  }

  // 手札破棄モード中: discardTargetCardIdが指定されている場合、そのカード以外をブロック
  const discardTarget = GameState.tutorial?.discardTargetCardId;
  if (GameState.isDiscardingMode && discardTarget) {
    const card = GameState.playerHand[cardIndex];
    if (card && card.id !== discardTarget && card.baseId !== discardTarget) {
      showBlockMessage(
        '「' +
          (CARD_MASTER.find((c) => c.id === discardTarget)?.name ||
            discardTarget) +
          '」を選んでね！'
      );
      return true;
    }
  }

  return false;
}

/**
 * レーンクリック（カード配置）をチュートリアルでフィルタリング
 * @returns {boolean} true = ブロック
 */
export function filterLaneClick(lane, side) {
  if (!isTutorialMode()) return false;
  const step = getCurrentTutorialStep();
  if (!step) return false;

  if (step.type === 'placeCard' && side === 'player') {
    // 1. 現在選択されている手札のカードを取得
    const selectedCard =
      GameState.selectedCardIndex !== null
        ? GameState.playerHand[GameState.selectedCardIndex]
        : null;

    // 2. 選択されているカードが、指定された targetCardId と一致しているか判定
    const isCorrectCard =
      selectedCard &&
      (selectedCard.id === step.targetCardId ||
        selectedCard.baseId === step.targetCardId);

    if (!isCorrectCard) {
      // 指定外のカードが選択されている場合は配置を完全にブロックし、警告を表示
      const cardName =
        CARD_MASTER.find((c) => c.id === step.targetCardId)?.name ||
        step.targetCardId;
      showBlockMessage(`「${cardName}」を選んで配置してね！`);
      return true;
    }

    // targetLane が未定義またはnullの場合は自由配置（どのレーンでもOK）
    if (
      step.targetLane == null ||
      lane === step.targetLane ||
      (Array.isArray(step.targetLanes) && step.targetLanes.includes(lane))
    ) {
      if (step.nextPlacementTargetLane !== undefined) {
        GameState.tutorial.placementTargetLane = step.nextPlacementTargetLane;
        GameState.tutorial.placementBlockMessage =
          step.nextPlacementBlockMessage;
      }
      // 正しいレーン → ステップ進行
      advanceStep();
      return false;
    } else {
      showBlockMessage(step.blockMessage);
      return true;
    }
  }

  // 配置ステップ以外ではレーン操作をブロック
  showBlockMessage(step.blockMessage || '今はカードを置けないよ！');
  return true;
}

/**
 * 配置モード（リーダースキルのレーン選択等）をチュートリアルでフィルタリング
 * useLeaderSkillステップにtargetLaneが指定されている場合、そのレーン以外をブロックする
 * @param {number} laneIndex - 選択されたレーンインデックス
 * @returns {boolean} true = ブロック
 */
export function filterPlacementLaneClick(laneIndex) {
  if (!isTutorialMode()) return false;
  // useLeaderSkillステップで設定されたレーン制限フラグを参照
  const targetLane = GameState.tutorial.placementTargetLane;
  const targetLanes = GameState.tutorial.placementTargetLanes;

  // 単一レーン制限
  if (targetLane !== undefined && targetLane !== null) {
    if (laneIndex !== targetLane) {
      showBlockMessage(
        GameState.tutorial.placementBlockMessage || '指定のレーンに配置してね！'
      );
      return true;
    }
    GameState.tutorial.placementTargetLane = null;
    GameState.tutorial.placementBlockMessage = null;
  }

  // 複数レーン制限（指定レーンのいずれかに配置可能）
  if (Array.isArray(targetLanes) && targetLanes.length > 0) {
    if (!targetLanes.includes(laneIndex)) {
      showBlockMessage(
        GameState.tutorial.placementBlockMessage || '指定のレーンに配置してね！'
      );
      return true;
    }
    // 選んだレーンを候補から除外
    GameState.tutorial.placementTargetLanes = targetLanes.filter(
      (l) => l !== laneIndex
    );
  }

  return false;
}

/**
 * ターン終了ボタンをチュートリアルでフィルタリング
 * @returns {boolean} true = ブロック
 */
export function filterEndTurn() {
  if (!isTutorialMode()) return false;
  showBlockMessage('まだターンを終了しないで！');
  return true;
}

/**
 * リーダースキルボタンをチュートリアルでフィルタリング
 * useLeaderSkillステップの場合のみ許可し、それ以外はブロックする
 * @returns {boolean} true = ブロック
 */
export function filterLeaderSkill() {
  if (!isTutorialMode()) return false;
  const step = getCurrentTutorialStep();
  if (step && step.type === 'useLeaderSkill') {
    // リーダースキルの使用を許可（ステップ進行はSP消費検知時に行う）
    return false;
  }
  showBlockMessage('チュートリアルではリーダースキルは使えないよ。');
  return true;
}

/**
 * 手札選択終了ボタン押下時のフィルタリング
 * @returns {boolean} true = ブロック
 */
export function filterFinishHandSelection() {
  if (!isTutorialMode()) return false;

  const reqCount = GameState.tutorial.requiredDiscardCount;
  if (GameState.isDiscardingMode && reqCount) {
    if (GameState.discardSelectedIndices.length < reqCount) {
      showBlockMessage(`カードを${reqCount}枚選んでから完了してね！`);
      return true;
    }
    // 通過したらクリアする
    GameState.tutorial.requiredDiscardCount = null;
    GameState.tutorial.discardTargetCardId = null;
  }
  return false;
}

/**
 * 敵ターゲット選択終了ボタン押下時のフィルタリング
 * @returns {boolean} true = ブロック
 */
export function filterFinishEnemyTargetSelection() {
  if (!isTutorialMode()) return false;

  if (GameState.isEnemyTargetMode) {
    const reqCount = GameState.tutorial?.requiredEnemyTargetCount;
    if (reqCount && GameState.targetSelectedLanes.length < reqCount) {
      showBlockMessage(
        GameState.tutorial.targetLanesBlockMessage ||
          `対象を${reqCount}つ選んでね！`
      );
      return true;
    }
    if (GameState.targetSelectedLanes.length === 0) {
      showBlockMessage('対象を選んでから完了してね！');
      return true;
    }
  }
  return false;
}

/**
 * 墓地選択の完了・キャンセルをチュートリアルでフィルタリング
 * @param {string|null} selectedCardId - 選択されたカードID (キャンセルの場合はnull)
 * @returns {boolean} true = ブロック (完了させない)
 */
export function filterDiscardSelectionSubmit(selectedCardId) {
  if (!isTutorialMode()) return false;

  const targetId = GameState.tutorial.targetDiscardId;
  const blockMsg =
    GameState.tutorial.discardBlockMessage || 'キャンセルはできないよ！';

  if (targetId) {
    if (!selectedCardId) {
      showBlockMessage(blockMsg);
      return true;
    }
    if (selectedCardId !== targetId) {
      showBlockMessage(blockMsg || 'そのカードは選べないよ！');
      return true;
    }
    // 正しい選択が完了したらクリアする
    GameState.tutorial.targetDiscardId = null;
    GameState.tutorial.discardBlockMessage = null;
    return false;
  }

  // targetDiscardIdは設定されていないが、アクションステップとしてキャンセルをブロックしたい場合
  const step = getCurrentTutorialStep();
  if (
    !selectedCardId &&
    step &&
    (step.type === 'useLeaderSkill' || step.type === 'placeCard')
  ) {
    showBlockMessage('キャンセルはできないよ！');
    return true;
  }
  return false;
}

/**
 * ブロックメッセージを表示
 */
function showBlockMessage(msg) {
  playSound(SOUNDS.seDamage);
  showConfirmModal(msg, () => {}, null, true);
}

/**
 * ステップを進行する（次のステップへ）
 */
function advanceStep() {
  if (!isTutorialMode()) return;
  GameState.tutorial.stepIndex++;
}

// ============================
// チュートリアルバトル開始
// ============================

/**
 * チュートリアルを開始する汎用関数
 * TUTORIAL_CONFIGSテーブルからチュートリアルIDに対応する設定を取得し、バトルを開始する
 * @param {string} tutorialId - チュートリアルID（例: 'basic_rules', 'leader_android'）
 */
export function startTutorial(tutorialId) {
  const config = TUTORIAL_CONFIGS[tutorialId];
  if (!config) {
    console.error(`[Tutorial] 未定義のチュートリアルID: ${tutorialId}`);
    return;
  }

  playSound(SOUNDS.seClick);

  // キャラクター設定
  const playerChar = JSON.parse(
    JSON.stringify(CHARACTERS[config.playerCharId])
  );
  const enemyChar = JSON.parse(JSON.stringify(CHARACTERS[config.enemyCharId]));

  // プリセットのHPをキャラクターに反映（initBattleStateでenemyConfig.hpを参照するため）
  if (config.preset.enemyHP !== undefined) {
    enemyChar.hp = config.preset.enemyHP;
  }

  GameState.playerConfig = playerChar;
  GameState.enemyConfig = enemyChar;
  GameState.gameMode = 'tutorial';
  GameState.aiLevel = 1;
  GameState.appState = 'battle';
  GameState.selectedStageId = config.stageId || 'practice';

  // チュートリアル状態を初期化
  GameState.tutorial = {
    active: true,
    id: tutorialId,
    steps: config.steps,
    stepIndex: 0,
    waitingForInput: false,
    turnPhase: null,
  };

  // バトルプリセットを設定
  GameState.battlePreset = { ...config.preset };

  // デッキ選択（ダミー）
  const handIds = config.preset.playerHand || [];
  GameState.playerDeckSelection = handIds
    .map((id) => {
      const master = CARD_MASTER.find((m) => m.id === id);
      return master ? { ...master } : null;
    })
    .filter(Boolean);
  GameState.selectedDeckIndex = 0;

  // 開始メッセージを表示してからバトルを開始
  if (config.startMessage) {
    showAlertModal(config.startMessage, () => {
      prepareBattle();
    });
  } else {
    prepareBattle();
  }
}

/** 後方互換用エイリアス */
export function startBasicRulesTutorial() {
  startTutorial('basic_rules');
}

// ============================
// チュートリアル進行制御
// ============================

/**
 * チュートリアルのメインループ
 * バトル開始後に呼び出され、ステップを順に実行していく
 */
export async function runTutorialFlow() {
  if (!isTutorialMode()) return;

  const steps = GameState.tutorial.steps;

  while (GameState.tutorial && GameState.tutorial.stepIndex < steps.length) {
    const step = steps[GameState.tutorial.stepIndex];
    if (!step) break;

    switch (step.type) {
      case 'message':
        // 勝利メッセージは、ゲームが終了する（HPが0になる）まで待機する共通ロジック
        if (
          step.id &&
          step.id.includes('victory') &&
          !GameState.isBattleEnded
        ) {
          return; // バトル終了（handleTutorialEnd）からの再開を待つ
        }

        // バトル処理の一時停止完了後に表示するメッセージの場合
        if (step.waitBattleIdle) {
          await waitForTutorialPause();
          if (!GameState.tutorial) break;
          // 召喚アニメーション等の演出完了を待ってからメッセージ表示
          await sleep(1500);
        }
        if (!GameState.tutorial) break;
        // メッセージを表示して、タップを待つ
        await showMessage(step.text);
        if (!GameState.tutorial) break;
        hideMessage();
        GameState.tutorial.stepIndex++;
        // メッセージ後に敵ターンを再開するフラグ
        if (step.resumeEnemyTurnAfter) {
          resumeTutorialEnemyTurn();
        }
        // メッセージ後に攻撃フェーズを再開するフラグ
        if (step.resumeCombatAfter) {
          resumeTutorialCombat();
        }
        await sleep(300);
        break;

      case 'selectCard':
        // プレイヤーの手札カード選択操作を待つ
        // filterHandCardClick 内で stepIndex が進む
        GameState.tutorial.waitingForInput = true;
        await waitForStepAdvance(GameState.tutorial.stepIndex);
        if (!GameState.tutorial) break;
        GameState.tutorial.waitingForInput = false;
        await sleep(200);
        break;

      case 'placeCard':
        // プレイヤーのレーン選択操作を待つ
        // filterLaneClick 内で stepIndex が進む
        if (step.targetDiscardId !== undefined) {
          GameState.tutorial.targetDiscardId = step.targetDiscardId;
          GameState.tutorial.discardBlockMessage = step.discardBlockMessage;
        }
        // 攻撃フェーズ前に一時停止するフラグを設定（敵ターン後にメッセージを出すため）
        GameState.tutorial.pauseBeforeCombat = true;
        // 敵ターン開始前にも一時停止するフラグ（カード配置＋スキル発動後にメッセージを出すため）
        if (step.pauseBeforeEnemyTurn) {
          GameState.tutorial.pauseBeforeEnemyTurn = true;
        }
        GameState.tutorial.waitingForInput = true;
        await waitForStepAdvance(GameState.tutorial.stepIndex);
        if (!GameState.tutorial) break;
        GameState.tutorial.waitingForInput = false;
        // バトル処理完了まで待機（敵ターン前 or 攻撃フェーズ前の一時停止を検出）
        await waitForTutorialPause();
        if (!GameState.tutorial) break;
        // 召喚アニメーション等の演出完了を待ってから次のメッセージへ
        await sleep(500);
        break;

      case 'useLeaderSkill': {
        // リーダースキルの実行を待つ（SP消費を検知）
        // モーダルを「閉じる」でキャンセルしても再度ボタンを押せる
        // レーン制限フラグを設定（SP消費後も配置完了まで維持）
        if (step.targetLane !== undefined) {
          GameState.tutorial.placementTargetLane = step.targetLane;
          GameState.tutorial.placementBlockMessage =
            step.placementBlockMessage || step.blockMessage;
        }
        if (Array.isArray(step.targetLanes)) {
          GameState.tutorial.placementTargetLanes = [...step.targetLanes];
          GameState.tutorial.placementBlockMessage =
            step.targetLanesBlockMessage ||
            step.placementBlockMessage ||
            step.blockMessage;
        }
        if (step.requiredEnemyTargetCount !== undefined) {
          GameState.tutorial.requiredEnemyTargetCount =
            step.requiredEnemyTargetCount;
          GameState.tutorial.targetLanesBlockMessage =
            step.targetLanesBlockMessage;
        }
        if (step.requiredDiscardCount !== undefined) {
          GameState.tutorial.requiredDiscardCount = step.requiredDiscardCount;
        }
        if (step.discardTargetCardId !== undefined) {
          GameState.tutorial.discardTargetCardId = step.discardTargetCardId;
          GameState.tutorial.discardBlockMessage = step.discardBlockMessage;
        }
        if (step.targetDiscardId !== undefined) {
          GameState.tutorial.targetDiscardId = step.targetDiscardId;
          GameState.tutorial.discardBlockMessage = step.discardBlockMessage;
        }
        const initialSP = GameState.playerSP;
        GameState.tutorial.waitingForInput = true;
        await new Promise((resolve) => {
          const check = () => {
            if (!GameState.tutorial) {
              resolve();
              return;
            }
            // SPが減った＝スキルが実際に使用された
            if (GameState.playerSP < initialSP) {
              resolve();
              return;
            }
            setTimeout(check, 200);
          };
          check();
        });
        if (!GameState.tutorial) break;
        GameState.tutorial.waitingForInput = false;
        GameState.tutorial.stepIndex++;
        // リーダースキルの演出完了を待機
        await waitForTutorialPause();
        if (!GameState.tutorial) break;
        await sleep(500);
        break;
      }

      case 'longPressBoard': {
        // 長押し待ち
        GameState.tutorial.waitingForInput = true;
        const result = await new Promise((resolve) => {
          tutorialLongPressResolver = resolve;
        });
        if (!GameState.tutorial) break;
        GameState.tutorial.waitingForInput = false;

        // 正しい対象か確認
        if (
          result.side === step.targetSide &&
          result.lane === step.targetLane
        ) {
          GameState.tutorial.stepIndex++;
        }
        // カードプレビューを閉じるまで少し待機
        await sleep(800);
        break;
      }

      case 'longPressHand': {
        // 手札の長押し待ち
        GameState.tutorial.waitingForInput = true;
        const result = await new Promise((resolve) => {
          tutorialLongPressResolver = resolve;
        });
        if (!GameState.tutorial) break;
        GameState.tutorial.waitingForInput = false;

        if (
          result.cardId === step.targetCardId ||
          result.baseId === step.targetCardId
        ) {
          GameState.tutorial.stepIndex++;
        }
        await sleep(800);
        break;
      }

      case 'end':
        // チュートリアル終了
        hideMessage();
        GameState.tutorial.active = false;
        return;

      default:
        if (!GameState.tutorial) break;
        GameState.tutorial.stepIndex++;
        break;
    }
  }
}

/**
 * 特定のステップインデックスが変わるまで待機するユーティリティ
 */
function waitForStepAdvance(currentIndex) {
  return new Promise((resolve) => {
    const check = () => {
      if (!isTutorialMode() || GameState.tutorial.stepIndex !== currentIndex) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

/**
 * チュートリアルの一時停止（pauseBeforeEnemyTurn or pauseBeforeCombat）を待機するユーティリティ
 * カード配置後のバトル処理が一時停止するまで待つ
 */
function waitForTutorialPause() {
  return new Promise((resolve) => {
    const check = () => {
      // isProcessing=falseなら、敵ターン前 or 攻撃フェーズ前の一時停止に到達している
      if (!GameState.isProcessing) {
        resolve();
      } else {
        setTimeout(check, 200);
      }
    };
    // 少し待ってからチェック開始（dispatchActionが処理キューに入る時間を確保）
    setTimeout(check, 500);
  });
}

/**
 * チュートリアルの敵ターン一時停止を解除し、敵ターンを開始する
 */
export function resumeTutorialEnemyTurn() {
  if (GameState.tutorial && GameState.tutorial.enemyTurnResumeResolver) {
    const resolve = GameState.tutorial.enemyTurnResumeResolver;
    GameState.tutorial.enemyTurnResumeResolver = null;
    resolve();
  }
}

/**
 * チュートリアルクリア情報の永続化（LocalStorage）
 */
export const TUTORIAL_PROGRESS_KEY = 'mini_card_battle_tutorial_progress';

export function loadTutorialProgress() {
  if (typeof localStorage === 'undefined') return {};
  const saved = localStorage.getItem(TUTORIAL_PROGRESS_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse tutorial progress:', e);
    }
  }
  return {};
}

export function saveTutorialProgress(progress) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
}

export function completeTutorial(tutorialId) {
  const progress = loadTutorialProgress();
  if (!progress[tutorialId]) {
    progress[tutorialId] = { isCleared: false, isRewarded: false };
  }
  progress[tutorialId].isCleared = true;
  saveTutorialProgress(progress);
}

/**
 * チュートリアル終了処理（勝利後）
 * endBattleから呼ばれる
 */
export function handleTutorialEnd() {
  if (!isTutorialMode()) return;

  // runTutorialFlow完了後にtutorialがnullになる可能性があるため、事前にIDを保存
  const tutorialId = GameState.tutorial?.id || 'basic_rules';
  const config = TUTORIAL_CONFIGS[tutorialId];
  const clearMessage =
    config?.clearMessage || 'チュートリアルをクリアしました！';

  // チュートリアルクリア状況を LocalStorage に保存
  completeTutorial(tutorialId);

  // 後続のステップ（勝利メッセージ等）をすべて実行
  runTutorialFlow().then(() => {
    GameState.tutorial = null;
    playSound(AUDIO_INSTANCES.bgmTitle);
    showAlertModal(clearMessage, () => {
      switchScreen('screen-tutorial-select');
    });
  });
}

/**
 * チュートリアルの強制終了（リタイア時に呼ばれる）
 * 全ての待機中Promiseを解決し、状態をクリーンアップする
 */
export function cleanupTutorial() {
  // 待機中のメッセージPromiseを解決
  if (tutorialMessageResolver) {
    const resolve = tutorialMessageResolver;
    tutorialMessageResolver = null;
    resolve();
  }
  // 待機中の長押しPromiseを解決
  if (tutorialLongPressResolver) {
    const resolve = tutorialLongPressResolver;
    tutorialLongPressResolver = null;
    resolve({ side: null, lane: null, cardId: null, baseId: null });
  }
  // 待機中の攻撃フェーズ再開Promiseを解決
  if (GameState.tutorial && GameState.tutorial.combatResumeResolver) {
    const resolve = GameState.tutorial.combatResumeResolver;
    GameState.tutorial.combatResumeResolver = null;
    resolve();
  }
  // 待機中の敵ターン再開Promiseを解決
  if (GameState.tutorial && GameState.tutorial.enemyTurnResumeResolver) {
    const resolve = GameState.tutorial.enemyTurnResumeResolver;
    GameState.tutorial.enemyTurnResumeResolver = null;
    resolve();
  }
  // チュートリアル状態をリセット
  GameState.tutorial = null;
  // メッセージUIを非表示
  hideMessage();
}
