import type { UserScriptMeta } from '@scripts/meta';

export const meta: UserScriptMeta = {
  name: '@sora/playground — 组件沙盒',
  namespace: '@sora/userscripts',
  version: '1.0.0',
  description: '基于 Web Components + Top Layer Popover + AbortSignal 的零运行时沙盒例子',
  author: 'sora',
  match: ['*://*/*'],
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
