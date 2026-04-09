/**
 * Mini Card Battle - VFX Effect Definitions
 */
export const VFX_DATA = {
    // アイギスSPスキル
    'anm_android_arts': {
        type: 'sprite',      // 演出タイプ ('sprite' または 'css')
        src: 'assets/vfx/pipo-btleffect141.png', // 画像ファイルパス
        columns: 3,          // スプライトシートの横の分割数
        rows: 10,            // スプライトシートの縦の分割数
        frameCount: 30,      // 全フレーム数
        duration: 1000,      // 再生時間（ミリ秒）
        se: 'seSkillCharge', // 再生する効果音、SOUNDSのキーを指定
        position: 'fill',    // 配置タイプ ('fill' は盤面全体、他は個別設定可)
        offsetY: 5,         // 中心位置からの上下オフセット（%指定、マイナスで上へ）
        scale: 1.0,           // サイズ倍率
        shake: true,          // 画面を揺らす
        targetSide: 'enemy'   // ターゲット (enemy: 相手陣地, self: 自分陣地)
    },

    // クロエSPスキル
    'anm_witch_arts': {
        type: 'sprite',      // 演出タイプ ('sprite' または 'css')
        src: 'assets/vfx/pipo-btleffect214_480.png', // 画像ファイルパス
        columns: 5,          // スプライトシートの横の分割数
        rows: 3,            // スプライトシートの縦の分割数
        frameCount: 15,      // 全フレーム数
        duration: 700,      // 再生時間（ミリ秒）
        se: 'seClock', // 再生する効果音、SOUNDSのキーを指定
        position: 'fill',    // 配置タイプ ('fill' は盤面全体、他は個別設定可)
        offsetY: 20,         // 中心位置からの上下オフセット（%指定、マイナスで上へ）
        scale: 0.7,           // サイズ倍率
        shake: false,          // 画面を揺らす
        targetSide: 'self'    // ターゲット (enemy: 相手陣地, self: 自分陣地)
    },


    // 以前のCSSビーム演出（統合管理用）
    'annihilation_beam': {
        type: 'css',
        className: 'beam-container',
        duration: 1500,
        se: 'seSkill',
        position: 'fill',
        offsetY: 0,
        scale: 1.0
    }

    // 今後、新しいエフェクトを追加する際はここに追加するだけでOK
};
