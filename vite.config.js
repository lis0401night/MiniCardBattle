import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'api',
          dest: '.',
        },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: './index.html',
        cardscore: './tool/cardscore.html',
        playerdata: './tool/playerdata.html',
        card_sheet: './tool/card_sheet.html',
        admin_news: './tool/admin_news.html',
        chara_assetmaker: './tool/chara_assetmaker/index.html',
        vfx_spritesheet_tool:
          './tool/vfx_spritesheet_tool/vfx_spritesheet_tool.html',
      },
      output: {
        /**
         * モジュール分割（チャンク分割）関数
         * Vite 8 (Rolldown) および Rollup との互換性のため関数形式で指定
         * @param {string} id モジュールの絶対パス
         * @returns {string|undefined} チャンク名
         */
        manualChunks(id) {
          const normalizedPath = id.replace(/\\/g, '/');
          if (
            normalizedPath.includes('node_modules/react/') ||
            normalizedPath.includes('node_modules/react-dom/')
          ) {
            return 'vendor';
          }
          if (
            normalizedPath.includes('/src/services/uiMainCore.js') ||
            normalizedPath.includes('/src/services/uiDialogue.js') ||
            normalizedPath.includes('/src/services/deck.js') ||
            normalizedPath.includes('/src/game/battle/index.js') ||
            normalizedPath.includes('/src/game/battleDungeon.js') ||
            normalizedPath.includes('/src/utils/constants/battleDungeon.js') ||
            normalizedPath.includes(
              '/src/utils/constants/battleDungeonCharacter.js'
            )
          ) {
            return 'gameCore';
          }
        },
      },
    },
  },
});
