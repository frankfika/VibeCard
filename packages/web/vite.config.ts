import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type PluginOption } from 'vite';
import { compression } from 'vite-plugin-compression2';
import { spawn, type ChildProcess } from 'node:child_process';
import { request as httpRequest, type IncomingMessage, type ServerResponse, type RequestOptions } from 'node:http';
import net from 'node:net';

const NAMECARD_SERVER_PORT = Number(process.env.NAMECARD_SERVER_PORT || 3001);
const NAMECARD_SERVER_SCRIPT = path.resolve(__dirname, 'server.js');

/**
 * In dev, spawn packages/web/server.js as a child process and proxy /api/*
 * to it. Avoids forcing the developer to run two terminals.
 *
 * Skipped when DISABLE_NAMECARD_SERVER=1 (e.g. when an external reverse
 * proxy or production deployment already serves /api).
 */
function namecardServerPlugin(): PluginOption {
  let child: ChildProcess | null = null;
  return {
    name: 'vibecard:namecard-server',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.DISABLE_NAMECARD_SERVER === '1') return;
      if (await isPortFree(NAMECARD_SERVER_PORT)) {
        child = spawn(process.execPath, [NAMECARD_SERVER_SCRIPT], {
          stdio: 'inherit',
          env: { ...process.env, PORT: String(NAMECARD_SERVER_PORT) },
        });
        child.on('exit', (code) => {
          console.log(`[namecard-server] exited with code ${code}`);
        });
        server.httpServer?.on('close', () => {
          child?.kill('SIGTERM');
          child = null;
        });
      } else {
        console.log(`[namecard-server] port ${NAMECARD_SERVER_PORT} busy, assuming external server is running`);
      }
      // Proxy /api/* to the namecard server (works whether the server
      // was just spawned or already running externally).
      // vite strips the mount path before invoking the middleware, so
      // we re-prepend /api when forwarding upstream.
      server.middlewares.use('/api', (req, res, next) => {
        const target = `http://localhost:${NAMECARD_SERVER_PORT}`;
        proxyHttp(req, res, target, '/api', next);
      });
    },
  };
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

function proxyHttp(
  req: IncomingMessage,
  res: ServerResponse,
  target: string,
  prefix: string,
  next: (err?: unknown) => void,
) {
  const url = new URL((req.url || '/').replace(/^\/?/, '/'), target);
  // re-prepend the stripped mount path so the upstream sees /api/...
  url.pathname = prefix.replace(/\/$/, '') + (url.pathname === '/' ? '' : url.pathname);
  const opts: RequestOptions = {
    method: req.method,
    headers: { ...req.headers, host: new URL(target).host },
  };
  const upstream = httpRequest(url, opts, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', next);
  req.pipe(upstream);
}

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      namecardServerPlugin(),
      compression({ algorithms: ['brotliCompress'], exclude: [/\.(br)$/, /\.(gz)$/] }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      sourcemap: mode === 'development',
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'motion'],
            utils: ['html-to-image', 'qrcode'],
          },
        },
      },
    },
  };
});
