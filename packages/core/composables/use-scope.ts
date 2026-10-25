export class Scope implements Disposable {
  readonly controller = new AbortController();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  on<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    listener: (ev: HTMLElementEventMap[K]) => void,
    options?: Omit<AddEventListenerOptions, 'signal'>
  ): void;
  on(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: Omit<AddEventListenerOptions, 'signal'>
  ): void;
  on(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | ((ev: any) => void),
    options?: Omit<AddEventListenerOptions, 'signal'>
  ): void {
    if (this.signal.aborted) return;
    target.addEventListener(type, listener as EventListener, {
      ...options,
      signal: this.signal,
    });
  }

  onCleanup(cleanupFn: () => void): void {
    if (this.signal.aborted) {
      cleanupFn();
      return;
    }
    this.signal.addEventListener('abort', cleanupFn, { once: true });
  }

  dispose(): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort();
    }
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

export function useScope(): Scope {
  return new Scope();
}
