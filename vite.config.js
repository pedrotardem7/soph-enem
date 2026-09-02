import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Necessário para o site funcionar quando hospedado no GitHub Pages
  base: './',
})
