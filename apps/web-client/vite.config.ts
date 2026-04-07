import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isDemo = env.VITE_DEMO_MODE === 'true';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_DEMO_MODE': JSON.stringify(env.VITE_DEMO_MODE || 'false'),
      '__IS_DEMO__': 'true',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '#router': path.resolve(__dirname, isDemo ? './src/app/router.demo.tsx' : './src/app/router.tsx'),
      },
    },
    build: {
      sourcemap: false,
    },
    server: {
      port: 5173,
      proxy: isDemo ? {} : {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
        '/parse': {
          target: env.VITE_PARSER_URL || 'http://localhost:8100',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/parse/, ''),
        },
      },
    },
  };
});
