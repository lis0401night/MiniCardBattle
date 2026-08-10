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
        manualChunks: {
          vendor: ['react', 'react-dom'],
          gameCore: [
            './src/services/uiMainCore.js',
            './src/services/uiDialogue.js',
            './src/services/deck.js',
            './src/game/battle/index.js',
            './src/game/battleDungeon.js',
            './src/utils/constants/battleDungeon.js',
            './src/utils/constants/battleDungeonCharacter.js',
          ],
        },
      },
    },
  },
});
