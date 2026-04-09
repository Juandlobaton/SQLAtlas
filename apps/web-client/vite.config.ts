import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dns from 'dns';

// Fix Node 20 IPv6-first DNS resolution that breaks Vite proxy
dns.setDefaultResultOrder('ipv4first');

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
      port: 9100,
      proxy: isDemo ? undefined : {
        '/api': {
          target: env.VITE_API_URL || 'http://127.0.0.1:9200',
          changeOrigin: true,
        },
        '/parse': {
          target: env.VITE_PARSER_URL || 'http://127.0.0.1:9300',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/parse/, ''),
        },
      },
    },
  };
});
