import type { BunPlugin } from 'bun';

export interface UserScriptMeta {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author?: string;
  match: string[];
  grant: string[];
  'run-at'?: 'document-start' | 'document-body' | 'document-end' | 'document-idle';
  connect?: string[];
  noframes?: boolean;
  'inject-into'?: 'page' | 'content' | 'auto';
}

export function serializeMeta(meta: UserScriptMeta): string {
  const lines: string[] = ['// ==UserScript=='];
  const pushLine = (key: string, val: string) => {
    lines.push(`// @${key.padEnd(14, ' ')} ${val}`);
  };

  pushLine('name', meta.name);
  pushLine('namespace', meta.namespace);
  pushLine('version', meta.version);
  pushLine('description', meta.description);
  pushLine('author', meta.author ?? 'sora');

  for (const m of meta.match) pushLine('match', m);
  for (const g of meta.grant) pushLine('grant', g);
  for (const c of meta.connect ?? []) pushLine('connect', c);

  if (meta['run-at']) pushLine('run-at', meta['run-at']);
  if (meta.noframes) lines.push('// @noframes');

  if (meta['inject-into']) pushLine('inject-into', meta['inject-into']);

  lines.push('// ==/UserScript==');
  return lines.join('\n');
}

export function createDevBridgeScript(meta: UserScriptMeta, site: string, port: number): string {
  const grants = Array.from(
    new Set([
      ...meta.grant,
      'GM_xmlhttpRequest',
      'GM_addElement',
      'GM_getValue',
      'GM_setValue',
      'GM_addValueChangeListener',
      'GM_removeValueChangeListener',
    ])
  );
  const connects = Array.from(new Set([...(meta.connect ?? []), 'localhost', '127.0.0.1']));

  const devMeta: UserScriptMeta = {
    ...meta,
    name: `[DEV] ${meta.name}`,
    grant: grants,
    connect: connects,
  };

  return `${serializeMeta(devMeta)}
(() => {
  const url = 'http://localhost:${port}/${site}.user.js?t=' + Date.now();
  GM_xmlhttpRequest({
    method: 'GET',
    url,
    headers: { 'Cache-Control': 'no-cache' },
    onload(res) {
      if (res.status !== 200) {
        console.error('[sora-dev] 拉取编译产物失败：', res.status);
        return;
      }
      try {
        const run = new Function(
          'GM_getValue',
          'GM_setValue',
          'GM_addValueChangeListener',
          'GM_removeValueChangeListener',
          'GM_xmlhttpRequest',
          res.responseText
        );
        run(
          typeof GM_getValue !== 'undefined' ? GM_getValue : undefined,
          typeof GM_setValue !== 'undefined' ? GM_setValue : undefined,
          typeof GM_addValueChangeListener !== 'undefined' ? GM_addValueChangeListener : undefined,
          typeof GM_removeValueChangeListener !== 'undefined' ? GM_removeValueChangeListener : undefined,
          typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : undefined
        );
      } catch {
        if (typeof GM_addElement === 'function') {
          GM_addElement(document.head || document.documentElement, 'script', {
            textContent: res.responseText,
          });
        }
      }
    },
    onerror(err) {
      console.error('[sora-dev] 无法连接本地 Bun JIT 网关，请确认 bun run dev 正在运行', err);
    }
  });
})();
`;
}

export const inlineTemplateMinifierPlugin: BunPlugin = {
  name: 'sora-inline-template-minifier',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      let source = await Bun.file(args.path).text();
      // 加上 \b 确保匹配的是独立的 html/css 标签函数
      source = source.replace(
        /\b(html|css)`([\s\S]*?)`/g,
        (_full, tag: string, content: string) => {
          let minified = content;
          if (tag === 'css') {
            minified = minified
              .replace(/\/\*[\s\S]*?\*\//g, '') // 移除 CSS 注释
              .replace(/\s+/g, ' ')
              .replace(/\s*([{}:;,>+~])\s*/g, '$1') // 移除符号两侧空格
              .trim();
          } else if (tag === 'html') {
            // HTML 压缩相对保守，避免破坏属性内的空格
            minified = minified
              .replace(/<!--[\s\S]*?-->/g, '') // 移除 HTML 注释
              .replace(/>\s+</g, '><') // 移除标签之间的空白
              .trim();
          }
          return `${tag}\`${minified}\``;
        }
      );
      return { contents: source, loader: 'ts' };
    });
  },
};
