import type { ServerWebSocket } from 'bun';
import { watch } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    createDevBridgeScript,
    serializeMeta,
    type UserScriptMeta,
} from './meta.ts';

const PORT = 3000;
const ROOT_DIR = resolve(import.meta.dir, '..');
const SITES_DIR = join(ROOT_DIR, 'sites');
const PACKAGES_DIR = join(ROOT_DIR, 'packages');

const clients = new Set<ServerWebSocket<{ site: string }>>();

function createHmrClientCode(site: string): string {
  return `;(() => {
  const KEY = '__sora_hmr_${site}__';
  if (window[KEY]) return;
  window[KEY] = true;
  try {
    const ws = new WebSocket('ws://localhost:${PORT}/__hmr?site=${site}');
    ws.addEventListener('message', (ev) => {
      if (ev.data === 'reload') location.reload();
    });
  } catch {}
})();`;
}

async function loadSiteMeta(site: string): Promise<UserScriptMeta> {
  const metaPath = join(SITES_DIR, site, 'meta.ts');
  if (!(await Bun.file(metaPath).exists())) {
    throw new Error(`找不到站点元数据：sites/${site}/meta.ts`);
  }
  const mod = await import(`${metaPath}?t=${Date.now()}`);
  return mod.meta as UserScriptMeta;
}

async function compileSiteInMemory(site: string): Promise<string> {
  const startTime = performance.now();
  const entryPath = join(SITES_DIR, site, 'index.ts');

  if (!(await Bun.file(entryPath).exists())) {
    throw new Error(`找不到站点入口文件：sites/${site}/index.ts`);
  }

  const meta = await loadSiteMeta(site);
  const header = serializeMeta(meta);

  const result = await Bun.build({
    entrypoints: [entryPath],
    target: 'browser',
    format: 'iife',
    minify: false,
    sourcemap: 'inline',
  });

  if (!result.success) {
    const errText = result.logs.map((l) => l.message).join('\n');
    throw new Error(`编译失败：\n${errText}`);
  }

  const code = await result.outputs[0]!.text();
  const elapsed = (performance.now() - startTime).toFixed(2);
  console.info(`[JIT] 站点「${site}」实时编译完成，耗时 ${elapsed}ms`);

  return `${header}\n${code}\n${createHmrClientCode(site)}`;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function setupWatcher(dir: string) {
  watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.css'))) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.info(`[HMR] 检测到变更：${filename}，正在通知浏览器刷新...`);
      for (const ws of clients) {
        ws.send('reload');
      }
    }, 50);
  });
}

setupWatcher(SITES_DIR);
setupWatcher(PACKAGES_DIR);

Bun.serve<{ site: string }>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === '/__hmr') {
      const site = url.searchParams.get('site') ?? 'all';
      if (server.upgrade(req, { data: { site } })) return undefined;
      return new Response('WebSocket 升级失败', { status: 400 });
    }

    const devBridgeMatch = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\.dev\.user\.js$/);
    if (devBridgeMatch?.[1]) {
      const site = devBridgeMatch[1];
      const meta = await loadSiteMeta(site);
      const bridgeCode = createDevBridgeScript(meta, site, PORT);
      return new Response(bridgeCode, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    const bundleMatch = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\.user\.js$/);
    if (bundleMatch?.[1]) {
      const site = bundleMatch[1];
      try {
        const bundle = await compileSiteInMemory(site);
        return new Response(bundle, {
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[JIT Error] ${msg}`);
        return new Response(`console.error(${JSON.stringify(msg)});`, {
          status: 500,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
        });
      }
    }

    return new Response(
      'Sora JIT 网关运行中。\n开发态请在暴力猴安装：http://localhost:3000/:site.dev.user.js',
      { status: 200 }
    );
  },
  websocket: {
    open(ws) {
      clients.add(ws);
    },
    close(ws) {
      clients.delete(ws);
    },
    message() {},
  },
});

console.info(`[sora-dev] JIT 开发网关已启动！`);
console.info(`[sora-dev] 沙盒热更新桥接安装地址：http://localhost:${PORT}/playground.dev.user.js`);
console.info(`[sora-dev] 全局看图桥接安装地址：http://localhost:${PORT}/sora-lens.dev.user.js`);
