import type { UserScriptMeta } from '@scripts/meta';

export const meta: UserScriptMeta = {
  name: '@sora/aistudio — AI Studio 助手',
  namespace: '@sora/userscripts',
  version: '1.1.0',
  description: '长对话自动收起防卡顿、防误触跳转、草稿防丢、代码块一键收起与聊天导出',
  author: 'sora',
  match: ['https://aistudio.google.com/*'],
  grant: [
    'GM_getValue',
    'GM_setValue',
    'GM_addValueChangeListener',
    'GM_removeValueChangeListener',
    'GM_xmlhttpRequest',
  ],
  connect: ['*'],
  'run-at': 'document-end',
  noframes: true,
  'inject-into': 'content',
};
