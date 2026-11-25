# Sora 用户脚本开发规范

## 一、运行环境

- **运行和打包工具**：`Bun 1.4.4+`
- **代码语言**：`TypeScript 7.0+`
- **目标浏览器**：现代桌面浏览器（macOS Safari / Orion WebKit 625+、Chromium 156+、Firefox 158+）

## 二、常见写法红绿灯

| 场景             | 禁止的写法                                          | 推荐的写法                                                                                                  |
| :--------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **移动页面节点** | 直接在普通元素上假设 `moveBefore()` 处处可用        | 优先用 `DocumentFragment` + `replaceChildren()` / `insertBefore()`                                          |
| **隔离组件样式** | 在页面里塞 `<style>` 标签                           | `ShadowRoot.adoptedStyleSheets = [atomicThemeSheet, sheet]`                                                 |
| **明暗主题适配** | 用 JS 手动切换 `.dark` 类或写两份样式               | `:host { color-scheme: light dark; }` 配 `light-dark(亮色, 暗色)`                                           |
| **弹层显示**     | 自己算 `z-index: 999999` 和外部点击关闭             | 原生 `popover="manual"` 配 `showPopover()` / `hidePopover()`                                                |
| **顶层弹层动画** | 把 `allow-discrete` 写进 `transition` 简写里        | 拆开写 `transition-property` 等属性，再单独写 `transition-behavior: allow-discrete`，并做好减弱动画偏好适配 |
| **事件绑定**     | 裸写 `addEventListener` 不清理                      | 统一用 `this.on(el, type, fn)` 或 `scope.on(...)` 绑定 `AbortSignal`                                        |
| **记录页面节点** | 用全局 `Array` / `Set` / `Map` 存节点导致内存不释放 | 用 `WeakMap<Element, T>` 或 `WeakSet<Element>`                                                              |
| **监听页面变化** | 在 `MutationObserver` 里直接读写布局尺寸            | 使用 `useObserver`（按帧合并）并在高频输出场景加防抖                                                        |
| **临时文件链接** | 调用 `URL.createObjectURL` 后不回收                 | 使用后及时调用 `URL.revokeObjectURL`                                                                        |
| **打印日志**     | 裸用 `console.log`（容易被网页本身屏蔽）            | 使用 `createLogger('模块名')`                                                                               |

## 三、如何快速开发一个新站点脚本

为了减少重复代码，界面外壳和通用交互已经拆成无状态的组件和组合函数：

1. 在 `sites/<站点名>/` 按单一职责建好目录：
   - `meta.ts`：脚本元信息（名称、域名匹配、油猴权限）
   - `icon.svg`：脚本图标
   - `locales.ts`：多语言文案（简体中文 / 英文）
   - `style.css`：纯样式
   - `features/`：纯业务逻辑（不混 UI 胶水代码）
   - `index.ts`：薄组装层，把共享界面外壳、多语言和业务逻辑拼起来
2. 状态、多语言和全局能力直接用 `@core` 提供的组合函数：
   - `useStorage`：自动兼容本地存储与油猴跨标签同步，读取对象时会自动补齐默认值。
   - `useI18n`：多语言翻译（支持简体中文、英文与自动跟随浏览器语言）。
   - `useShortcut`：跨脚本共享的快捷键注册、按键录制和冲突检测。macOS 下自动显示为 `Option (⌥)` / `Cmd (⌘)`。
   - `useSnapPosition`：拖拽贴边、键盘方向键微调，以及同一网页多个脚本自动错开不重叠。
3. 界面外壳直接用 `@ui` 提供的 `<s-dock-shell>`、`<s-setting-row>`、`<s-switch>`：
   - 外壳自带悬浮按钮、设置面板、语言切换按钮、快捷键设置区和 6 方位停靠按钮。
   - 新脚本只需要写自己的业务开关和业务方法，不用再手写一套重复的面板代码。
4. 所有界面文字、代码注释和日志都用直白的大白话，不要写晦涩造词。
