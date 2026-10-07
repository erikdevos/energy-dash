import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// De API (prijzen, PVGIS, Chargee) draait als aparte Node-server op poort 5174.
export default defineConfig({
  plugins: [react()],
  server: {
    // Vaste poort: draait het dashboard al, dan liever een duidelijke fout dan stil uitwijken naar een andere poort.
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5174',
    },
  },
})
