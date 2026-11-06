import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * O `navigateFallbackDenylist` nao e detalhe: sem ele o service worker
 * responderia `/api/*` com o HTML do app quando estivesse offline. O cliente
 * receberia HTML onde esperava JSON e trataria isso como sessao expirada,
 * mandando voce fazer login por causa de uma falha de rede.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', e nao 'autoUpdate': atualizar sozinho recarregava a pagina no meio de
      // um lancamento. O app avisa ("Nova versao disponivel") e a pessoa escolhe a hora.
      // O registro do service worker mora em `src/lib/versao.ts`.
      registerType: 'prompt',
      includeAssets: ['icone-192.png', 'icone-512.png', 'icone-maskable.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: 'Compras',
        short_name: 'Compras',
        description: 'Registro pessoal de compras, com ou sem detalhe de itens.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        // O manifesto aceita UMA cor, e ela pinta a tela de abertura antes de
        // o app saber o tema. Fica a escura; depois de aberto, as `theme-color`
        // do `index.html` assumem. Sem `orientation`: travar em retrato impede
        // quem usa o app num suporte ou num teclado fisico (WCAG 1.3.4).
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    },
  },
  build: { outDir: 'dist' },
});
