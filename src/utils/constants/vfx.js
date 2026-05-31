/**
 * Mini Card Battle - VFX Effect Definitions
 */
export const VFX_DATA = {
  // アイギスSPスキル
  anm_android_arts: {
    type: 'sprite', // 演出タイプ ('sprite' または 'css')
    src: 'assets/vfx/pipo-btleffect141.png', // 画像ファイルパス
    columns: 3, // スプライトシートの横の分割数
    rows: 10, // スプライトシートの縦の分割数
    frameCount: 30, // 全フレーム数
    duration: 1000, // 再生時間（ミリ秒）
    se: 'seSkillCharge', // 再生する効果音、SOUNDSのキーを指定
    position: 'fill', // 配置タイプ ('fill' は盤面全体、他は個別設定可)
    offsetY: -10, // 中心位置からの上下オフセット（%指定、マイナスで上へ）
    scale: 1.0, // サイズ倍率
    shake: true, // 画面を揺らす
    targetSide: 'enemy', // ターゲット (enemy: 相手陣地, self: 自分陣地)
  },

  // クロエSPスキル
  anm_witch_arts: {
    type: 'sprite', // 演出タイプ ('sprite' または 'css')
    src: 'assets/vfx/pipo-btleffect211_192.png', // 画像ファイルパス
    columns: 5, // スプライトシートの横の分割数
    rows: 3, // スプライトシートの縦の分割数
    frameCount: 15, // 全フレーム数
    duration: 700, // 再生時間（ミリ秒）
    se: 'seClock', // 再生する効果音、SOUNDSのキーを指定
    position: 'fill', // 配置タイプ ('fill' は盤面全体、他は個別設定可)
    offsetY: 0, // 中心位置からの上下オフセット（%指定、マイナスで上へ）
    scale: 1.0, // サイズ倍率
    shake: false, // 画面を揺らす
    targetSide: 'self', // ターゲット (enemy: 相手陣地, self: 自分陣地)
  },

  // 以前のCSSビーム演出（統合管理用）
  annihilation_beam: {
    type: 'css',
    className: 'beam-container',
    duration: 1500,
    se: 'seSkill',
    position: 'fill',
    offsetY: 0,
    scale: 1.0,
  },

  // リナSPスキル（サンプル）
  anm_elf_arts: {
    type: 'sprite',
    src: 'assets/vfx/hujimiyaeffect_snipe.png', // 適宜書き換えてください
    columns: 7,
    rows: 7,
    frameCount: 49,
    duration: 1200,
    se: 'seSkillCharge', // 再生する効果音、SOUNDSのキーを指定
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 1,
    shake: false,
    flipOnEnemy: false, // 敵が使用した際に上下反転させる
    targetSide: 'enemy', // 相手のレーンがターゲット
  },

  // ネフティSPスキル「王墓の呪縛」用VFX
  anm_dark_magic: {
    type: 'sprite',
    src: 'assets/vfx/hujimiyaeffect_shadowattack.png', // 暗黒魔法エフェクト
    columns: 6,
    rows: 5,
    frameCount: 30,
    duration: 800,
    se: 'seSkillCharge', // 再生する効果音、SOUNDSのキーを指定
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 1,
    shake: true,
    flipOnEnemy: false,
    targetSide: 'enemy', // 相手のレーンがターゲット
  },

  // イグニス召喚用VFX
  anm_summon_ignis: {
    type: 'sprite',
    src: 'assets/vfx/hujimiyaeffect_framecircle.png',
    columns: 7,
    rows: 10,
    frameCount: 70,
    duration: 1000,
    se: 'seSkillCharge',
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 1.0,
    shake: true,
    targetSide: 'self', // 自陣に召喚
  },

  // セレスティア召喚用VFX
  anm_summon_celestia: {
    type: 'sprite',
    src: 'assets/vfx/hujimiyaeffect_attackburst.png',
    columns: 7,
    rows: 7,
    frameCount: 49,
    duration: 500,
    se: 'seMetalBlast',
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 0.6,
    shake: false,
    targetSide: 'self', // 自陣に召喚
  },

  // マリア召喚用VFX
  anm_summon_maria: {
    type: 'sprite',
    src: 'assets/vfx/pipo-btleffect050t.png',
    columns: 10,
    rows: 1,
    frameCount: 10,
    duration: 600,
    se: 'seFire',
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: -10,
    scale: 1.0,
    shake: false,
    targetSide: 'self', // 自陣に召喚
  },

  // エリシアSPスキル「暗黒の儀式」用VFX
  anm_god_flame: {
    type: 'sprite',
    src: 'assets/vfx/hujimiyaeffect_shineattack.png',
    columns: 7,
    rows: 7,
    frameCount: 49,
    duration: 1000,
    se: 'seSkillCharge', // 再生する効果音、SOUNDSのキーを指定
    position: 'hp', // HPゲージの高さに合わせて表示
    offsetY: 0,
    scale: 1.5,
    shake: true,
    targetSide: 'enemy', // 基本は相手のHPがターゲット
  },

  // ナイアSPスキル「深淵の儀式」用VFX
  anm_abyss_ritual: {
    type: 'sprite',
    src: 'assets/vfx/pipo-mapeffect016_640.png',
    columns: 4,
    rows: 5,
    frameCount: 20,
    duration: 1000,
    se: 'seSkillCharge',
    position: 'hp', // HPゲージの高さに合わせて表示
    offsetY: 0,
    scale: 2.0,
    shake: false,
    targetSide: 'self', // 手札入れ替え(自分への効果)のため、自分のHPゲージ位置
  },

  // カグラSPスキル「封印の儀」用VFX
  anm_seal_lanes: {
    type: 'sprite',
    src: 'assets/vfx/pipo-btleffect018.png',
    columns: 8,
    rows: 1,
    frameCount: 8,
    duration: 800,
    se: 'seHyoushigi',
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 0.6,
    shake: true,
    targetSide: 'enemy', // 相手のレーンがターゲット
  },

  // 有毒スキル用VFX
  anm_skill_toxic: {
    type: 'sprite',
    src: 'assets/vfx/vfx_skill_toxic.png',
    columns: 8,
    rows: 1,
    frameCount: 8,
    duration: 800,
    se: 'seSkillToxic', // 再生する効果音、SOUNDSのキーを指定
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 0.5,
    shake: false,
    targetSide: 'enemy', // 相手のレーンがターゲット
  },

  // 凍結スキル用VFX
  anm_skill_freeze: {
    type: 'sprite',
    src: 'assets/vfx/vfx_skill_freeze.png',
    columns: 8,
    rows: 1,
    frameCount: 8,
    duration: 800,
    se: 'seSkillFreeze',
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 0.5,
    shake: false,
    targetSide: 'enemy', // 相手のレーンがターゲット
  },

  // 狙撃スキル用VFX
  anm_skill_snipe: {
    type: 'sprite',
    src: 'assets/vfx/vfx_skill_snipe.png',
    columns: 5,
    rows: 2,
    frameCount: 10,
    duration: 600,
    se: 'seSkillSnipe',
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 0.5,
    shake: false,
    flipOnEnemy: true, // 手前の自分カードに当たるとき（敵が発動したとき）に上下反転させる
    targetSide: 'enemy', // 相手のレーンがターゲット
  },

  // 拘束スキル用VFX
  anm_skill_bind: {
    type: 'sprite',
    src: 'assets/vfx/vfx_skill_bind.png',
    columns: 3,
    rows: 5,
    frameCount: 15,
    duration: 800,
    se: 'seSkillBind', // 再生する効果音、SOUNDSのキーを指定
    position: 'lane', // ターゲットのレーンに合わせて表示
    offsetY: 0,
    scale: 0.5,
    shake: false,
    flipOnEnemy: true, // 手前の自分カードに当たるとき（敵が発動したとき）に上下反転させる
    targetSide: 'enemy', // 相手のレーンがターゲット
  },

  // 今後、新しいエフェクトを追加する際はここに追加するだけでOK
};
