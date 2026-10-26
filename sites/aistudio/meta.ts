import type { UserScriptMeta } from "@scripts/meta";

export const meta: UserScriptMeta = {
  name: '@sora/aistudio — 用于 Google AI Studio DOM 优化、支持 Markdown 导出、防误触',
  namespace: '@sora/userscripts',
  version: '1.0.0',
  description:
    '基于 DOM 虚拟化裁剪、WeakMap 缓存与 Top Layer 面板的 Google AI Studio 性能优化器',
  author: 'sora',
  match: ['https://aistudio.google.com/*'],
  grant: [
    'GM_getValue',
    'GM_setValue',
    'GM_addValueChangeListener',
    'GM_removeValueChangeListener',
  ],
  'run-at': 'document-end',
  noframes: true,
  'inject-into': 'content',
};
