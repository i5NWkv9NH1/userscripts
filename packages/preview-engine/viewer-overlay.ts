import {
    BaseComponent,
    createLogger,
    css,
    customElement,
    html,
    useHotkey,
} from '@core';
import { Icons, svgIcon } from '@ui';
import { GestureController } from './gesture-controller.ts';
import type { ResolvedMedia } from './types.ts';

const logger = createLogger('LensViewer');

@customElement('s-lens-viewer')
export class LensViewer extends BaseComponent {
  static readonly tagName = 's-lens-viewer' as const;
  #gesture: GestureController | null = null;
  #currentMedia: ResolvedMedia | null = null;
  #gallery: ResolvedMedia[] = [];
  #currentIndex = 0;

  protected readonly stylesheet = css`
    :host {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 0;
      border: none;
      background: light-dark(rgba(244, 244, 250, 0.9), rgba(10, 10, 14, 0.92));
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      opacity: 0;
      transition:
        opacity 0.2s ease,
        display 0.2s allow-discrete,
        overlay 0.2s allow-discrete;
    }

    :host(:popover-open) {
      opacity: 1;
    }

    @starting-style {
      :host(:popover-open) {
        opacity: 0;
      }
    }

    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      user-select: none;
    }

    .canvas-img {
      max-width: 86vw;
      max-height: 82vh;
      object-fit: contain;
      border-radius: 10px;
      box-shadow: var(--s-shadow);
      cursor: grab;
      will-change: transform;
      transition: opacity 0.18s ease;

      &:active {
        cursor: grabbing;
      }
    }

    .hud-top {
      position: absolute;
      top: 20px;
      left: 24px;
      right: 24px;
      pointer-events: none;
      z-index: 2;
    }

    .hud-pill {
      pointer-events: auto;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      box-shadow: var(--s-shadow);
    }

    .nav-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease, background 0.15s ease;
      z-index: 2;

      &:hover {
        background: var(--s-surface-hover);
        transform: translateY(-50%) scale(1.08);
      }
    }

    .nav-prev { left: 24px; }
    .nav-next { right: 24px; }

    .dock {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 12px;
      border-radius: 14px;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      box-shadow: var(--s-shadow);
      z-index: 2;
    }
  `;

  open(media: ResolvedMedia, gallery: ResolvedMedia[] = [media], index = 0): void {
    this.#gallery = gallery.length > 0 ? gallery : [media];
    this.#currentIndex = Math.min(Math.max(0, index), this.#gallery.length - 1);
    if (!this.isConnected) {
      document.documentElement.appendChild(this);
    }
    this.#loadCurrentIndex();
    if (!this.matches(':popover-open')) {
      this.showPopover();
    }
  }

  navigate(step: 1 | -1): void {
    if (this.#gallery.length <= 1) return;
    this.#currentIndex =
      (this.#currentIndex + step + this.#gallery.length) % this.#gallery.length;
    this.#loadCurrentIndex();
  }

  #loadCurrentIndex(): void {
    const media = this.#gallery[this.#currentIndex];
    if (!media) return;
    this.#currentMedia = media;

    const img = this.$<HTMLImageElement>('#main-img');
    const tagEl = this.$<HTMLElement>('#media-tag');
    const dimEl = this.$<HTMLElement>('#media-dim');
    const idxEl = this.$<HTMLElement>('#gallery-idx');

    if (img) {
      img.style.opacity = '0.35';
      img.src = media.originalUrl;
    }
    if (tagEl) tagEl.textContent = media.tag ?? 'HD ORIG';
    if (dimEl) dimEl.textContent = '加载原图中...';
    if (idxEl) {
      idxEl.textContent = `${this.#currentIndex + 1} / ${this.#gallery.length}`;
    }

    this.#gesture?.reset();
  }

  async #downloadOriginal(): Promise<void> {
    if (!this.#currentMedia) return;
    const url = this.#currentMedia.originalUrl;
    let objectUrl: string | null = null;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      const ext = blob.type.split('/')[1] ?? 'jpg';
      a.download = `sora-lens-${Date.now()}.${ext}`;
      a.click();
      logger.success('无损原图下载成功，即将释放 Blob 内存');
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      if (objectUrl) {
        const toRevoke = objectUrl;
        setTimeout(() => URL.revokeObjectURL(toRevoke), 1500);
      }
    }
  }

