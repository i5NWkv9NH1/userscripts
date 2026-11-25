// packages/ui/switch/switch.ts
import { BaseComponent, css, customElement, html } from '@core';

@customElement('s-switch')
export class Switch extends BaseComponent {
  static readonly tagName = 's-switch' as const;
  static observedAttributes = ['checked', 'disabled', 'aria-label'];

  #checked = false;
  #disabled = false;

  protected readonly stylesheet = css`
    :host {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
    }

    :host([hidden]) {
      display: none;
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

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &:focus-visible {
        outline: 3px solid var(--s-accent);
        outline-offset: 2px;
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
    const next = Boolean(val);
    if (this.#checked === next && this.hasAttribute('checked') === next) return;
    this.#checked = next;
    this.toggleAttribute('checked', next);
    const btn = this.$<HTMLButtonElement>('.track');
    if (btn) {
      btn.setAttribute('aria-checked', String(next));
    }
  }

  get disabled(): boolean {
    return this.#disabled;
  }

  set disabled(val: boolean) {
    const next = Boolean(val);
    if (this.#disabled === next && this.hasAttribute('disabled') === next) return;
    this.#disabled = next;
    this.toggleAttribute('disabled', next);
    const btn = this.$<HTMLButtonElement>('.track');
    if (btn) {
      btn.disabled = next;
    }
  }

  protected override onAttributeChange(
    name: string,
    oldVal: string | null,
    newVal: string | null
  ): void {
    if (oldVal === newVal) return;
    if (name === 'checked') {
      this.checked = newVal !== null;
    } else if (name === 'disabled') {
      this.disabled = newVal !== null;
    } else if (name === 'aria-label') {
      const btn = this.$<HTMLButtonElement>('.track');
      if (btn) {
        if (newVal) btn.setAttribute('aria-label', newVal);
        else btn.removeAttribute('aria-label');
      }
    }
  }

  protected override onMount(): void {
    if (this.hasAttribute('checked')) {
      this.#checked = true;
    }
    if (this.hasAttribute('disabled')) {
      this.#disabled = true;
    }
    const btn = this.$<HTMLButtonElement>('.track');
    if (btn) {
      btn.setAttribute('aria-checked', String(this.#checked));
      btn.disabled = this.#disabled;
      const label = this.getAttribute('aria-label');
      if (label) btn.setAttribute('aria-label', label);
    }
  }

  protected render(): DocumentFragment {
    return html`
      <button
        type="button"
        role="switch"
        class="track"
        aria-checked=${String(this.#checked)}
        ?disabled=${this.#disabled}
        @click=${() => {
          if (this.#disabled) return;
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
