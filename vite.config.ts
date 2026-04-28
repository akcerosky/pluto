import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (
            id.includes('react-markdown') ||
            id.includes('remark-math') ||
            id.includes('rehype-katex')
          ) {
            return 'markdown-renderer'
          }

          if (id.includes('katex')) {
            return 'katex'
          }

          if (id.includes('firebase/auth')) {
            return 'firebase-auth'
          }

          if (
            id.includes('firebase/firestore') ||
            id.includes('@firebase/firestore') ||
            id.includes('@firebase/webchannel-wrapper')
          ) {
            return 'firebase-firestore'
          }

          if (
            id.includes('firebase/app-check') ||
            id.includes('@firebase/app-check') ||
            id.includes('firebase/functions') ||
            id.includes('@firebase/functions')
          ) {
            return 'firebase-services'
          }

          if (id.includes('firebase/app') || id.includes('@firebase/app')) {
            return 'firebase-core'
          }

          return undefined
        },
      },
    },
  },
})
