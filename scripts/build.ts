import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inlineTemplateMinifierPlugin, serializeMeta, type UserScriptMeta } from './meta.ts';

const ROOT_DIR = resolve(import.meta.dir, '..');
const SITES_DIR = join(ROOT_DIR, 'sites');
const DIST_DIR = join(ROOT_DIR, 'dist');

async function buildAll() {
  const totalStart = performance.now();
  await mkdir(DIST_DIR, { recursive: true });

  const entries = await readdir(SITES_DIR, { withFileTypes: true });
  const sites = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  for (const site of sites) {
    const siteStart = performance.now();
    const entryPath = join(SITES_DIR, site, 'index.ts');
    const metaPath = join(SITES_DIR, site, 'meta.ts');

    if (!(await Bun.file(entryPath).exists())) continue;

    const metaModule = await import(metaPath);
    const meta: UserScriptMeta = metaModule.meta;
    const banner = serializeMeta(meta, join(SITES_DIR, site));

    const result = await Bun.build({
      entrypoints: [entryPath],
      target: 'browser',
      format: 'iife',
      plugins: [inlineTemplateMinifierPlugin],
      minify: {
        whitespace: true,
        syntax: true,
        identifiers: true,
      },
    });

    if (!result.success) {
      console.error(`[Build] 站点「${site}」构建失败：`, result.logs);
      process.exit(1);
    }

    // const jsContent = (await result.outputs[0]!.text()).trim();
    // const rawJs = (await result.outputs[0]!.text()).trim();
    // 经过 Bun.build 压缩后，所有剩余的真换行均来自反引号模板内部，直接全局转义为 \n 即可实现 100% 纯单行
    // # 为生产产物包裹 customElements 环境自适应提权壳
    const rawJs = (await result.outputs[0]!.text()).trim();
    const flatJs = rawJs.replace(/\r?\n/g, '\\n');
    // # 当处于 content 隔离沙盒（customElements === null）时，自动通过 GM_addElement 穿透 CSP 挂载至主页面上下文执行
    const jsContent = `(()=>{const b=()=>{${flatJs}};if(typeof customElements!=="undefined"&&customElements!==null){b()}else if(typeof GM_addElement==="function"){GM_addElement(document.head||document.documentElement,"script",{textContent:"("+b.toString()+")()"})}})();`;
    const outFileName = `@sora-${site}.userscript.js`;
    const outPath = join(DIST_DIR, outFileName);
    await Bun.write(outPath, `${banner}\n${jsContent}\n`);

    const sizeKB = (Buffer.byteLength(jsContent, 'utf8') / 1024).toFixed(2);
    const cost = (performance.now() - siteStart).toFixed(2);
    console.info(`[Build] 极致压缩完成：dist/${outFileName} （体积 ${sizeKB} KB，耗时 ${cost}ms）`);
  }

  const totalCost = (performance.now() - totalStart).toFixed(2);
  console.info(`[Build] 全部站点打包完毕，总耗时 ${totalCost}ms`);
}

await buildAll();
