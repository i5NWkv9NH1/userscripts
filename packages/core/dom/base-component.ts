// packages/core/dom/base-component.ts
import { getAtomicThemeSheet } from '../composables/use-style.ts';
import { bindFragmentEvents } from './template.ts';

type ComponentConstructor = abstract new (...args: never[]) => BaseComponent;

// const sheetCache = new WeakMap<Function, CSSStyleSheet>();
const sheetCache = new WeakMap<ComponentConstructor, CSSStyleSheet>();

export abstract class BaseComponent extends HTMLElement implements Disposable {
  declare readonly shadowRoot: ShadowRoot;
  protected scope = new AbortController();

  protected abstract readonly stylesheet: string;
  protected abstract render(): DocumentFragment;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    if (this.scope.signal.aborted) {
      this.scope = new AbortController();
    }

    this.adoptComponentStyles();
    const fragment = this.render();
    bindFragmentEvents(fragment, this.scope.signal);
    this.shadowRoot.replaceChildren(fragment);
    this.onMount();
  }

  disconnectedCallback(): void {
    this[Symbol.dispose]();
  }

  [Symbol.dispose](): void {
    if (!this.scope.signal.aborted) {
      this.scope.abort();
      this.onDestroy();
    }
  }

  protected onMount(): void {}
  protected onDestroy(): void {}

  protected on<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    listener: (ev: HTMLElementEventMap[K]) => void,
    options?: Omit<AddEventListenerOptions, 'signal'>
  ): void;
  protected on(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: Omit<AddEventListenerOptions, 'signal'>
  ): void;
  protected on(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | ((ev: any) => void),
    options?: Omit<AddEventListenerOptions, 'signal'>
  ): void {
    if (this.scope.signal.aborted) return;
    target.addEventListener(type, listener as EventListener, {
      ...options,
      signal: this.scope.signal,
    });
  }

  protected $<T extends Element = HTMLElement>(selector: string): T | null {
    return this.shadowRoot.querySelector<T>(selector);
  }

  private adoptComponentStyles(): void {
    const ctor = this.constructor as ComponentConstructor;
    let sheet = sheetCache.get(ctor);
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(this.stylesheet);
      sheetCache.set(ctor, sheet);
    }
    this.shadowRoot.adoptedStyleSheets = [getAtomicThemeSheet(), sheet];
  }
}

export function defineComponent(tagName: `s-${string}`, ctor: CustomElementConstructor): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, ctor);
  }
}

export function customElement(tagName: `s-${string}`) {
  return <T extends CustomElementConstructor>(value: T, _context: ClassDecoratorContext<T>) => {
    defineComponent(tagName, value);
  };
}
