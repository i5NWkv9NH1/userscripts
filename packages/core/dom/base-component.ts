// packages/core/dom/base-component.ts
import {
  createAdoptedStyleSheet,
  getAtomicThemeCssText,
  getAtomicThemeSheet,
} from '../composables/use-style.ts';
import { bindFragmentEvents } from './template.ts';

export interface ComponentConstructor<T extends BaseComponent = BaseComponent> {
  new (host: HTMLElement): T;
  readonly tagName: string;
  readonly delegatesFocus?: boolean;
  readonly observedAttributes?: readonly string[];
}

export type ComponentElement<T extends BaseComponent> = HTMLElement & T;

const sheetCache = new WeakMap<ComponentConstructor, CSSStyleSheet>();
const componentDefs = new Map<string, ComponentConstructor>();
const hostControllerMap = new WeakMap<Element, BaseComponent>();

const BASE_PROTO_KEYS = new Set<PropertyKey>([
  'constructor',
  'host',
  'shadowRoot',
  'scope',
  'stylesheet',
  'render',
  'rerender',
  'onMount',
  'onConnect',
  'onDisconnect',
  'onDestroy',
  'onAttributeChange',
  'on',
  '$',
  '$$',
  'adoptComponentStyles',
  'style',
  'classList',
  'isConnected',
  'getAttribute',
  'setAttribute',
  'removeAttribute',
  'hasAttribute',
  'dispatchEvent',
  'matches',
  'remove',
  'getBoundingClientRect',
  'showPopover',
  'hidePopover',
]);

let contentObserverStarted = false;

function hasNativeCustomElements(): boolean {
  return (
    typeof customElements !== 'undefined' &&
    customElements !== null &&
    typeof customElements.define === 'function'
  );
}

