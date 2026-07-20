import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
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
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: './index.html',
        cardscore: './cardscore.html',
        playerdata: './playerdata.html',
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          gameCore: [
            './src/services/uiMainCore.js',
            './src/services/uiDialogue.js',
            './src/services/deck.js',
            './src/game/battle.js',
            './src/game/battleDungeon.js',
            './src/utils/constants/battleDungeon.js',
            './src/utils/constants/battleDungeonCharacter.js',
          ],
        },
      },
    },
  },
});
