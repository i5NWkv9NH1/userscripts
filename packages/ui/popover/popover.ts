// packages/ui/popover/popover.ts
import { BaseComponent, css, customElement, html } from '@core';
import { Icons, svgIcon } from '../icons/index.ts';

export type DockPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

@customElement('s-popover')
export class Popover extends BaseComponent {
  static readonly tagName = 's-popover' as const;

  protected readonly stylesheet = css`
    :host {
      position: fixed;
      inset: auto 24px 24px auto;
      margin: 0;
      padding: 0;
      border: 1px solid var(--s-border);
      border-radius: 16px;
      background: var(--s-bg);
      backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      min-width: 330px;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition:
        opacity 0.26s cubic-bezier(0.22, 1, 0.36, 1),
        transform 0.26s cubic-bezier(0.22, 1, 0.36, 1),
        inset 0.3s cubic-bezier(0.22, 1, 0.36, 1),
        display 0.26s allow-discrete,
        overlay 0.26s allow-discrete;
    }

    :host([data-pos='bottom-right']) {
      inset: auto 24px 24px auto;
      transform-origin: bottom right;
    }

    :host([data-pos='bottom-left']) {
      inset: auto auto 24px 24px;
      transform-origin: bottom left;
    }

    :host([data-pos='top-right']) {
      inset: 24px 24px auto auto;
      transform-origin: top right;
    }

    :host([data-pos='top-left']) {
      inset: 24px auto auto 24px;
      transform-origin: top left;
    }

    :host(:popover-open) {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    @starting-style {
      :host(:popover-open) {
        opacity: 0;
        transform: translateY(12px) scale(0.95);
      }
    }

    .panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--s-border);
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
      transition: background 0.15s, color 0.15s, transform 0.15s;

      &:hover {
        background: var(--s-surface-hover);
        color: var(--s-text);
        transform: scale(1.06);
      }
    }

    .panel-body {
      padding: 14px 16px;
    }
  `;

  setPosition(pos: DockPosition): void {
    this.setAttribute('data-pos', pos);
  }

  protected render(): DocumentFragment {
    return html`
      <div class='panel-header flex items-center justify-between select-none'>
        <div class='font-semibold text-sm flex items-center gap-2'>
          <slot name='title'>Sora Panel</slot>
        </div>
        <div class='flex items-center gap-1'>
          <slot name='header-actions'></slot>
          <button
            class='icon-btn inline-flex items-center justify-center'
            type='button'
            title='收纳面板'
            @click=${() => {
              this.hidePopover();
              this.dispatchEvent(new CustomEvent('minimize', { bubbles: true, composed: true }));
            }}
          >
            ${svgIcon(Icons.minimize)}
          </button>
        </div>
      </div>
      <div class='panel-body flex flex-col gap-3'>
        <slot></slot>
      </div>
    `;
  }

  protected override onMount(): void {
    if (!this.hasAttribute('popover')) {
      this.setAttribute('popover', 'manual');
    }
    if (!this.hasAttribute('data-pos')) {
      this.setAttribute('data-pos', 'bottom-right');
    }
  }
}
