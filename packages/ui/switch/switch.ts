// packages/ui/switch/switch.ts
import { BaseComponent, css, customElement, html } from '@core';

@customElement('s-switch')
export class Switch extends BaseComponent {
  static readonly tagName = 's-switch' as const;
  #checked = false;

  protected readonly stylesheet = css`
    :host {
      display: inline-flex;
      align-items: center;
    }

    .track {
      position: relative;
      width: 40px;
      height: 22px;
      padding: 2px;
      border: 1px solid var(--s-border);
      border-radius: 999px;
      background: var(--s-surface);
      cursor: pointer;
      transition: background 0.2s cubic-bezier(0.16, 1, 0.3, 1);

      &[aria-checked="true"] {
        background: var(--s-accent);
        border-color: transparent;
      }
    }

    .thumb {
      display: block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }

    .track[aria-checked="true"] .thumb {
      transform: translateX(18px);
    }
  `;

  get checked(): boolean {
    return this.#checked;
  }

  set checked(val: boolean) {
    this.#checked = Boolean(val);
    const btn = this.$<HTMLButtonElement>('.track');
    if (btn) {
      btn.setAttribute('aria-checked', String(this.#checked));
    }
  }

  protected render(): DocumentFragment {
    return html`
      <button
        type="button"
        role="switch"
        class="track"
        aria-checked=${String(this.#checked)}
        @click=${() => {
          this.checked = !this.#checked;
          this.dispatchEvent(
            new CustomEvent<boolean>('change', {
              detail: this.#checked,
              bubbles: true,
              composed: true,
            })
          );
        }}
      >
        <span class="thumb"></span>
      </button>
    `;
  }
}
