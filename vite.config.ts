import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // GitHub Pages 프로젝트 경로 (/airpick2-b-to-b/). 로컬·Firebase Hosting은 '/'
  const base =
    process.env.GITHUB_PAGES === 'true' ? '/airpick2-b-to-b/' : '/';
  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Capacitor WebView (Chromium) — 너무 최신 문법만 쓰면 구형 WebView에서 흰 화면
      target: ['es2020', 'chrome90'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
