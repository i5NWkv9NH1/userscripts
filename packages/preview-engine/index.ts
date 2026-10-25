import { BaseComponent, css, customElement, html } from '@core';
import { Icons, svgIcon } from '@ui';
import type { ExtractorRegistry } from './registry.ts';
import type { ChipPosition, ChipStyle, ResolvedMedia } from './types.ts';
import type { LensViewer } from './viewer-overlay.ts';

export { ExtractorRegistry } from './registry.ts';
export type {
  ChipPosition,
  ChipStyle,
  ExtractorContext,
  LensExtractor,
  LensPreferences,
  ResolvedMedia,
} from './types.ts';
export { LensViewer } from './viewer-overlay.ts';

@customElement('s-lens-trigger')
export class LensTrigger extends BaseComponent {
  static readonly tagName = 's-lens-trigger' as const;
  #activeMedia: ResolvedMedia | null = null;
  #viewer: LensViewer | null = null;
  #registry: ExtractorRegistry | null = null;
  #anchorEl: HTMLElement | null = null;
  #hideTimer: ReturnType<typeof setTimeout> | null = null;
  #hoveringSelf = false;
  #chipPos: ChipPosition = 'top-right';
  #chipStyle: ChipStyle = 'full';

  protected readonly stylesheet = css`
    :host {
      position: fixed;
      inset: 0 auto auto 0;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      pointer-events: auto;
      z-index: 2147483647;
    }

    .toolbar {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 6px 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      backdrop-filter: blur(18px) saturate(180%);
      -webkit-backdrop-filter: blur(18px) saturate(180%);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      font-size: 11px;
      font-weight: 600;
      transition: transform 0.15s ease;

      &:hover {
        transform: scale(1.04);
      }

      &[data-style="icon-only"] {
        padding: 6px;
        .tag-label,
        .mini-action {
          display: none;
        }
      }

      &[data-style="compact"] {
        padding: 4px 10px;
        .mini-action {
          display: none;
        }
      }
    }

    .main-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--s-text);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;

      &:hover {
        color: var(--s-accent);
      }
    }

    .mini-action {
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--s-surface);
      color: var(--s-text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition:
        background 0.15s,
        transform 0.15s;

      &:hover {
        background: var(--s-accent);
        color: #ffffff;
        transform: scale(1.1);
      }
    }
  `;

  configure(pos: ChipPosition, style: ChipStyle): void {
    this.#chipPos = pos;
    this.#chipStyle = style;
    const bar = this.$<HTMLElement>('#toolbar');
    if (bar) bar.setAttribute('data-style', style);
  }

  attachTo(
    anchor: HTMLElement,
    media: ResolvedMedia,
    viewer: LensViewer,
    registry: ExtractorRegistry
  ): void {
    this.#clearHideTimer();
    this.#anchorEl = anchor;
    this.#activeMedia = media;
    this.#viewer = viewer;
    this.#registry = registry;

    if (!this.isConnected) {
      document.documentElement.appendChild(this);
    }

    const visualTarget =
      anchor instanceof HTMLImageElement
        ? anchor
        : (anchor.querySelector<HTMLElement>('img') ?? anchor);

    const rect = visualTarget.getBoundingClientRect();
    // if (rect.width < 20 || rect.height < 20 || rect.bottom < 0 || rect.top > window.innerHeight) {
    if (rect.width < 16 || rect.height < 16 || rect.bottom < 0 || rect.top > window.innerHeight) {
      this.dismissImmediate();
      return;
    }

    const isSmallAvatar = rect.width < 76 || rect.height < 76;
    const bar = this.$<HTMLElement>('#toolbar');
    const effectiveStyle: ChipStyle = isSmallAvatar ? 'icon-only' : this.#chipStyle;
    if (bar) bar.setAttribute('data-style', effectiveStyle);

    const label = this.$<HTMLElement>('#tag-text');
    if (label) label.textContent = media.tag ?? 'HD ORIG';

    if (!this.matches(':popover-open')) {
      this.showPopover();
    }

    const selfRect = this.getBoundingClientRect();
    const chipW = selfRect.width || (effectiveStyle === 'icon-only' ? 30 : 120);
    const chipH = selfRect.height || 28;

    let top = rect.top + 6;
    let left = rect.right - chipW - 6;

    if (isSmallAvatar) {
      top = Math.max(6, rect.top - 4);
      left = Math.min(window.innerWidth - chipW - 6, rect.right - 10);
    } else {
      if (this.#chipPos.startsWith('bottom')) {
        top = rect.bottom - chipH - 6;
      }
      if (this.#chipPos.endsWith('left')) {
        left = rect.left + 6;
      }
    }

    top = Math.max(6, Math.min(window.innerHeight - chipH - 6, top));
    left = Math.max(6, Math.min(window.innerWidth - chipW - 6, left));

    this.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  scheduleDismiss(): void {
    this.#clearHideTimer();
    this.#hideTimer = setTimeout(() => {
      if (!this.#hoveringSelf) {
        this.dismissImmediate();
      }
    }, 130);
  }

  dismissImmediate(): void {
    this.#clearHideTimer();
    this.#anchorEl = null;
    if (this.isConnected && this.matches(':popover-open')) {
      this.hidePopover();
    }
  }

  get hasActiveTarget(): boolean {
    return this.#anchorEl !== null && this.#activeMedia !== null;
  }

  async openCurrentMedia(): Promise<void> {
    if (!this.#activeMedia || !this.#viewer) return;
    const media = this.#activeMedia;
    this.dismissImmediate();

    if (this.#registry) {
      const { items, index } = await this.#registry.collectPageGallery(media);
      this.#viewer.open(media, items, index);
    } else {
      this.#viewer.open(media);
    }
  }

  #clearHideTimer(): void {
    if (this.#hideTimer !== null) {
      clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
  }

  protected render(): DocumentFragment {
    return html`
      <div
        id="toolbar"
        class="toolbar select-none"
        data-style=${this.#chipStyle}
        @pointerenter=${() => {
          this.#hoveringSelf = true;
          this.#clearHideTimer();
        }}
        @pointerleave=${() => {
          this.#hoveringSelf = false;
          this.scheduleDismiss();
        }}
      >
        <button
          type="button"
          class="main-btn"
          title="点击开启无损灯箱 (支持 ← → 方向键切换上下图)"
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            void this.openCurrentMedia();
          }}
        >
          ${svgIcon(Icons.lens)}
          <span id="tag-text" class="tag-label">HD ORIG</span>
        </button>

        <button
          type="button"
          class="mini-action"
          title="在新标签页打开无损原图"
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (this.#activeMedia) {
              window.open(this.#activeMedia.originalUrl, '_blank', 'noopener,noreferrer');
            }
          }}
        >
          ${svgIcon(Icons.externalLink)}
        </button>
      </div>
    `;
  }

  protected override onMount(): void {
    this.setAttribute('popover', 'manual');
    this.on(
      window,
      'scroll',
      () => {
        if (this.matches(':popover-open')) {
          this.dismissImmediate();
        }
      },
      { capture: true, passive: true }
    );
  }
}