// * 把控制器类上的公开属性、getter/setter 和方法映射到宿主 HTMLElement 上，保证外界通过 DOM 引用访问时行为一致
function exposeComponentApi(host: HTMLElement, ctrl: BaseComponent): void {
  let proto: object | null = Object.getPrototypeOf(ctrl);
  while (proto && proto !== BaseComponent.prototype && proto !== Object.prototype) {
    for (const key of Reflect.ownKeys(proto)) {
      if (BASE_PROTO_KEYS.has(key)) continue;
      if (key in host && Object.getOwnPropertyDescriptor(host, key)) continue;
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (!desc) continue;

      if (typeof desc.value === 'function') {
        const fn = desc.value as (...args: unknown[]) => unknown;
        Object.defineProperty(host, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value: (...args: unknown[]) => fn.apply(ctrl, args),
        });
      } else {
        Object.defineProperty(host, key, {
          configurable: true,
          enumerable: desc.enumerable ?? true,
          get: desc.get ? () => desc.get!.call(ctrl) : undefined,
          set: desc.set ? (val: unknown) => desc.set!.call(ctrl, val) : undefined,
        });
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
}

function collectControllersInRoot(root: ParentNode, out: BaseComponent[]): void {
  const walk = (node: ParentNode) => {
    for (const el of node.children) {
      const ctrl = hostControllerMap.get(el);
      if (ctrl) out.push(ctrl);
      if (el.shadowRoot) walk(el.shadowRoot);
      if (el.children.length > 0) walk(el);
    }
  };
  walk(root);
}

function syncContentDisconnects(node: Node): void {
  if (!(node instanceof Element)) return;
  const ctrl = hostControllerMap.get(node);
  if (ctrl) {
    ctrl._handleDisconnect();
  }
  if (node.shadowRoot) {
    const children: BaseComponent[] = [];
    collectControllersInRoot(node.shadowRoot, children);
    for (const c of children) c._handleDisconnect();
  }
  for (const child of node.children) {
    syncContentDisconnects(child);
  }
}

function syncContentConnects(node: Node): void {
  if (!(node instanceof Element)) return;
  upgradeComponentTree(node);
  const ctrl = hostControllerMap.get(node);
  if (ctrl && node.isConnected) {
    ctrl._handleConnect();
  }
  for (const child of node.children) {
    syncContentConnects(child);
  }
}

function ensureContentLifecycleObserver(): void {
  if (contentObserverStarted || typeof document === 'undefined') return;
  contentObserverStarted = true;
  const root = document.documentElement ?? document;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        syncContentConnects(added);
      }
      for (const removed of m.removedNodes) {
        syncContentDisconnects(removed);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
}

function upgradeContentElement(el: HTMLElement, Ctor: ComponentConstructor): BaseComponent {
  const existing = hostControllerMap.get(el);
  if (existing) return existing;

  const ctrl = new Ctor(el);
  hostControllerMap.set(el, ctrl);
  exposeComponentApi(el, ctrl);

  const observed = Ctor.observedAttributes;
  if (observed && observed.length > 0) {
    const watched = new Set(observed);
    const origSetAttr = el.setAttribute.bind(el);
    const origRemoveAttr = el.removeAttribute.bind(el);

    el.setAttribute = (name: string, value: string) => {
      const prev = el.getAttribute(name);
      origSetAttr(name, value);
      if (watched.has(name) && prev !== String(value)) {
        ctrl._handleAttributeChange(name, prev, String(value));
      }
    };

    el.removeAttribute = (name: string) => {
      const prev = el.getAttribute(name);
      origRemoveAttr(name);
      if (watched.has(name) && prev !== null) {
        ctrl._handleAttributeChange(name, prev, null);
      }
    };
  }

  return ctrl;
}

// * 当运行在扩展内容脚本隔离环境（customElements === null）时，自动升级片段里的自定义标签
export function upgradeComponentTree(root: ParentNode | Node): void {
  if (hasNativeCustomElements()) return;

  if (root instanceof HTMLElement) {
    const Ctor = componentDefs.get(root.tagName.toLowerCase());
    if (Ctor && !hostControllerMap.has(root)) {
      upgradeContentElement(root, Ctor);
    }
  }

  if ('querySelectorAll' in root && componentDefs.size > 0) {
    const selector = Array.from(componentDefs.keys()).join(',');
    if (selector) {
      const matches = root.querySelectorAll<HTMLElement>(selector);
      for (const el of matches) {
        const Ctor = componentDefs.get(el.tagName.toLowerCase());
        if (Ctor) upgradeContentElement(el, Ctor);
      }
    }
  }
}

function createHostShadowRoot(host: HTMLElement, delegatesFocus: boolean): ShadowRoot {
  if (host.shadowRoot) return host.shadowRoot;
  const g = globalThis as {
    cloneInto?: <T>(value: T, scope: unknown) => T;
  };
  const rawHost = (host as unknown as { wrappedJSObject?: HTMLElement }).wrappedJSObject;
  const rawWindow =
    typeof window !== 'undefined'
      ? (window as unknown as { wrappedJSObject?: unknown }).wrappedJSObject
      : undefined;

  // ! Firefox/Zen 在 @inject-into content 沙盒下，直接在 Xray 宿主调用 attachShadow 会产生带扩展权限标记的 ShadowRoot；
  // ! 鼠标划过时页面上的 React/jQuery 读取 event.target / relatedTarget 会报 Permission denied。
  // * 这里优先通过 wrappedJSObject 在页面主域建立开放 ShadowRoot，再通过 host.shadowRoot 安全操作。
  if (rawHost && rawWindow && typeof g.cloneInto === 'function') {
    try {
      const opts = g.cloneInto({ mode: 'open' as const, delegatesFocus }, rawWindow);
      rawHost.attachShadow(opts);
      if (host.shadowRoot) return host.shadowRoot;
    } catch {}
  }

  return host.attachShadow({
    mode: 'open',
    delegatesFocus,
  });
}

const ISOLATED_UI_EVENTS = [
  'mouseover',
  'mouseout',
  'mousemove',
  'pointerover',
  'pointerout',
  'pointermove',
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'focusin',
  'focusout',
  'wheel',
  'input',
  'change',
] as const;

export abstract class BaseComponent implements Disposable {
  static delegatesFocus = true;

  readonly host: HTMLElement;
  readonly shadowRoot: ShadowRoot;
  // * scope 负责页面级外部监听（随断开连接暂停、重连时重建）；domScope 负责 Shadow DOM 内部模板事件（仅重绘或销毁时清理）
  protected scope = new AbortController();
  #domScope = new AbortController();

  protected abstract readonly stylesheet: string;
  protected abstract render(): DocumentFragment;

  #rendered = false;
  #connectedActive = false;

  constructor(host: HTMLElement) {
    this.host = host;
    const ctor = new.target as unknown as ComponentConstructor;
    this.shadowRoot = createHostShadowRoot(host, ctor.delegatesFocus ?? true);
  }

  // * 对子类保留和原生 HTMLElement 一致的常用属性与方法代理
  get style(): CSSStyleDeclaration {
    return this.host.style;
  }

  get classList(): DOMTokenList {
    return this.host.classList;
  }

  get isConnected(): boolean {
    return this.host.isConnected;
  }

  getAttribute(qualifiedName: string): string | null {
    return this.host.getAttribute(qualifiedName);
  }

  setAttribute(qualifiedName: string, value: string): void {
    this.host.setAttribute(qualifiedName, value);
  }

  removeAttribute(qualifiedName: string): void {
    this.host.removeAttribute(qualifiedName);
  }

  toggleAttribute(qualifiedName: string, force?: boolean): boolean {
    return this.host.toggleAttribute(qualifiedName, force);
  }

  hasAttribute(qualifiedName: string): boolean {
    return this.host.hasAttribute(qualifiedName);
  }

  dispatchEvent(event: Event): boolean {
    return this.host.dispatchEvent(event);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.host.addEventListener(type, listener, options);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    this.host.removeEventListener(type, listener, options);
  }

  matches(selectors: string): boolean {
    return this.host.matches(selectors);
  }

  remove(): void {
    this.host.remove();
  }

  mountTo(parent: Element, before: Node | null = null): void {
    if (before && before.parentNode === parent) {
      if (this.host.parentElement !== parent || this.host.nextSibling !== before) {
        parent.insertBefore(this.host, before);
      }
    } else if (this.host.parentElement !== parent) {
      parent.appendChild(this.host);
    }
    if (!hasNativeCustomElements() && this.host.isConnected) {
      this._handleConnect();
    }
  }

  getBoundingClientRect(): DOMRect {
    return this.host.getBoundingClientRect();
  }

  showPopover(): void {
    if (!hasNativeCustomElements() && this.host.isConnected && !this.#rendered) {
      this._handleConnect();
    }
    this.host.showPopover();
  }

  hidePopover(): void {
    this.host.hidePopover();
  }

  /** @internal */
  _handleConnect(): void {
    if (this.scope.signal.aborted) {
      this.scope = new AbortController();
    }

    if (!this.#rendered) {
      this.#rendered = true;
      this.adoptComponentStyles();
      this.#mountShadowTree();
      // * 先连接影子 DOM 里的子组件，保证父组件在 onMount / onConnect 时能直接操作已就绪的子组件
      if (!hasNativeCustomElements()) {
        const children: BaseComponent[] = [];
        collectControllersInRoot(this.shadowRoot, children);
        for (const child of children) {
          child._handleConnect();
        }
      }
      this.onMount();
    } else if (!hasNativeCustomElements()) {
      const children: BaseComponent[] = [];
      collectControllersInRoot(this.shadowRoot, children);
      for (const child of children) {
        child._handleConnect();
      }
    }

    if (!this.#connectedActive) {
      this.#connectedActive = true;
      // * 最外层挂载在主文档里的组件拦截交互事件冒泡，避免点击或鼠标滑过我们面板时惊动原网页的 React/jQuery 事件代理
      if (typeof document !== 'undefined' && this.host.getRootNode() === document) {
        const stopBubble = (ev: Event) => {
          ev.stopPropagation();
        };
        for (const evType of ISOLATED_UI_EVENTS) {
          this.on(this.host, evType, stopBubble);
        }
      }
      this.onConnect();
    }
  }

  /** @internal */
  _handleDisconnect(): void {
    queueMicrotask(() => {
      if (!this.host.isConnected && this.#connectedActive) {
        this.#connectedActive = false;
        if (!this.scope.signal.aborted) {
          this.scope.abort();
        }
        this.onDisconnect();

        if (!hasNativeCustomElements()) {
          const children: BaseComponent[] = [];
          collectControllersInRoot(this.shadowRoot, children);
          for (const child of children) {
            child._handleDisconnect();
          }
        }
      }
    });
  }

  /** @internal */
  _handleAttributeChange(name: string, oldVal: string | null, newVal: string | null): void {
    if (oldVal === newVal) return;
    this.onAttributeChange(name, oldVal, newVal);
  }

  [Symbol.dispose](): void {
    this.#connectedActive = false;
    if (!this.scope.signal.aborted) {
      this.scope.abort();
      this.onDisconnect();
    }
    if (!this.#domScope.signal.aborted) {
      this.#domScope.abort();
    }
    this.#rendered = false;
    this.onDestroy();
  }

  // * 供多语言切换或主动刷新界面结构时重绘 Shadow DOM
  protected rerender(): void {
    if (!this.#rendered) return;
    if (!hasNativeCustomElements()) {
      const oldChildren: BaseComponent[] = [];
      collectControllersInRoot(this.shadowRoot, oldChildren);
      for (const child of oldChildren) {
        child[Symbol.dispose]();
      }
    }
    if (!this.#domScope.signal.aborted) {
      this.#domScope.abort();
    }
    this.#domScope = new AbortController();
    this.#mountShadowTree();
    this.onMount();
    if (!hasNativeCustomElements() && this.host.isConnected) {
      const newChildren: BaseComponent[] = [];
      collectControllersInRoot(this.shadowRoot, newChildren);
      for (const child of newChildren) {
        child._handleConnect();
      }
    }
  }

  #mountShadowTree(): void {
    if (this.#domScope.signal.aborted) {
      this.#domScope = new AbortController();
    }
    const fragment = this.render();
    bindFragmentEvents(fragment, this.#domScope.signal);
    upgradeComponentTree(fragment);
    this.shadowRoot.replaceChildren(fragment);
  }

  protected onMount(): void {}
  protected onConnect(): void {}
  protected onDisconnect(): void {}
  protected onDestroy(): void {}
  protected onAttributeChange(
    _name: string,
    _oldVal: string | null,
    _newVal: string | null
  ): void {}

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
    target.addEventListener(type, listener as EventListener, {
      ...options,
      signal: this.scope.signal,
    });
  }

  protected $<T extends Element | BaseComponent = HTMLElement>(
    selector: string
  ): (T extends BaseComponent ? ComponentElement<T> : T) | null {
    return this.shadowRoot.querySelector(selector) as
      | (T extends BaseComponent ? ComponentElement<T> : T)
      | null;
  }

  protected $$<T extends Element | BaseComponent = HTMLElement>(
    selector: string
  ): Array<T extends BaseComponent ? ComponentElement<T> : T> {
    return Array.from(this.shadowRoot.querySelectorAll(selector)) as Array<
      T extends BaseComponent ? ComponentElement<T> : T
    >;
  }

  protected adoptComponentStyles(): void {
    const ctor = this.constructor as unknown as ComponentConstructor;
    let sheet = sheetCache.get(ctor);
    if (!sheet) {
      sheet = createAdoptedStyleSheet(this.stylesheet);
      sheetCache.set(ctor, sheet);
    }

    const atomic = getAtomicThemeSheet();
    try {
      const rawShadow = (this.shadowRoot as unknown as { wrappedJSObject?: ShadowRoot })
        .wrappedJSObject;
      const rawWin =
        typeof window !== 'undefined'
          ? (window as unknown as { wrappedJSObject?: { Array?: ArrayConstructor } })
              .wrappedJSObject
          : undefined;
      if (rawShadow && rawWin?.Array) {
        const rawArr = new rawWin.Array<CSSStyleSheet>();
        rawArr.push(atomic, sheet);
        rawShadow.adoptedStyleSheets = rawArr;
        return;
      }
      this.shadowRoot.adoptedStyleSheets = [atomic, sheet];
    } catch {
      // * 如果浏览器或页面策略拦截了 adoptedStyleSheets 赋值，改用 <style> 节点兜底注入样式
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-sora-fallback', '1');
      styleEl.textContent = `${getAtomicThemeCssText()}\n${this.stylesheet}`;
      this.shadowRoot.prepend(styleEl);
    }
  }
}

export function createComponent<T extends BaseComponent>(
  Ctor: ComponentConstructor<T>
): ComponentElement<T> {
  if (hasNativeCustomElements()) {
    return document.createElement(Ctor.tagName) as ComponentElement<T>;
  }
  ensureContentLifecycleObserver();
  const host = document.createElement(Ctor.tagName);
  upgradeContentElement(host, Ctor);
  return host as ComponentElement<T>;
}

export function mountComponent<T extends BaseComponent>(
  Ctor: ComponentConstructor<T>,
  parent: Element = document.documentElement
): ComponentElement<T> {
  const existing = parent.querySelector(Ctor.tagName);
  if (existing) return existing as ComponentElement<T>;
  const host = createComponent(Ctor);
  parent.appendChild(host);
  if (!hasNativeCustomElements()) {
    hostControllerMap.get(host)?._handleConnect();
  }
  return host;
}

export function defineComponent<T extends BaseComponent>(
  tagName: string,
  Ctor: ComponentConstructor<T>
): void {
  const normalized = tagName.toLowerCase();
  componentDefs.set(normalized, Ctor);

  if (hasNativeCustomElements()) {
    if (customElements.get(normalized)) return;

    const observed = Ctor.observedAttributes ? [...Ctor.observedAttributes] : [];

    class NativeHostElement extends HTMLElement {
      static readonly observedAttributes = observed;
      #ctrl: BaseComponent;

      constructor() {
        super();
        this.#ctrl = new Ctor(this);
        hostControllerMap.set(this, this.#ctrl);
        exposeComponentApi(this, this.#ctrl);
      }

      connectedCallback(): void {
        this.#ctrl._handleConnect();
      }

      connectedMoveCallback(): void {
        // * 浏览器支持 moveBefore 时保留全部内部状态
      }

      disconnectedCallback(): void {
        this.#ctrl._handleDisconnect();
      }

      attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
        this.#ctrl._handleAttributeChange(name, oldVal, newVal);
      }
    }

    customElements.define(normalized, NativeHostElement);
    return;
  }

  ensureContentLifecycleObserver();
}

export function customElement(tagName: string) {
  return <T extends BaseComponent>(
    target: ComponentConstructor<T>,
    _ctx: ClassDecoratorContext
  ) => {
    defineComponent(tagName, target);
  };
}
