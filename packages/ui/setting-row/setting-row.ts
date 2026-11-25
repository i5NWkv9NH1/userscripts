import { BaseComponent, css, customElement, html } from '@core';

@customElement('s-setting-row')
export class SettingRow extends BaseComponent {
  static readonly tagName = 's-setting-row' as const;
  static observedAttributes = ['label', 'hint', 'compact'];

  protected readonly stylesheet = css`
    :host {
      display: block;
    }

    :host([hidden]) {
      display: none;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .text-col {
      min-width: 0;
      flex: 1 1 auto;
    }

    .label {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      color: var(--s-text);
    }

    :host([compact]) .label {
      font-size: 12px;
      font-weight: 400;
    }

    .hint {
      font-size: 11px;
      line-height: 1.4;
      color: var(--s-text-muted);
      margin-top: 2px;

      &:empty {
        display: none;
      }
    }

    .control {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
  `;

  protected override onAttributeChange(): void {
    this.#syncText();
  }

  #syncText(): void {
    const labelEl = this.$<HTMLElement>('#label');
    const hintEl = this.$<HTMLElement>('#hint');
    if (labelEl) labelEl.textContent = this.getAttribute('label') ?? '';
    if (hintEl) hintEl.textContent = this.getAttribute('hint') ?? '';
  }

  protected override onMount(): void {
    this.#syncText();
  }

  protected render(): DocumentFragment {
    return html`
      <div class="row">
        <div class="text-col">
          <div id="label" class="label">${this.getAttribute('label') ?? ''}</div>
          <div id="hint" class="hint">${this.getAttribute('hint') ?? ''}</div>
        </div>
        <div class="control">
          <slot></slot>
        </div>
      </div>
    `;
  }
}
