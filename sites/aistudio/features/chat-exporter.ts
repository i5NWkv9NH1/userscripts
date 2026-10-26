import type { DomTrimmerEngine, TrimmerConfig } from './dom-trimmer.ts';

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
  readonly dataUrl: string;
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

function imageElementToDataUrl(img: HTMLImageElement): string | null {
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

function htmlToMarkdown(node: Node | null): string {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tagName = el.tagName.toLowerCase();

  // # 忽略思考块、图片控制栏与 Material 图标字体文字（避免出现 download fullscreen 乱码）
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
    case 'a': {
      let href = el.getAttribute('href') ?? '';
      if (href.startsWith('https://www.google.com/url?sa=')) {
        try {
          href = new URL(href).searchParams.get('q') ?? href;
        } catch {}
      }
      return `[${childrenMd}](${href})`;
    }
    case 'ul':
    case 'ol':
      return `\n${childrenMd}\n`;
    case 'li': {
      const parentList = el.closest('ul, ol');
      if (parentList?.tagName.toLowerCase() === 'ol') {
        const items = Array.from(parentList.querySelectorAll(':scope > li'));
        const idx = items.indexOf(el) + 1;
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

export class ChatExporterEngine {
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

    // 1. 提取 <ms-image-chunk> 中的图片并转为 Base64 缓存
    const images: ImageAttachment[] = [];
    const imgElements = turn.querySelectorAll<HTMLImageElement>(
      'ms-image-chunk img.loaded-image, ms-prompt-chunk img'
    );
    for (const imgEl of imgElements) {
      const dataUrl = imageElementToDataUrl(imgEl);
      if (dataUrl) {
        images.push({
          alt: imgEl.alt || 'image.png',
          dataUrl,
        });
      }
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

  exportSnapshot(options: ExportOptions, customOrder?: string[]): void {
    this.captureVisibleTurns();
    const order = customOrder && customOrder.length > 0 ? customOrder : this.#orderedIds;
    const meta = this.collectSessionMetadata(options.includeSystem);
    const date = new Date().toISOString().slice(0, 10);

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
          msg.images = options.includeImagesBase64
            ? item.images
            : item.images.map((img) => ({ alt: img.alt }));
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
      if (systemPrompt) {
        lines.push(`system_instructions: |\n  ${systemPrompt.replace(/\n/g, '\n  ')}`);
      }
      lines.push('---', '', `# ${title}`, '');

      for (const id of order) {
        const item = this.#turnsMap.get(id);
        if (!item) continue;
        let text = options.stripEmojis ? stripEmojisSafe(item.markdown) : item.markdown;
        const thoughts = options.stripEmojis ? stripEmojisSafe(item.thoughts) : item.thoughts;

        const imgLines: string[] = [];
        for (const img of item.images) {
          if (options.includeImagesBase64) {
            imgLines.push(`![${img.alt}](${img.dataUrl})`);
          } else {
            imgLines.push(`> [上传图片附件: ${img.alt}]`);
          }
        }

        if (imgLines.length > 0) {
          text = `${imgLines.join('\n\n')}${text ? `\n\n${text}` : ''}`;
        }

        if (options.includeThoughts && thoughts) {
          text = `<details>\n<summary>Gemini 思考过程 (Thoughts)</summary>\n\n${thoughts}\n\n</details>\n\n${text}`;
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
    trimmer: DomTrimmerEngine,
    trimmerCfg: TrimmerConfig,
    options: ExportOptions,
    onProgress: (statusText: string) => void
  ): Promise<void> {
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
    onProgress('正滚回页面顶部...');

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

      onProgress(`已扫描 ${chronologicalIds.length} 条对话...`);
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (scrollEl.scrollTop >= maxScroll || scrollEl.scrollTop === lastScroll) {
        break;
      }
      lastScroll = scrollEl.scrollTop;
      scrollEl.scrollTop += step;
      await new Promise((r) => setTimeout(r, 120));
    }

    this.exportSnapshot(options, chronologicalIds);
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
