import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'https://api.cam.faeznz.my.id'),
    'import.meta.env.VITE_WSS_URL': JSON.stringify(process.env.VITE_WSS_URL || 'wss://api.cam.faeznz.my.id/ws'),
  },
})
