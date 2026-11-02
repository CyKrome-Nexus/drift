import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Tauri expects a fixed port and fails rather than silently picking another one.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    // Three pages: the app, the one each desktop wallpaper window loads, and the tray popover.
    rollupOptions: { input: { main: 'index.html', wallpaper: 'wallpaper.html', tray: 'tray.html' } },
  },
});
