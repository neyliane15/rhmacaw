/**
 * Build da demonstracao publicada: a aplicacao inteira, mais o servidor, num
 * pacote que roda sem rede.
 *
 * Os `alias` trocam os modulos de Node pelos substitutos do navegador, o que
 * permite empacotar os routers, servicos, repositorios e migracoes REAIS do
 * servidor sem alterar uma linha deles.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const daRaiz = (caminho: string): string => fileURLToPath(new URL(caminho, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // `config.ts` do servidor le variaveis de ambiente; no navegador nao ha nenhuma.
    'process.env': '{}',
    'process.platform': '"browser"',
  },
  resolve: {
    alias: [
      { find: '@rhmacaw/shared', replacement: daRaiz('../packages/shared/src/index.ts') },
      { find: '@', replacement: daRaiz('./src') },
      // Substitutos dos modulos de Node e das bibliotecas de servidor.
      { find: /^node:path$/, replacement: daRaiz('./src/demo/shims/path.ts') },
      { find: /^node:fs$/, replacement: daRaiz('./src/demo/shims/fs.ts') },
      { find: /^node:url$/, replacement: daRaiz('./src/demo/shims/url.ts') },
      { find: /^node:os$/, replacement: daRaiz('./src/demo/shims/os.ts') },
      { find: /^express$/, replacement: daRaiz('./src/demo/shims/express.ts') },
      { find: /^jsonwebtoken$/, replacement: daRaiz('./src/demo/shims/jwt.ts') },
      { find: /^better-sqlite3$/, replacement: daRaiz('./src/demo/shims/vazio.ts') },
      { find: /^cors$/, replacement: daRaiz('./src/demo/shims/vazio.ts') },
    ],
  },
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: daRaiz('./demo.html'),
    },
  },
});
