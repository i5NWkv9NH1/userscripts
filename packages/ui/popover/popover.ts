// packages/ui/popover/popover.ts
import { BaseComponent, css, customElement, html, resolveLocale } from '@core';
import { Icons, svgIcon } from '../icons/index.ts';
import { closeTopLayerPopover } from './top-layer.ts';

export type DockPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

@customElement('s-popover')
export class Popover extends BaseComponent {
  static readonly tagName = 's-popover' as const;
  static observedAttributes = ['drag-title', 'minimize-title'];

  protected readonly stylesheet = css`
    :host {
      position: fixed;
      inset: auto 20px 20px auto;
      margin: 0;
      padding: 0;
      border: 1px solid var(--s-border);
      border-radius: 16px;
      background: var(--s-bg);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      width: 350px;
      max-width: calc(100vw - 32px);
      opacity: 0;
      /* * 遵循 animate-to-from-top-layer：allow-discrete 必须单独声明，不能放进 transition 简写 */
      transition-property: opacity, transform, inset, display, overlay;
      transition-duration: 0.24s, 0.24s, 0.28s, 0.24s, 0.24s;
      transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
      transition-behavior: allow-discrete;

      @media (prefers-reduced-motion: no-preference) {
        transform: translateY(10px) scale(0.96);
      }
    }

    :host(:popover-open) {
      opacity: 1;

      @starting-style {
        opacity: 0;
      }

      @media (prefers-reduced-motion: no-preference) {
        transform: translateY(0) scale(1);

        @starting-style {
          transform: translateY(10px) scale(0.95);
        }
      }
    }

    :host([data-closing]) {
      opacity: 0;

      @media (prefers-reduced-motion: no-preference) {
        transform: translateY(10px) scale(0.96);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        transition-duration: 0.1s;
      }
    }

    .panel-header {
      padding: 11px 15px;
      border-bottom: 1px solid var(--s-border);
      -webkit-user-select: none;
      user-select: none;
    }

    .icon-btn {
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: var(--s-text-muted);
      cursor: pointer;
      transition:
        background 0.15s,
        color 0.15s,
        transform 0.15s;

      &:hover {
        background: var(--s-surface-hover);
        color: var(--s-text);
      }
    }

    .panel-body {
      padding: 14px 16px;
      max-height: 78vh;
      overflow-y: auto;
    }
  `;

  get headerEl(): HTMLElement | null {
    return this.$<HTMLElement>('.panel-header');
  }

  protected override onAttributeChange(): void {
    const header = this.$<HTMLElement>('.panel-header');
    const minBtn = this.$<HTMLButtonElement>('#btn-minimize');
    const isEn = resolveLocale() === 'en';
    if (header) {
      header.title =
        this.getAttribute('drag-title') ??
        (isEn
          ? 'Drag to move and snap to screen edge; arrow keys work when focused'
          : '按住这里可拖动并贴边停靠，聚焦后也可用方向键微调');
    }
    if (minBtn) {
      const minLabel =
        this.getAttribute('minimize-title') ?? (isEn ? 'Minimize to button' : '收起成小按钮');
      minBtn.title = minLabel;
      minBtn.setAttribute('aria-label', minLabel);
    }
  }

  protected render(): DocumentFragment {
    const isEn = resolveLocale() === 'en';
    const dragTitle =
      this.getAttribute('drag-title') ??
      (isEn
        ? 'Drag to move and snap to screen edge; arrow keys work when focused'
        : '按住这里可拖动并贴边停靠，聚焦后也可用方向键微调');
    const minTitle =
      this.getAttribute('minimize-title') ?? (isEn ? 'Minimize to button' : '收起成小按钮');

    return html`
      <div
        part="header"
        class="panel-header flex items-center justify-between select-none"
        title=${dragTitle}
      >
        <div class="font-semibold text-sm flex items-center gap-2">
          <slot name="title">Sora Panel</slot>
        </div>
        <div class="flex items-center gap-1">
          <slot name="header-actions"></slot>
          <button
            id="btn-minimize"
            class="icon-btn inline-flex items-center justify-center"
            type="button"
            title=${minTitle}
            aria-label=${minTitle}
            @click=${() => {
              void closeTopLayerPopover(this.host);
              this.dispatchEvent(new CustomEvent('minimize', { bubbles: true, composed: true }));
            }}
          >
            ${svgIcon(Icons.minimize)}
          </button>
        </div>
      </div>
      <div part="body" class="panel-body flex flex-col gap-3">
        <slot></slot>
      </div>
    `;
  }

  protected override onMount(): void {
    if (!this.hasAttribute('popover')) {
      this.setAttribute('popover', 'manual');
    }
  }
}
