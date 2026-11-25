import { resolveLocale } from '@core';
import type { DomTrimmer, TrimmerConfig } from './dom-trimmer.ts';

declare function GM_xmlhttpRequest(details: {
  method: 'GET';
  url: string;
  responseType: 'blob';
  onload?: (res: { status: number; response: unknown }) => void;
  onerror?: () => void;
}): void;

export type ExportFormat = 'md' | 'json';

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly includeThoughts: boolean;
  readonly includeSystem: boolean;
  readonly includeImagesBase64: boolean;
  readonly stripEmojis: boolean;
}

export interface SessionMetadata {
  readonly title: string;
  readonly userName: string;
  readonly userEmail: string;
  readonly modelTitle: string;
  readonly modelId: string;
  readonly thinkingLevel: string;
  readonly enabledTools: string[];
  readonly systemInstructions: string;
  readonly userAvatar: string;
}

interface ImageAttachment {
  readonly alt: string;
  readonly src: string;
  readonly dataUrl: string | null;
}

interface TurnSnapshot {
  readonly role: 'User' | 'Gemini' | 'Unknown';
  readonly timestamp: string;
  readonly thoughts: string;
  readonly markdown: string;
  readonly images: ImageAttachment[];
  readonly signature: string;
}

const nodeSignatureCache = new WeakMap<Element, string>();
const blobDataUrlCache = new Map<string, string>();

function stripEmojisSafe(text: string): string {
  if (!text) return text;
  const regex = /(```[\s\S]*?```|`[\s\S]*?`)|([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu;
  return text.replace(regex, (match, codeBlock, emoji) => {
    if (codeBlock) return codeBlock as string;
    if (emoji) return '';
    return match;
  });
}

function tryCanvasToDataUrl(img: HTMLImageElement): string | null {
  const src = img.currentSrc || img.src;
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  const cached = blobDataUrlCache.get(src);
  if (cached) return cached;

  try {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        blobDataUrlCache.set(src, dataUrl);
        return dataUrl;
      }
    }
  } catch {}
  return null;
}

async function resolveImageDataUrlAsync(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  const cached = blobDataUrlCache.get(src);
  if (cached) return cached;

  if (typeof GM_xmlhttpRequest === 'function' && /^https?:/i.test(src)) {
    const dataUrl = await new Promise<string | null>((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: src,
        responseType: 'blob',
        onload(res) {
          if (res.status >= 200 && res.status < 300 && res.response instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
              resolve(typeof reader.result === 'string' ? reader.result : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(res.response);
          } else {
            resolve(null);
          }
        },
        onerror: () => resolve(null),
      });
    });
    if (dataUrl) {
      blobDataUrlCache.set(src, dataUrl);
      return dataUrl;
    }
  }

  return null;
}

