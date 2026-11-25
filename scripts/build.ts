import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inlineAssetMinifierPlugin, serializeMeta, type UserScriptMeta } from './meta.ts';

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
    const baseMeta: UserScriptMeta = metaModule.meta;
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const meta: UserScriptMeta =
      process.env.SORA_VERSION_STAMP === '1'
        ? { ...baseMeta, version: `${baseMeta.version}.${stamp}` }
        : baseMeta;
    const banner = serializeMeta(meta, join(SITES_DIR, site));

    const result = await Bun.build({
      entrypoints: [entryPath],
      target: 'browser',
      format: 'iife',
      plugins: [inlineAssetMinifierPlugin],
      minify: {
        whitespace: true,
        syntax: true,
        identifiers: true,
      },
    });

    if (!result.success) {
      console.error(`[Build] 站点「${site}」打包失败：`, result.logs);
      process.exit(1);
    }

    const output = result.outputs[0];
    if (!output) {
      console.error(`[Build] 站点「${site}」没有生成输出文件`);
      process.exit(1);
    }

    // * 直接输出打包后的标准自执行脚本，保留油猴沙盒内的 GM_* 接口权限，并附上编译时间说明
    const jsContent = (await output.text()).trim();
    const buildNote = `// Build: ${now.toISOString()}`;
    const outFileName = `@sora-${site}.userscript.js`;
    const outPath = join(DIST_DIR, outFileName);
    await Bun.write(outPath, `${banner}\n${buildNote}\n${jsContent}\n`);

    const sizeKB = (Buffer.byteLength(jsContent, 'utf8') / 1024).toFixed(2);
    const cost = (performance.now() - siteStart).toFixed(2);
    console.info(`[Build] 打包完成：dist/${outFileName}（体积 ${sizeKB} KB，耗时 ${cost}ms）`);
  }

  const totalCost = (performance.now() - totalStart).toFixed(2);
  console.info(`[Build] 全部脚本打包完成，总耗时 ${totalCost}ms`);
}

await buildAll();
