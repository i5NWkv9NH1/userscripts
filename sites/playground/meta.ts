import type { UserScriptMeta } from '../../scripts/meta.ts';

export const meta: UserScriptMeta = {
  name: 'Sora Playground (2026 Next-Gen)',
  namespace: 'https://sora.userscripts.local',
  version: '1.0.0',
  description: '基于 Web Components + Top Layer Popover + AbortSignal 的零运行时沙盒验证切片',
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
