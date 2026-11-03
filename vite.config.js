import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// VITE_USE_SHIM=1 swaps Supabase for an in-browser Postgres (used only by the automated UI tests).
const shim = process.env.VITE_USE_SHIM === '1'
export default defineConfig({
  base: './',                       // works from any GitHub Pages sub-path
  plugins: [react()],
  resolve: shim ? { alias: { '@supabase/supabase-js': fileURLToPath(new URL('./tests/shim/supabase-shim.js', import.meta.url)) } } : {},
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { chunkSizeWarningLimit: 1500 },
})
