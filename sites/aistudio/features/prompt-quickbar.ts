import { BaseComponent, css, customElement, html, resolveLocale, useI18n } from '@core';
import { Icons, svgIcon } from '@ui';

const QUICKBAR_DICT = {
  'zh-CN': {
    collapseCode: '收起代码',
    collapseTitle: '把当前可见对话里展开的代码块收起',
    expandCode: '展开代码',
    expandTitle: '把当前可见对话里收起的代码块展开',
    scrollLatest: '最新对话',
    scrollTitle: '滚动到最新一轮对话底部',
  },
  en: {
    collapseCode: 'Collapse',
    collapseTitle: 'Collapse expanded code blocks in visible turns',
    expandCode: 'Expand',
    expandTitle: 'Expand collapsed code blocks in visible turns',
    scrollLatest: 'Latest',
    scrollTitle: 'Scroll to the latest conversation turn',
  },
} as const;

@customElement('s-aistudio-quickbar')
export class PromptQuickbar extends BaseComponent {
  static readonly tagName = 's-aistudio-quickbar' as const;

  #onCollapse?: () => void;
  #onExpand?: () => void;
  #onScrollLatest?: () => void;
  #rafId: number | null = null;
  #mode: 'inline' | 'floating' = 'inline';

  protected readonly stylesheet = css`
    :host {
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
      flex-shrink: 0;
    }

    :host([data-mode="floating"]) {
      position: fixed;
      inset: 0 auto auto 0;
      margin-right: 0;
      z-index: 900;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.16s ease;
    }

    :host([data-mode="floating"][data-visible="true"]) {
      opacity: 1;
    }

    .bar {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    :host([data-mode="floating"]) .bar {
      padding: 4px;
      border-radius: 999px;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      backdrop-filter: blur(16px) saturate(160%);
      -webkit-backdrop-filter: blur(16px) saturate(160%);
      box-shadow: var(--s-shadow);
    }

    .qbtn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 32px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--s-border);
      background: var(--s-surface);
      color: var(--s-text);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;

      &:hover {
        background: var(--s-surface-hover);
      }
    }
  `;

  setActions(onCollapse: () => void, onExpand: () => void, onScrollLatest: () => void): void {
    this.#onCollapse = onCollapse;
    this.#onExpand = onExpand;
    this.#onScrollLatest = onScrollLatest;
  }

  ensureAttached(): void {
    if (this.#rafId !== null) return;
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null;
      this.#attachOrReposition();
    });
  }

  #attachOrReposition(): void {
    // * 依据 AI Studio footer DOM，优先嵌入 ms-prompt-box 右侧操作区（麦克风和 Run 按钮左侧）
    const trailing = document.querySelector<HTMLElement>(
      'ms-prompt-box .buttons-row .panel-controls-trailing'
    );
    if (trailing) {
      if (this.#mode !== 'inline') {
        this.#mode = 'inline';
        this.setAttribute('data-mode', 'inline');
        this.removeAttribute('data-visible');
        this.style.transform = '';
      }
      if (this.host.parentElement !== trailing) {
        const anchorBtn =
          trailing.querySelector('ms-stt-button') ?? trailing.querySelector('ms-run-button');
        this.mountTo(trailing, anchorBtn ?? null);
      }
      return;
    }

    // * 找不到底部按钮栏时退回贴在 ms-prompt-box 上方浮动
    const box = document.querySelector<HTMLElement>('ms-prompt-box');
    if (this.#mode !== 'floating') {
      this.#mode = 'floating';
      this.setAttribute('data-mode', 'floating');
    }
    if (!this.isConnected) {
      this.mountTo(document.documentElement);
    }
    if (!box) {
      this.removeAttribute('data-visible');
      return;
    }

    const rect = box.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 20 || rect.top > window.innerHeight || rect.bottom < 0) {
      this.removeAttribute('data-visible');
      return;
    }

    const selfRect = this.getBoundingClientRect();
    const barW = selfRect.width || 210;
    const barH = selfRect.height || 36;
    const top = Math.max(8, Math.round(rect.top - barH - 8));
    const left = Math.max(8, Math.min(window.innerWidth - barW - 8, Math.round(rect.right - barW)));

    this.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    this.setAttribute('data-visible', 'true');
  }

  #syncLocaleTexts(): void {
    const t = QUICKBAR_DICT[resolveLocale()];
    const btnCollapse = this.$<HTMLButtonElement>('#btn-collapse');
    const lblCollapse = this.$<HTMLElement>('#lbl-collapse');
    const btnExpand = this.$<HTMLButtonElement>('#btn-expand');
    const lblExpand = this.$<HTMLElement>('#lbl-expand');
    const btnScroll = this.$<HTMLButtonElement>('#btn-scroll');
    const lblScroll = this.$<HTMLElement>('#lbl-scroll');

    if (btnCollapse) btnCollapse.title = t.collapseTitle;
    if (lblCollapse) lblCollapse.textContent = t.collapseCode;
    if (btnExpand) btnExpand.title = t.expandTitle;
    if (lblExpand) lblExpand.textContent = t.expandCode;
    if (btnScroll) btnScroll.title = t.scrollTitle;
    if (lblScroll) lblScroll.textContent = t.scrollLatest;
    this.ensureAttached();
  }

  protected override onMount(): void {
    this.#syncLocaleTexts();
  }

  protected override onConnect(): void {
    useI18n(QUICKBAR_DICT, this.scope.signal, () => this.#syncLocaleTexts());
    this.on(window, 'resize', () => this.ensureAttached(), { passive: true });
    this.ensureAttached();
  }

  protected override onDisconnect(): void {
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  protected render(): DocumentFragment {
    const t = QUICKBAR_DICT[resolveLocale()];
    return html`
      <div class="bar select-none">
        <button
          id="btn-collapse"
          type="button"
          class="qbtn"
          title=${t.collapseTitle}
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            this.#onCollapse?.();
          }}
        >
          ${svgIcon(Icons.collapseCode)}
          <span id="lbl-collapse">${t.collapseCode}</span>
        </button>
        <button
          id="btn-expand"
          type="button"
          class="qbtn"
          title=${t.expandTitle}
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            this.#onExpand?.();
          }}
        >
          ${svgIcon(Icons.expandCode)}
          <span id="lbl-expand">${t.expandCode}</span>
        </button>
        <button
          id="btn-scroll"
          type="button"
          class="qbtn"
          title=${t.scrollTitle}
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            this.#onScrollLatest?.();
          }}
        >
          ${svgIcon(Icons.arrowDown)}
          <span id="lbl-scroll">${t.scrollLatest}</span>
        </button>
      </div>
    `;
  }
}
