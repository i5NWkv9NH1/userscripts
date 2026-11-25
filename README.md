# sora-userscripts

[简体中文](README.md) | [English](README.en.md)

基于 `Bun`、原生 Web Components、Top Layer `popover` 与油猴 `GM_*` 接口打造的浏览器用户脚本集合。兼容 Chrome / Brave，以及 Firefox / Zen Browser（`@inject-into content` 沙盒模式）。

## 一键安装

浏览器装好 **Violentmonkey（暴力猴）** 或 **Tampermonkey（篡改猴）** 后，点击下方链接即可直接安装（每次推送到 GitHub 后自动编译更新）：

| 脚本                   | 说明                                                                                                | 一键安装（GitHub Raw）                                                                                                         |
| :--------------------- | :-------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| **`@sora/peek`**       | 全网悬浮看图、X 原图/视频/GIF 识别、X 动图转 `.gif`、Yandex/Google/Bing/SauceNAO 搜图与原文件名保存 | [安装 `@sora/peek`](https://raw.githubusercontent.com/i5NWkv9NH1/userscripts/master/dist/@sora-peek.userscript.js)             |
| **`@sora/aistudio`**   | Google AI Studio 长对话防卡顿折叠、一键收起/展开代码块、防误触拦截、聊天完整导出（MD / JSON）       | [安装 `@sora/aistudio`](https://raw.githubusercontent.com/i5NWkv9NH1/userscripts/master/dist/@sora-aistudio.userscript.js)     |
| **`@sora/playground`** | 公共界面外壳、多语言实时切换、跨脚本快捷键防冲突与贴边防重叠测试示例                                | [安装 `@sora/playground`](https://raw.githubusercontent.com/i5NWkv9NH1/userscripts/master/dist/@sora-playground.userscript.js) |

## 功能亮点

- **`@sora/peek`**
  - 悬停图标默认位于媒体左上角，支持 `Option/Alt + 悬停` 直接打开全屏预览窗，支持连续切换与手势缩放/旋转/镜像翻转。
  - X（Twitter）支持提取 `?name=orig` 原图、选取最高码率 MP4 视频，且 X 动图默认优先编码保存为 `.gif`（也可切回 `.mp4`）。
  - 预览工具栏按媒体类型自动显隐（视频/GIF 隐藏图片旋转缩放与搜图按钮），默认使用 Yandex 搜图并支持 Google / Bing / SauceNAO。
- **`@sora/aistudio`**
  - 自动折叠早期对话保留最近可见轮次，输入框旁与控制面板均提供「收起代码块 / 展开代码块 / 跳到最新一轮」。
  - 完整对话导出会自动滚动加载全量记录，支持导出思考过程、系统提示词与内嵌图片（自动排除界面图标），并规范处理代码语言、列表编号与搜索建议链接编码。
- **`@sora/playground`**
  - 用来验证 `@core` 与 `@ui` 的双语言切换、快捷键冲突拦截及多脚本同页停靠错开效果。

## 目录结构

- `packages/core`：双模式组件基类（原生 Custom Elements + `@inject-into content` 兼容）、模板引擎、日志与组合函数（存储、快捷键、停靠位置、多语言、变化监听）
- `packages/ui`：共享无状态界面组件（`<s-dock-shell>`、`<s-setting-row>`、`<s-switch>`、`<s-popover>`、矢量图标）
- `packages/preview-engine`：大图/视频/GIF 预览窗、手势控制器、纯 TS GIF89a 编码器与站点提取注册表
- `sites/<site>/`：按单一职责拆分为 `meta.ts`、`icon.svg`、`locales.ts`、`style.css`、`features/` 与入口组装层 `index.ts`
- `scripts/`：开发热监听与生产打包脚本（自动压缩 JS、内联 CSS/HTML 模板与 SVG，并写入版本时间戳）
- `.github/workflows/build.yml`：推送后自动运行类型检查、代码规范检查、单元测试并更新 `dist/`

## 本地开发与构建

```bash
bun install
bun run dev
bun run build
bun test
bunx tsc --noEmit
bunx biome check --write .
```

如需在本地开发时还原技能目录，可运行：

```bash
bunx skills experimental_install
```

更多规范与架构说明请查看 [docs/README.md](./docs/README.md)。
