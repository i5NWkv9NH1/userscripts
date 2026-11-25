import type { UserScriptMeta } from '@scripts/meta';

export const meta: UserScriptMeta = {
  name: '@sora/peek — 看图与存图助手',
  namespace: '@sora/userscripts',
  version: '1.2.0',
  description: '悬停看大图、X 原图/视频/GIF 识别、多搜索引擎识图与按网站原文件名保存',
  author: 'sora',
  match: ['*://*/*'],
  grant: [
    'GM_getValue',
    'GM_setValue',
    'GM_addValueChangeListener',
    'GM_removeValueChangeListener',
    'GM_xmlhttpRequest',
    'GM_download',
  ],
  connect: ['*'],
  'run-at': 'document-end',
  noframes: true,
  'inject-into': 'content',
};
