// scripts/meta.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BunPlugin } from 'bun';

export interface UserScriptMeta {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author?: string;
  icon?: string;
  match: string[];
  grant: string[];
  'run-at'?: 'document-start' | 'document-body' | 'document-end' | 'document-idle';
  'inject-into'?: 'page' | 'content' | 'auto';
  connect?: string[];
  require?: string[];
  resource?: string[];
  noframes?: boolean;
}

export function resolveSiteIcon(meta: UserScriptMeta, siteDir?: string): string | undefined {
  if (meta.icon) return meta.icon;
  if (!siteDir) return undefined;

  const svgPath = join(siteDir, 'icon.svg');
  if (existsSync(svgPath)) {
    const rawSvg = readFileSync(svgPath, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
    const b64 = Buffer.from(rawSvg, 'utf8').toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
  }
  return undefined;
}

export function serializeMeta(meta: UserScriptMeta, siteDir?: string): string {
  const lines: string[] = ['// ==UserScript=='];
  const pushLine = (key: string, val: string) => {
    lines.push(`// @${key.padEnd(14, ' ')} ${val}`);
  };

  pushLine('name', meta.name);
  pushLine('namespace', meta.namespace);
  pushLine('version', meta.version);
  pushLine('description', meta.description);
  pushLine('author', meta.author ?? 'sora');
  const iconUrl = resolveSiteIcon(meta, siteDir);
  if (iconUrl) pushLine('icon', iconUrl);

  for (const m of meta.match) pushLine('match', m);
  const grants = Array.from(new Set(meta.grant));
  for (const g of grants) pushLine('grant', g);
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
      'GM_download',
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
        console.error('[sora-dev] 拉取编译结果失败：', res.status);
        return;
      }
      try {
        const run = new Function(
          'GM_getValue',
          'GM_setValue',
          'GM_addValueChangeListener',
          'GM_removeValueChangeListener',
          'GM_xmlhttpRequest',
          'GM_download',
          res.responseText
        );
        run(
          typeof GM_getValue !== 'undefined' ? GM_getValue : undefined,
          typeof GM_setValue !== 'undefined' ? GM_setValue : undefined,
          typeof GM_addValueChangeListener !== 'undefined' ? GM_addValueChangeListener : undefined,
          typeof GM_removeValueChangeListener !== 'undefined' ? GM_removeValueChangeListener : undefined,
          typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : undefined,
          typeof GM_download !== 'undefined' ? GM_download : undefined
        );
      } catch (err) {
        console.error('[sora-dev] 开发脚本执行失败：', err);
      }
    },
    onerror(err) {
      console.error('[sora-dev] 连不上本地开发服务，请确认已运行 bun run dev', err);
    }
  });
})();
`;
}

// * 仅去除注释与安全标点周围空白，绝不去掉 + 和 - 两侧空格，防止破坏 calc(100% - 20px)
export function minifyCssString(raw: string): string {
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .trim();
}

function minifyCssChunk(raw: string, isFirst: boolean, isLast: boolean): string {
  let out = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1');
  if (isFirst) out = out.trimStart();
  if (isLast) out = out.trimEnd();
  return out;
}

function minifyHtmlChunk(raw: string, isFirst: boolean, isLast: boolean): string {
  let out = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s*\n\s*</g, '><')
    .replace(/>\s*\n\s*$/g, '>')
    .replace(/^\s*\n\s*</g, '<')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+>/g, '>')
    .replace(/\s+\/>/g, '/>');
  if (isFirst) out = out.trimStart();
  if (isLast) out = out.trimEnd();
  return out;
}

function isIdentChar(ch: string): boolean {
  return /[a-zA-Z0-9_$]/.test(ch);
}

function skipQuoted(src: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return src.length;
}

function skipRegex(src: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') {
      inClass = true;
    } else if (ch === ']' && inClass) {
      inClass = false;
    } else if (ch === '/' && !inClass) {
      i++;
      while (i < src.length && /[a-z]/i.test(src[i] ?? '')) i++;
      return i;
    } else if (ch === '\n') {
      return start + 1;
    }
    i++;
  }
  return src.length;
}

function canStartRegex(prevTokenChar: string, prevWord: string): boolean {
  if (!prevTokenChar) return true;
  if ('=([,:;!&|?{}+-*%~^<>'.includes(prevTokenChar)) return true;
  return (
    prevWord === 'return' ||
    prevWord === 'throw' ||
    prevWord === 'case' ||
    prevWord === 'typeof' ||
    prevWord === 'void' ||
    prevWord === 'delete' ||
    prevWord === 'in' ||
    prevWord === 'of'
  );
}

function readBalancedExprEnd(src: string, exprStart: number): number {
  let i = exprStart;
  let depth = 1;
  let prevChar = '';
  let prevWord = '';

  while (i < src.length) {
    const ch = src[i] ?? '';
    if (ch === "'" || ch === '"') {
      i = skipQuoted(src, i, ch);
      prevChar = ch;
      prevWord = '';
      continue;
    }
    if (ch === '`') {
      const parsed = readTemplateLiteral(src, i);
      i = parsed.endIndex;
      prevChar = '`';
      prevWord = '';
      continue;
    }
    if (src.startsWith('//', i)) {
      const nl = src.indexOf('\n', i + 2);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (ch === '/' && canStartRegex(prevChar, prevWord)) {
      i = skipRegex(src, i);
      prevChar = '/';
      prevWord = '';
      continue;
    }
    if (ch === '{') {
      depth++;
      prevChar = '{';
      prevWord = '';
      i++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
      prevChar = '}';
      prevWord = '';
      i++;
      continue;
    }
    if (isIdentChar(ch)) {
      let j = i;
      while (j < src.length && isIdentChar(src[j] ?? '')) j++;
      prevWord = src.slice(i, j);
      prevChar = src[j - 1] ?? '';
      i = j;
      continue;
    }
    if (!/\s/.test(ch)) {
      prevChar = ch;
      prevWord = '';
    }
    i++;
  }
  return src.length;
}

