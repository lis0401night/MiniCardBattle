/**
 * ツール専用ハンバーガーメニューの各ツール情報定義一覧
 */
export const TOOL_NAV_ITEMS = [
  {
    id: 'cardscore',
    name: 'Card Evaluator',
    desc: '高度なデッキ分析システム',
    icon: '📊',
    path: '/tool/cardscore.html',
  },
  {
    id: 'playerdata',
    name: 'Player Data Viewer',
    desc: '全プレイヤーデータ閲覧',
    icon: '👤',
    path: '/tool/playerdata.html',
  },
  {
    id: 'card_sheet',
    name: 'Card Sheet Tool',
    desc: 'カードシート表示ツール',
    icon: '🃏',
    path: '/tool/card_sheet.html',
  },
  {
    id: 'admin_news',
    name: 'お知らせ管理画面',
    desc: 'ニュース編集・配信設定',
    icon: '📰',
    path: '/tool/admin_news.html',
  },
  {
    id: 'chara_assetmaker',
    name: 'キャラアセット書き出し',
    desc: '画像リサイズ・アセット切出',
    icon: '🎨',
    path: '/tool/chara_assetmaker/index.html',
  },
  {
    id: 'vfx_spritesheet_tool',
    name: 'VFX スプライトシート作成',
    desc: '連番/GIF/動画からシート作成',
    icon: '🎬',
    path: '/tool/vfx_spritesheet_tool/vfx_spritesheet_tool.html',
  },
];
