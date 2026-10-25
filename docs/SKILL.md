# Sora Userscripts 架构规范与 API 准则 (SKILLS.md)

## 一、 运行底座与目标环境

- **运行时与打包器**：纯 `Bun 1.4.4+`（严禁出现 `node`、`npm`、`npx`、`vite`）。
- **语言标准**：`TypeScript 7.0+`（严禁在 `tsconfig.json` 中使用已移除的 `baseUrl`）。
- **目标浏览器**：2026+ 常青浏览器（macOS Orion / WebKit 625.1.8+、Chromium 156+、Firefox 158+）。

## 二、 API 红绿灯对照表

| 领域           | 严禁使用的 API / 模式（红线）              | 强制采用的现代 API / 模式（绿线）                                  |
| :------------- | :----------------------------------------- | :----------------------------------------------------------------- |
| **DOM 移动**   | `Element.moveBefore()`（WebKit 未稳定）    | `DocumentFragment` + `replaceChildren()` / `insertBefore()`        |
| **样式隔离**   | `document.createElement('style')`、SCSS    | `ShadowRoot.adoptedStyleSheets = [atomicThemeSheet, sheet]`        |
| **主题适配**   | JS 监听切换 `.dark` 类、写两套 `@media`    | `:host { color-scheme: light dark; }` + 原生 `light-dark(亮, 暗)`  |
| **CSS 编写**   | 外部 Tailwind/UnoCSS 编译器                | 原生 CSS Nesting (`& .child`) + `@core` 内置共享原子类             |
| **浮层面板**   | 手算 `z-index: 999999`、外部点击监听       | HTML 原生 `popover` 属性 + `showPopover()` 进入 Top Layer          |
| **事件监听**   | 裸写 `el.addEventListener(type, fn)`       | 强制绑定 `AbortSignal`：`this.on(el, type, fn)` 或 `scope.on(...)` |
| **DOM 状态**   | 全局 `Array` / `Set` / `Map` 存 DOM 节点   | 强制使用 `WeakMap<Element, T>` 或 `WeakSet<Element>`               |
| **DOM 观察**   | 在 `MutationObserver` 回调内同步读写布局   | 使用 `useObserver`（内部通过 `requestAnimationFrame` 节流合并）    |
| **二进制资源** | `URL.createObjectURL` 后不释放             | 必须在加载完成或组件销毁时调用 `URL.revokeObjectURL`               |
| **日志输出**   | 裸写 `console.log`（易被宿主网页劫持屏蔽） | 使用 `@core` 导出的 `createLogger('模块名')`                       |
