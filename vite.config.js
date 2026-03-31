import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'api',
          dest: '.'
        }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: './index.html',
        cardscore: './cardscore.html'
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          gameCore: [
            './src/hooks/uiMainCore.js',
            './src/hooks/uiDialogue.js',
            './src/hooks/deck.js',
            './src/hooks/battle.js',
            './src/hooks/battleDungeon.js',
            './src/utils/constants/battleDungeon.js',
            './src/utils/constants/battleDungeonCharacter.js'
          ]
        }
      }
    }
  }
})
