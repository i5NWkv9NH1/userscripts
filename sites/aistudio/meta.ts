import type { UserScriptMeta } from '../../scripts/meta.ts';

export const meta: UserScriptMeta = {
  name: '@sora/aistudio — Google AI Studio 极速优化与防误触引擎',
  namespace: '@sora/userscripts',
  version: '1.0.0',
  description:
    '基于 DOM 虚拟化裁剪、WeakMap 增量签名缓存与 Top Layer 面板的 Google AI Studio 性能优化器',
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