export function normalizeMarkdownHref(
  rawHref: string,
  baseUrl = typeof location !== 'undefined' && /^https?:/.test(location.origin)
    ? location.origin
    : 'https://aistudio.google.com'
): string {
  let href = rawHref.trim();
  if (!href) return '';
  if (href.startsWith('https://www.google.com/url?sa=')) {
    try {
      href = new URL(href).searchParams.get('q') ?? href;
    } catch {}
  }
  try {
    // * 补全相对路径并自动转义空格与引号，防止 Google Search Suggestions 链接在 Markdown 中被空格截断
    const normalized = new URL(href, baseUrl).href;
    return normalized.replace(/\(/g, '%28').replace(/\)/g, '%29');
  } catch {
    return href
      .replace(/\s+/g, '%20')
      .replace(/"/g, '%22')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
  }
}

export function isContentImageElement(img: HTMLImageElement): boolean {
  const src = (img.currentSrc || img.src || '').trim();
  if (!src) return false;
  const alt = (img.alt || '').trim().toLowerCase();
  // ! 排除 Gemini 思考块、搜索来源卡片、头像、按钮等界面图标（避免每轮重复抓取 Thinking 图标转 Base64）
  if (alt === 'thinking') return false;
  if (
    img.closest(
      'ms-thought-chunk, ms-grounding-chunk, ms-search-entry-point, .thought-header, .author-label, button, [role="button"], .actions-container, mat-icon, .icon, .avatar'
    )
  ) {
    return false;
  }
  if (/gstatic\.com\/aistudio\/|fonts\.gstatic\.com/i.test(src)) return false;
  return true;
}

function htmlToMarkdown(node: Node | null): string {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tagName = el.tagName.toLowerCase();

  if (
    tagName === 'ms-thought-chunk' ||
    tagName === 'ms-image-chunk' ||
    tagName === 'mat-menu' ||
    tagName === 'button' ||
    el.classList.contains('bottom-right-image-controls') ||
    el.classList.contains('material-symbols-outlined') ||
    el.classList.contains('actions-container')
  ) {
    return '';
  }

  if (tagName === 'ms-code-block') {
    const lang = el.getAttribute('data-test-language') ?? '';
    const code = el.querySelector('pre code')?.textContent ?? '';
    return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  }

  if (
    el.classList.contains('sources-title') ||
    el.classList.contains('grounding-sources-title') ||
    (tagName === 'div' && el.textContent?.trim() === 'Sources' && el.children.length === 0)
  ) {
    return '\n\n#### Sources\n\n';
  }

  let childrenMd = '';
  for (const child of el.childNodes) {
    childrenMd += htmlToMarkdown(child);
  }

  switch (tagName) {
    case 'p':
      return `\n\n${childrenMd.trim()}\n\n`;
    case 'strong':
    case 'b':
      return `**${childrenMd}**`;
    case 'em':
    case 'i':
      return `*${childrenMd}*`;
    case 'code': {
      if (el.closest('pre, ms-code-block')) return childrenMd;
      const text = childrenMd.trim();
      return text.includes('`') ? `\`\` ${text} \`\`` : `\`${text}\``;
    }
    case 'pre': {
      if (el.closest('ms-code-block')) return childrenMd;
      return `\n\n\`\`\`\n${(el.textContent ?? '').trimEnd()}\n\`\`\`\n\n`;
    }
    case 'blockquote': {
      const quoted = childrenMd
        .trim()
        .split('\n')
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n');
      return `\n\n${quoted}\n\n`;
    }
    case 'hr':
      return '\n\n---\n\n';
    case 'a': {
      const rawHref = el.getAttribute('href') ?? '';
      const href = normalizeMarkdownHref(rawHref);
      const label = childrenMd.replace(/\s+/g, ' ').trim() || href;
      return href ? `[${label}](${href})` : label;
    }
    case 'ul':
    case 'ol':
      return `\n${childrenMd}\n`;
    case 'li': {
      const parentList = el.closest('ul, ol');
      if (parentList?.tagName.toLowerCase() === 'ol') {
        // * 兼容 Angular 在 <ol> 内套一层容器节点的情况，避免 :scope > li 匹配失败导致编号变成 0.
        const items = Array.from<HTMLElement>(parentList.querySelectorAll('li')).filter(
          (li) => li.closest('ul, ol') === parentList
        );
        const startAttr = Number.parseInt(parentList.getAttribute('start') ?? '1', 10);
        const baseStart = Number.isFinite(startAttr) ? startAttr : 1;
        const idx = Math.max(0, items.indexOf(el)) + baseStart;
        return `${idx}. ${childrenMd.trim()}\n`;
      }
      return `* ${childrenMd.trim()}\n`;
    }
    case 'h1':
      return `\n\n# ${childrenMd.trim()}\n\n`;
    case 'h2':
      return `\n\n## ${childrenMd.trim()}\n\n`;
    case 'h3':
      return `\n\n### ${childrenMd.trim()}\n\n`;
    case 'h4':
    case 'h5':
    case 'h6':
      return `\n\n#### ${childrenMd.trim()}\n\n`;
    case 'br':
      return '\n';
    default:
      return childrenMd;
  }
}

export class ChatExporter {
  readonly #turnsMap = new Map<string, TurnSnapshot>();
  readonly #orderedIds: string[] = [];

  get capturedCount(): number {
    return this.#turnsMap.size;
  }

  captureTurnElement(turn: HTMLElement): void {
    const turnId = turn.id;
    if (!turnId) return;

    let role: 'User' | 'Gemini' | 'Unknown' = 'Unknown';
    if (turn.querySelector('[data-turn-role="User"], .user, .user-prompt-container')) {
      role = 'User';
    } else if (turn.querySelector('[data-turn-role="Model"], .model, .model-prompt-container')) {
      role = 'Gemini';
    }

    const timestamp = turn.querySelector('.author-label .timestamp')?.textContent?.trim() ?? '';

    const images: ImageAttachment[] = [];
    const imgElements = turn.querySelectorAll<HTMLImageElement>(
      'ms-image-chunk img.loaded-image, ms-prompt-chunk img'
    );
    for (const imgEl of imgElements) {
      if (!isContentImageElement(imgEl)) continue;
      const src = imgEl.currentSrc || imgEl.src;
      if (!src) continue;
      const dataUrl = tryCanvasToDataUrl(imgEl);
      images.push({
        alt: imgEl.alt || 'image.png',
        src,
        dataUrl,
      });
    }

    const contentRoot = turn.querySelector<HTMLElement>(
      'ms-prompt-chunk, .text-chunk, ms-text-chunk'
    );
    if (!contentRoot && images.length === 0) return;

    const rawTextLen = contentRoot?.textContent?.length ?? 0;
    const signature = `${rawTextLen}:${images.length}:${role}`;
    if (nodeSignatureCache.get(turn) === signature && this.#turnsMap.has(turnId)) {
      return;
    }

    let thoughtsText = '';
    const thoughtNode = turn.querySelector('ms-thought-chunk');
    if (thoughtNode) {
      const body = thoughtNode.querySelector('.mat-expansion-panel-body, ms-text-chunk');
      if (body) {
        thoughtsText = htmlToMarkdown(body)
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    }

    const markdown = contentRoot
      ? htmlToMarkdown(contentRoot)
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      : '';

    if (!markdown && !thoughtsText && images.length === 0) return;

    nodeSignatureCache.set(turn, signature);
    if (!this.#orderedIds.includes(turnId)) {
      this.#orderedIds.push(turnId);
    }
    this.#turnsMap.set(turnId, {
      role,
      timestamp,
      thoughts: thoughtsText,
      markdown,
      images,
      signature,
    });
  }

  captureVisibleTurns(): number {
    const turns = document.querySelectorAll<HTMLElement>('ms-chat-turn');
    for (const turn of turns) {
      this.captureTurnElement(turn);
    }
    return this.#turnsMap.size;
  }

  collectSessionMetadata(includeSystem: boolean): SessionMetadata {
    const title =
      document.querySelector('.page-title h1, h1.mode-title')?.textContent?.trim() ||
      'Google_AI_Studio_Chat';

    const avatarImg = document.querySelector<HTMLImageElement>('ms-account-switcher img.avatar');
    const userName = avatarImg?.alt?.trim() || 'User';
    const userAvatar = avatarImg?.src ?? '';
    const userEmail =
      document.querySelector('ms-account-switcher .account-switcher-text')?.textContent?.trim() ||
      '';

    const modelTitle =
      document
        .querySelector('ms-model-selector .model-selector-card .title')
        ?.textContent?.trim() || '';
    const modelId =
      document
        .querySelector('ms-model-selector [data-test-id="model-name"]')
        ?.textContent?.trim() || '';

    const thinkingLevel =
      document
        .querySelector(
          'ms-thinking-level-setting .mat-mdc-select-min-line, ms-thinking-level-setting .mat-mdc-select-value-text'
        )
        ?.textContent?.trim() || '';

    const enabledTools: string[] = [];
    const toolToggles = document.querySelectorAll<HTMLElement>(
      'ms-run-settings-slide-toggle, ms-browse-as-a-tool'
    );
    for (const toggle of toolToggles) {
      const isChecked = toggle.querySelector('button[role="switch"][aria-checked="true"]') !== null;
      if (isChecked) {
        const label =
          toggle.getAttribute('text') || toggle.querySelector('.label, h3')?.textContent?.trim();
        if (label) enabledTools.push(label);
      }
    }

    let systemInstructions = '';
    if (includeSystem) {
      const panel = document.querySelector('ms-system-instructions-panel');
      if (panel) {
        const textarea = panel.querySelector<HTMLTextAreaElement>('textarea');
        if (textarea) {
          systemInstructions = textarea.value.trim();
        } else {
          const sub = panel.querySelector('.subtitle')?.textContent?.trim() ?? '';
          const placeholder = 'optional tone and style instructions for the model';
          if (sub && sub.toLowerCase() !== placeholder) {
            systemInstructions = sub;
          }
        }
      }
    }

    return {
      title,
      userName,
      userEmail,
      modelTitle,
      modelId,
      thinkingLevel,
      enabledTools,
      systemInstructions,
      userAvatar,
    };
  }

  // * 对画布导出失败的跨域图片，通过油猴接口补拉转 Base64，仍失败时保留原图链接
  async #hydrateImagesIfNeeded(order: string[], includeBase64: boolean): Promise<void> {
    if (!includeBase64) return;
    for (const id of order) {
      const snap = this.#turnsMap.get(id);
      if (!snap || snap.images.length === 0) continue;
      let changed = false;
      const updatedImages: ImageAttachment[] = [];
      for (const img of snap.images) {
        if (img.dataUrl) {
          updatedImages.push(img);
        } else {
          const fetched = await resolveImageDataUrlAsync(img.src);
          if (fetched) changed = true;
          updatedImages.push({ ...img, dataUrl: fetched });
        }
      }
      if (changed) {
        this.#turnsMap.set(id, { ...snap, images: updatedImages });
      }
    }
  }

  async exportSnapshot(options: ExportOptions, customOrder?: string[]): Promise<void> {
    this.captureVisibleTurns();
    const order = customOrder && customOrder.length > 0 ? customOrder : this.#orderedIds;
    await this.#hydrateImagesIfNeeded(order, options.includeImagesBase64);

    const meta = this.collectSessionMetadata(options.includeSystem);
    const date = new Date().toISOString().slice(0, 10);
    const isEn = resolveLocale() === 'en';

    let title = meta.title;
    let systemPrompt = meta.systemInstructions;
    if (options.stripEmojis) {
      title = stripEmojisSafe(title);
      systemPrompt = stripEmojisSafe(systemPrompt);
    }

    let content = '';
    let ext = 'md';
    let mime = 'text/markdown';

    if (options.format === 'json') {
      const history: Array<Record<string, unknown>> = [];
      for (const id of order) {
        const item = this.#turnsMap.get(id);
        if (!item) continue;
        const msg: Record<string, unknown> = {
          role: item.role.toLowerCase(),
          timestamp: item.timestamp || undefined,
        };
        const thoughts = options.stripEmojis ? stripEmojisSafe(item.thoughts) : item.thoughts;
        const md = options.stripEmojis ? stripEmojisSafe(item.markdown) : item.markdown;

        if (options.includeThoughts && thoughts) msg.thoughts = thoughts;
        if (md) msg.content = md;
        if (item.images.length > 0) {
          msg.images = item.images.map((img) =>
            options.includeImagesBase64 && img.dataUrl
              ? { alt: img.alt, dataUrl: img.dataUrl }
              : { alt: img.alt, src: img.src }
          );
        }
        history.push(msg);
      }

      content = JSON.stringify(
        {
          title,
          date,
          account: meta.userEmail ? `${meta.userName} (${meta.userEmail})` : meta.userName,
          model: meta.modelId ? `${meta.modelTitle} (${meta.modelId})` : meta.modelTitle,
          thinking_level: meta.thinkingLevel || undefined,
          enabled_tools: meta.enabledTools,
          system_instructions: systemPrompt || undefined,
          history,
        },
        null,
        2
      );
      ext = 'json';
      mime = 'application/json';
    } else {
      const lines: string[] = [
        '---',
        `title: "${title.replace(/"/g, '\\"')}"`,
        `date: ${date}`,
        `author: "${meta.userName}"`,
      ];
      if (meta.userEmail) lines.push(`email: "${meta.userEmail}"`);
      if (meta.userAvatar) lines.push(`user_avatar: "${meta.userAvatar}"`);
      if (meta.modelTitle || meta.modelId) {
        lines.push(`model: "${meta.modelTitle}"`);
        if (meta.modelId) lines.push(`model_id: "${meta.modelId}"`);
      }
      if (meta.thinkingLevel) {
        lines.push(`thinking_level: "${meta.thinkingLevel}"`);
      }
      if (meta.enabledTools.length > 0) {
        lines.push('tools:');
        for (const tool of meta.enabledTools) {
          lines.push(`  - "${tool}"`);
        }
      }
      lines.push('tags:', '  - "aistudio"');
      if (meta.modelId) lines.push(`  - "${meta.modelId}"`);
      lines.push('---', '', `# ${title}`, '');
      if (systemPrompt) {
        const sysHeading = isEn ? 'System Instructions' : '系统提示词 (System Instructions)';
        lines.push(
          `<details>\n<summary>${sysHeading}</summary>\n\n${systemPrompt}\n\n</details>`,
          ''
        );
      }

      for (const id of order) {
        const item = this.#turnsMap.get(id);
        if (!item) continue;
        let text = options.stripEmojis ? stripEmojisSafe(item.markdown) : item.markdown;
        const thoughts = options.stripEmojis ? stripEmojisSafe(item.thoughts) : item.thoughts;

        const imgLines: string[] = [];
        for (const img of item.images) {
          if (options.includeImagesBase64 && img.dataUrl) {
            imgLines.push(`![${img.alt}](${img.dataUrl})`);
          } else {
            imgLines.push(`![${img.alt}](${img.src})`);
          }
        }

        if (imgLines.length > 0) {
          text = `${imgLines.join('\n\n')}${text ? `\n\n${text}` : ''}`;
        }

        if (options.includeThoughts && thoughts) {
          const thoughtHeading = isEn ? "Gemini's Thoughts" : 'Gemini 思考过程 (Thoughts)';
          text = `<details>\n<summary>${thoughtHeading}</summary>\n\n${thoughts}\n\n</details>\n\n${text}`;
        }

        if (text) {
          const timeSuffix = item.timestamp ? ` (${item.timestamp})` : '';
          lines.push(`### [${item.role}]${timeSuffix}\n\n${text}\n`);
        }
      }

      content = lines.join('\n');
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_').toLowerCase();
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

    a.href = objectUrl;
    a.download = `${safeTitle}_${stamp}.${ext}`;
    a.click();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }

  async performFullScrollExport(
    trimmer: DomTrimmer,
    trimmerCfg: TrimmerConfig,
    options: ExportOptions,
    onProgress: (statusText: string) => void
  ): Promise<void> {
    const isEn = resolveLocale() === 'en';
    let scrollEl: HTMLElement = document.documentElement;
    const sampleTurn = document.querySelector<HTMLElement>('ms-chat-turn');
    if (sampleTurn) {
      let parent = sampleTurn.parentElement;
      while (parent && parent !== document.body) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          scrollEl = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }

    const originalScrollTop = scrollEl.scrollTop;
    trimmer.restoreAll();
    onProgress(isEn ? 'Scrolling to top...' : '正滚回顶部...');

    let prevTop = -1;
    while (scrollEl.scrollTop > 0 && scrollEl.scrollTop !== prevTop) {
      prevTop = scrollEl.scrollTop;
      scrollEl.scrollTop -= 2400;
      await new Promise((r) => setTimeout(r, 45));
    }
    scrollEl.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 350));

    const chronologicalIds: string[] = [];
    const step = Math.max(600, Math.round(scrollEl.clientHeight * 0.85));
    let lastScroll = -1;

    while (true) {
      trimmer.collapseAllCodeBlocks();
      const turns = document.querySelectorAll<HTMLElement>('ms-chat-turn');
      for (const t of turns) {
        if (t.id && !chronologicalIds.includes(t.id)) {
          chronologicalIds.push(t.id);
        }
        this.captureTurnElement(t);
      }

      onProgress(
        isEn ? `Scanned ${chronologicalIds.length}...` : `已扫描 ${chronologicalIds.length} 条...`
      );
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (scrollEl.scrollTop >= maxScroll || scrollEl.scrollTop === lastScroll) {
        break;
      }
      lastScroll = scrollEl.scrollTop;
      scrollEl.scrollTop += step;
      await new Promise((r) => setTimeout(r, 120));
    }

    await this.exportSnapshot(options, chronologicalIds);
    scrollEl.scrollTop = originalScrollTop;
    if (trimmerCfg.enabled) {
      trimmer.resetToBaseVisible(trimmerCfg);
    }
  }

  resetSession(): void {
    this.#turnsMap.clear();
    this.#orderedIds.length = 0;
    blobDataUrlCache.clear();
  }
}
