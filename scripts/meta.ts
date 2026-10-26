// scripts/meta.ts
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
  'inject-into'?: 'page' | 'content' | 'auto';
  connect?: string[];
  require?: string[];
  resource?: string[];
  noframes?: boolean;
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
  for (const r of meta.require ?? []) pushLine('require', r);
  for (const res of meta.resource ?? []) pushLine('resource', res);

  if (meta['run-at']) pushLine('run-at', meta['run-at']);
  if (meta['inject-into']) pushLine('inject-into', meta['inject-into']);
  if (meta.noframes) lines.push('// @noframes');

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

export function minifyCssString(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~])\s*/g, '$1')
    .trim();
}

export function minifyHtmlChunk(chunk: string): string {
  return chunk
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s+>/g, '>');
}

export function minifyTaggedTemplatesInSource(source: string): string {
  const tagRe = /\b(html|css)`/g;
  let result = '';
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: exec 循环惯用写法，赋值与判空合并
  while ((match = tagRe.exec(source)) !== null) {
    const tag = match[1]!;
    const startBacktick = match.index + tag.length;
    result += source.slice(lastIdx, startBacktick + 1);

    let i = startBacktick + 1;
    let chunkStart = i;

    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '$' && source[i + 1] === '{') {
        const rawChunk = source.slice(chunkStart, i);
        result += tag === 'css' ? minifyCssString(rawChunk) : minifyHtmlChunk(rawChunk);
        result += '${';
        i += 2;

        let braceDepth = 1;
        const exprStart = i;
        while (i < source.length && braceDepth > 0) {
          const c = source[i];
          if (c === '\\') {
            i += 2;
            continue;
          }
          if (c === '{') braceDepth++;
          else if (c === '}') braceDepth--;
          else if (c === "'" || c === '"' || c === '`') {
            const quote = c;
            i++;
            while (i < source.length && source[i] !== quote) {
              if (source[i] === '\\') i++;
              i++;
            }
          }
          i++;
        }
        const innerExpr = source.slice(exprStart, i - 1);
        result += `${minifyTaggedTemplatesInSource(innerExpr)}}`;
        chunkStart = i;
        continue;
      }
      if (ch === '`') {
        const rawChunk = source.slice(chunkStart, i);
        result += tag === 'css' ? minifyCssString(rawChunk) : minifyHtmlChunk(rawChunk);
        result += '`';
        i++;
        break;
      }
      i++;
    }

    lastIdx = i;
    tagRe.lastIndex = i;
  }

  result += source.slice(lastIdx);
  return result;
}

export const inlineTemplateMinifierPlugin: BunPlugin = {
  name: 'sora-inline-template-minifier',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const rawCss = await Bun.file(args.path).text();
      const minified = minifyCssString(rawCss);
      return {
        contents: `export default ${JSON.stringify(minified)};`,
        loader: 'js',
      };
    });

    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      return {
        contents: minifyTaggedTemplatesInSource(source),
        loader: 'ts',
      };
    });
  },
};
