import type { UserScriptMeta } from '@scripts/meta';

export const meta: UserScriptMeta = {
  name: '@sora/playground — 组件测试面板',
  namespace: '@sora/userscripts',
  version: '1.1.0',
  description: '用来测试悬浮面板、多语言切换、跨脚本快捷键冲突检测和防重叠停靠的示例脚本',
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
