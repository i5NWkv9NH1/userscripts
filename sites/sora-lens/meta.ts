// sites/sora-lens/meta.ts
import type { UserScriptMeta } from "@scripts/meta";

export const meta: UserScriptMeta = {
  name: '@sora/sora-lens — 看图脚本',
  namespace: '@sora/userscripts',
  version: '1.0.0',
  description: '基于声明式提取器、灯箱的看图脚本，可用于替代 PreviewCE+',
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
