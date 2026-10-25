import { BaseComponent, css, customElement, html } from '@core';
import { Icons, svgIcon } from '@ui';
import { ExtractorRegistry } from './registry.ts';
import type { ResolvedMedia } from './types.ts';
import { LensViewer } from './viewer-overlay.ts';

export { ExtractorRegistry } from './registry.ts';
export type { ExtractorContext, LensExtractor, ResolvedMedia } from './types.ts';
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
    }

    .main-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 4px;
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
      transition: background 0.15s, transform 0.15s;

      &:hover {
        background: var(--s-accent);
        color: #ffffff;
        transform: scale(1.1);
      }
    }
  `;

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
    if (rect.width < 40 || rect.height < 40 || rect.bottom < 0 || rect.top > window.innerHeight) {
      this.dismissImmediate();
      return;
    }

    const top = Math.max(8, rect.top + 8);
    const left = Math.max(8, Math.min(window.innerWidth - 165, rect.right - 155));

    this.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    const label = this.$<HTMLElement>('#tag-text');
    if (label) label.textContent = media.tag ?? 'HD ORIG';

    if (!this.matches(':popover-open')) {
      this.showPopover();
    }
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

  get currentAnchor(): HTMLElement | null {
    return this.#anchorEl;
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
        class='toolbar select-none'
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
          type='button'
          class='main-btn'
          title='点击开启无损灯箱 (支持 ← → 方向键切换上下图)'
          @click=${(e: MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            void this.openCurrentMedia();
          }}
        >
          ${svgIcon(Icons.lens)}
          <span id='tag-text'>HD ORIG</span>
        </button>

        <button
          type='button'
          class='mini-action'
          title='在新标签页打开无损原图'
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
