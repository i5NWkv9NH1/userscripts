// scripts/dev.ts

import type { ServerWebSocket } from 'bun';
import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  createDevBridgeScript,
  inlineTemplateMinifierPlugin,
  serializeMeta,
  type UserScriptMeta,
} from './meta.ts';

const PORT = 3000;
const ROOT_DIR = resolve(import.meta.dir, '..');
const SITES_DIR = join(ROOT_DIR, 'sites');
const PACKAGES_DIR = join(ROOT_DIR, 'packages');

const clients = new Set<ServerWebSocket<{ site: string }>>();

const pollWaiters = new Set<(res: Response) => void>();

function createHmrClientCode(site: string): string {
  return `;(() => {
  const KEY = '__sora_hmr_${site}__';
  if (window[KEY] || typeof GM_xmlhttpRequest !== 'function') return;
  window[KEY] = true;
  const poll = () => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'http://localhost:${PORT}/__hmr_poll?site=${site}&t=' + Date.now(),
      onload(res) {
        if (res.status === 200 && res.responseText === 'reload') {
          location.reload();
        } else {
          setTimeout(poll, 300);
        }
      },
      onerror() {
        setTimeout(poll, 2000);
      }
    });
  };
  poll();
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
  const header = serializeMeta(meta, join(SITES_DIR, site));

  const result = await Bun.build({
    entrypoints: [entryPath],
    target: 'browser',
    format: 'iife',
    plugins: [inlineTemplateMinifierPlugin],
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
      for (const resolvePoll of pollWaiters) {
        resolvePoll(
          new Response('reload', {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache, no-store',
            },
          })
        );
      }
      pollWaiters.clear();
    }, 50);
  });
}

setupWatcher(SITES_DIR);
setupWatcher(PACKAGES_DIR);

Bun.serve<{ site: string }>({
  port: PORT,
  async fetch(req, _server) {
    const url = new URL(req.url);

    if (url.pathname === '/__hmr_poll') {
      return new Promise<Response>((resolvePoll) => {
        pollWaiters.add(resolvePoll);
        setTimeout(() => {
          if (pollWaiters.has(resolvePoll)) {
            pollWaiters.delete(resolvePoll);
            resolvePoll(
              new Response('keepalive', {
                headers: { 'Access-Control-Allow-Origin': '*' },
              })
            );
          }
        }, 25000);
      });
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

const siteEntries = await readdir(SITES_DIR, { withFileTypes: true });
const siteNames = siteEntries.filter((e) => e.isDirectory()).map((e) => e.name);

console.info(`[sora-dev] JIT 开发网关已启动！（按住 Alt/Cmd + 鼠标左键即可直接安装）`);
for (const site of siteNames) {
  console.info(`  -> [${site}] http://localhost:${PORT}/${site}.dev.user.js`);
}
