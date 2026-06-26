import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isLibBuild = process.env.BUILD_MODE === 'lib'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  root: '.',
  server: {
    open: true,
  },
  ...(isLibBuild
    ? {
        build: {
          lib: {
            entry: 'src/index.ts',
            formats: ['es'] as const,
            fileName: 'index',
          },
          rollupOptions: {
            external: ['react', 'react-dom', '@tanstack/react-virtual', 'minisearch', 'idb'],
          },
        },
      }
    : {
        build: {
          outDir: 'dist-demo',
          rollupOptions: {
            input: 'index.html',
          },
        },
      }),
})
