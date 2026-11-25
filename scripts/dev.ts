// scripts/dev.ts

import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import {
  createDevBridgeScript,
  inlineAssetMinifierPlugin,
  serializeMeta,
  type UserScriptMeta,
} from './meta.ts';

const PORT = 3000;
const ROOT_DIR = resolve(import.meta.dir, '..');
const SITES_DIR = join(ROOT_DIR, 'sites');
const PACKAGES_DIR = join(ROOT_DIR, 'packages');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
} as const;

// * 按站点分组管理热更新轮询连接，改了哪个站点就只刷新哪个站点
const pollWaitersBySite = new Map<string, Set<(res: Response) => void>>();
const tsTranspiler = new Bun.Transpiler({ loader: 'ts' });

function getSiteWaiters(site: string): Set<(res: Response) => void> {
  let set = pollWaitersBySite.get(site);
  if (!set) {
    set = new Set();
    pollWaitersBySite.set(site, set);
  }
  return set;
}

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

// * 用内存转译读取站点 meta 配置，避免反复 import(?t=...) 造成模块缓存一直上涨
async function loadSiteMeta(site: string): Promise<UserScriptMeta> {
  const metaPath = join(SITES_DIR, site, 'meta.ts');
  const file = Bun.file(metaPath);
  if (!(await file.exists())) {
    throw new Error(`找不到站点元数据：sites/${site}/meta.ts`);
  }
  const source = await file.text();
  const jsCode = tsTranspiler.transformSync(source);
  const body = jsCode
    .replace(/\bexport\s+const\s+meta\s*=/g, 'const meta =')
    .replace(/\bexport\s+\{[^}]*\};?/g, '');
  const evaluate = new Function(`${body}\nreturn meta;`) as () => UserScriptMeta;
  return evaluate();
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
    plugins: [inlineAssetMinifierPlugin],
    minify: false,
    sourcemap: 'inline',
  });

  if (!result.success) {
    const errText = result.logs.map((l) => l.message).join('\n');
    throw new Error(`编译失败：\n${errText}`);
  }

  const output = result.outputs[0];
  if (!output) {
    throw new Error('编译没有生成输出文件');
  }

  const code = await output.text();
  const elapsed = (performance.now() - startTime).toFixed(2);
  console.info(`[JIT] 站点「${site}」实时编译完成，耗时 ${elapsed}ms`);

  return `${header}\n${code}\n${createHmrClientCode(site)}`;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const dirtySites = new Set<string>();
let dirtyAll = false;

function notifyChangedWaiters(): void {
  const targets = dirtyAll ? Array.from(pollWaitersBySite.keys()) : Array.from(dirtySites);
  dirtyAll = false;
  dirtySites.clear();

  for (const site of targets) {
    const waiters = pollWaitersBySite.get(site);
    if (!waiters || waiters.size === 0) continue;
    for (const resolvePoll of waiters) {
      resolvePoll(
        new Response('reload', {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Cache-Control': 'no-cache, no-store',
          },
        })
      );
    }
    waiters.clear();
  }
}

function setupWatcher(dir: string, scope: 'sites' | 'packages') {
  watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.css'))) return;

    if (scope === 'packages') {
      dirtyAll = true;
    } else {
      const siteName = filename.split(sep)[0];
      if (siteName) dirtySites.add(siteName);
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.info(`[HMR] 检测到文件改动：${filename}，正在通知对应页面刷新...`);
      notifyChangedWaiters();
    }, 50);
  });
}

setupWatcher(SITES_DIR, 'sites');
setupWatcher(PACKAGES_DIR, 'packages');

Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (url.pathname === '/__hmr_poll') {
      const site = url.searchParams.get('site') || 'default';
      const waiters = getSiteWaiters(site);
      return new Promise<Response>((resolvePoll) => {
        waiters.add(resolvePoll);
        setTimeout(() => {
          if (waiters.has(resolvePoll)) {
            waiters.delete(resolvePoll);
            resolvePoll(
              new Response('keepalive', {
                status: 200,
                headers: CORS_HEADERS,
              })
            );
          }
        }, 25000);
      });
    }

    const devBridgeMatch = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\.dev\.user\.js$/);
    if (devBridgeMatch?.[1]) {
      const site = devBridgeMatch[1];
      try {
        const meta = await loadSiteMeta(site);
        const bridgeCode = createDevBridgeScript(meta, site, PORT);
        return new Response(bridgeCode, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(msg, { status: 404, headers: CORS_HEADERS });
      }
    }

    const bundleMatch = url.pathname.match(/^\/([a-zA-Z0-9_-]+)\.user\.js$/);
    if (bundleMatch?.[1]) {
      const site = bundleMatch[1];
      try {
        const bundle = await compileSiteInMemory(site);
        return new Response(bundle, {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[JIT Error] ${msg}`);
        return new Response(`console.error(${JSON.stringify(msg)});`, {
          status: 500,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/javascript; charset=utf-8',
          },
        });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
});

const siteEntries = await readdir(SITES_DIR, { withFileTypes: true });
const siteNames = siteEntries.filter((e) => e.isDirectory()).map((e) => e.name);

console.info('[sora-dev] 本地开发服务已启动，在油猴插件中打开以下链接即可安装：');
for (const site of siteNames) {
  console.info(`  -> [${site}] http://localhost:${PORT}/${site}.dev.user.js`);
}