  protected render(): DocumentFragment {
    return html`
      <div
        id='stage'
        class='stage'
        @click=${(e: MouseEvent) => {
          if (e.target === e.currentTarget) this.hidePopover();
        }}
      >
        <div class='hud-top flex items-center justify-between'>
          <div class='hud-pill flex items-center gap-2 text-xs'>
            <span id='media-tag' class='s-badge'>ORIG</span>
            <span id='gallery-idx' class='font-mono font-semibold'>1 / 1</span>
            <span id='media-dim' class='font-mono text-muted'>0 × 0</span>
            <span id='zoom-val' class='font-mono'>100%</span>
          </div>
          <button
            type='button'
            class='s-btn hud-pill'
            @click=${() => this.hidePopover()}
          >
            ${svgIcon(Icons.close)}
            <span>关闭 (Esc)</span>
          </button>
        </div>

        <button
          type='button'
          class='nav-arrow nav-prev'
          title='上一张 (← 或 ↑)'
          @click=${() => this.navigate(-1)}
        >
          ${svgIcon(Icons.chevronLeft)}
        </button>

        <img
          id='main-img'
          class='canvas-img'
          alt='Sora Lens Preview'
          @load=${(e: Event) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.opacity = '1';
            const dimEl = this.$<HTMLElement>('#media-dim');
            if (dimEl) {
              dimEl.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
            }
          }}
        />

        <button
          type='button'
          class='nav-arrow nav-next'
          title='下一张 (→ 或 ↓)'
          @click=${() => this.navigate(1)}
        >
          ${svgIcon(Icons.chevronRight)}
        </button>

        <div class='dock flex items-center gap-2'>
          <button type='button' class='s-btn' title='上一张 (←)' @click=${() => this.navigate(-1)}>
            ${svgIcon(Icons.chevronLeft)}
          </button>
          <button type='button' class='s-btn' title='下一张 (→)' @click=${() => this.navigate(1)}>
            ${svgIcon(Icons.chevronRight)}
          </button>
          <button type='button' class='s-btn' title='放大' @click=${() => this.#gesture?.zoomBy(1.25)}>
            ${svgIcon(Icons.zoomIn)}
          </button>
          <button type='button' class='s-btn' title='缩小' @click=${() => this.#gesture?.zoomBy(0.8)}>
            ${svgIcon(Icons.zoomOut)}
          </button>
          <button type='button' class='s-btn' title='逆时针旋转 90°' @click=${() => this.#gesture?.rotateBy(-90)}>
            ${svgIcon(Icons.rotateLeft)}
          </button>
          <button type='button' class='s-btn' title='顺时针旋转 90°' @click=${() => this.#gesture?.rotateBy(90)}>
            ${svgIcon(Icons.rotateRight)}
          </button>
          <button type='button' class='s-btn' title='水平镜像' @click=${() => this.#gesture?.toggleFlipX()}>
            ${svgIcon(Icons.flipH)}
          </button>
          <button type='button' class='s-btn' title='复位 1:1' @click=${() => this.#gesture?.reset()}>
            ${svgIcon(Icons.reset)}
          </button>
          <button type='button' class='s-btn s-btn-primary' @click=${() => this.#downloadOriginal()}>
            ${svgIcon(Icons.download)}
            <span>保存原图</span>
          </button>
        </div>
      </div>
    `;
  }

  protected override onMount(): void {
    this.setAttribute('popover', 'manual');
    const stage = this.$<HTMLElement>('#stage');
    const img = this.$<HTMLElement>('#main-img');
    const zoomEl = this.$<HTMLElement>('#zoom-val');

    if (stage && img) {
      this.#gesture = new GestureController(stage, img, (st) => {
        if (zoomEl) zoomEl.textContent = `${Math.round(st.scale * 100)}%`;
      });
    }

    useHotkey(
      {
        Escape: () => {
          if (this.matches(':popover-open')) this.hidePopover();
        },
        ArrowLeft: (ev) => {
          if (!this.matches(':popover-open')) return;
          ev.preventDefault();
          this.navigate(-1);
        },
        ArrowUp: (ev) => {
          if (!this.matches(':popover-open')) return;
          ev.preventDefault();
          this.navigate(-1);
        },
        ArrowRight: (ev) => {
          if (!this.matches(':popover-open')) return;
          ev.preventDefault();
          this.navigate(1);
        },
        ArrowDown: (ev) => {
          if (!this.matches(':popover-open')) return;
          ev.preventDefault();
          this.navigate(1);
        },
      },
      this.scope.signal
    );
  }

  protected override onDestroy(): void {
    this.#gesture?.[Symbol.dispose]();
    this.#gesture = null;
  }
}