function readTemplateLiteral(
  src: string,
  backtickStart: number
): { chunks: string[]; exprs: string[]; endIndex: number } {
  const chunks: string[] = [];
  const exprs: string[] = [];
  let i = backtickStart + 1;
  let chunkStart = i;

  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      chunks.push(src.slice(chunkStart, i));
      return { chunks, exprs, endIndex: i + 1 };
    }
    if (ch === '$' && src[i + 1] === '{') {
      chunks.push(src.slice(chunkStart, i));
      const exprStart = i + 2;
      const exprEnd = readBalancedExprEnd(src, exprStart);
      exprs.push(src.slice(exprStart, exprEnd));
      i = exprEnd + 1;
      chunkStart = i;
      continue;
    }
    i++;
  }
  chunks.push(src.slice(chunkStart));
  return { chunks, exprs, endIndex: src.length };
}

// * 打包期压缩 TS 源码中的 css`...` 与 html`...` 模板字符串空白和注释，同时保留 ${...} 插值表达式
export function minifyTaggedTemplatesInTs(src: string): string {
  let out = '';
  let i = 0;
  let prevChar = '';
  let prevWord = '';

  while (i < src.length) {
    const ch = src[i] ?? '';
    if (ch === "'" || ch === '"') {
      const next = skipQuoted(src, i, ch);
      out += src.slice(i, next);
      i = next;
      prevChar = ch;
      prevWord = '';
      continue;
    }
    if (src.startsWith('//', i)) {
      const nl = src.indexOf('\n', i + 2);
      const next = nl === -1 ? src.length : nl + 1;
      out += src.slice(i, next);
      i = next;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      const next = end === -1 ? src.length : end + 2;
      out += src.slice(i, next);
      i = next;
      continue;
    }
    if (ch === '/' && canStartRegex(prevChar, prevWord)) {
      const next = skipRegex(src, i);
      out += src.slice(i, next);
      i = next;
      prevChar = '/';
      prevWord = '';
      continue;
    }

    if (isIdentChar(ch)) {
      let j = i;
      while (j < src.length && isIdentChar(src[j] ?? '')) j++;
      const word = src.slice(i, j);
      if ((word === 'css' || word === 'html') && src[j] === '`') {
        const { chunks, exprs, endIndex } = readTemplateLiteral(src, j);
        out += `${word}\``;
        for (let idx = 0; idx < chunks.length; idx++) {
          const chunk = chunks[idx] ?? '';
          const isFirst = idx === 0;
          const isLast = idx === chunks.length - 1;
          out +=
            word === 'css'
              ? minifyCssChunk(chunk, isFirst, isLast)
              : minifyHtmlChunk(chunk, isFirst, isLast);
          if (idx < exprs.length) {
            out += `\${${minifyTaggedTemplatesInTs(exprs[idx] ?? '')}}`;
          }
        }
        out += '`';
        i = endIndex;
        prevChar = '`';
        prevWord = '';
        continue;
      }
      out += word;
      prevWord = word;
      prevChar = word[word.length - 1] ?? '';
      i = j;
      continue;
    }

    if (ch === '`') {
      const { chunks, exprs, endIndex } = readTemplateLiteral(src, i);
      out += '`';
      for (let idx = 0; idx < chunks.length; idx++) {
        out += chunks[idx] ?? '';
        if (idx < exprs.length) {
          out += `\${${minifyTaggedTemplatesInTs(exprs[idx] ?? '')}}`;
        }
      }
      out += '`';
      i = endIndex;
      prevChar = '`';
      prevWord = '';
      continue;
    }

    out += ch;
    if (!/\s/.test(ch)) {
      prevChar = ch;
      prevWord = '';
    }
    i++;
  }

  return out;
}

export const inlineAssetMinifierPlugin: BunPlugin = {
  name: 'sora-inline-asset-minifier',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const rawTs = await Bun.file(args.path).text();
      if (!rawTs.includes('css`') && !rawTs.includes('html`')) {
        return { contents: rawTs, loader: 'ts' };
      }
      return {
        contents: minifyTaggedTemplatesInTs(rawTs),
        loader: 'ts',
      };
    });

    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const rawCss = await Bun.file(args.path).text();
      const minified = minifyCssString(rawCss);
      return {
        contents: `export default ${JSON.stringify(minified)};`,
        loader: 'js',
      };
    });

    build.onLoad({ filter: /\.svg$/ }, async (args) => {
      const rawSvg = (await Bun.file(args.path).text())
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();
      return {
        contents: `export default ${JSON.stringify(rawSvg)};`,
        loader: 'js',
      };
    });
  },
};
