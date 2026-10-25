// sites/sora-lens/meta.ts
import type { UserScriptMeta } from '../../scripts/meta.ts';

export const meta: UserScriptMeta = {
  name: 'Sora Lens - 2026 声明式极速看图引擎',
  namespace: 'https://sora.userscripts.local/sora-lens',
  version: '1.0.0',
  description: '基于 yt-dlp 声明式提取器模型、Top Layer GPU 灯箱与自适应系统主题的现代看图脚本',
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
  "inject-into": 'content'
};
