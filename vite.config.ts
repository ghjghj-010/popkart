import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 如果您的仓库名称不是"aiKart"，请替换为您的实际仓库名称
  base: '/popkart/'
})
