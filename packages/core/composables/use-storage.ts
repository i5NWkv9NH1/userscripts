declare function GM_getValue<T>(key: string, defaultValue: T): T;
declare function GM_setValue<T>(key: string, value: T): void;
declare function GM_addValueChangeListener(
  key: string,
  callback: (name: string, oldVal: unknown, newVal: unknown, remote: boolean) => void
): string | number;
declare function GM_removeValueChangeListener(listenerId: string | number): void;

export interface ReactiveStorage<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(
    callback: (val: T) => void,
    signal: AbortSignal,
    immediate?: boolean
  ): void;
}

const hasGMStorage =
  typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

export function useStorage<T>(key: string, initialValue: T): ReactiveStorage<T> {
  const localSubscribers = new Set<(val: T) => void>();
  const storageKey = `sora:${key}`;

  const read = (): T => {
    if (hasGMStorage) {
      return GM_getValue<T>(storageKey, initialValue);
    }
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  };

  const write = (val: T): void => {
    if (hasGMStorage) {
      GM_setValue<T>(storageKey, val);
    } else {
      try {
        localStorage.setItem(storageKey, JSON.stringify(val));
      } catch {}
    }
    for (const sub of localSubscribers) {
      sub(val);
    }
  };

  return {
    get: read,
    set(next) {
      const prev = read();
      const resolved =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      if (Object.is(prev, resolved)) return;
      write(resolved);
    },
    subscribe(callback, signal, immediate = true) {
      if (signal.aborted) return;

      localSubscribers.add(callback);
      let gmListenerId: string | number | null = null;

      if (hasGMStorage && typeof GM_addValueChangeListener === 'function') {
        gmListenerId = GM_addValueChangeListener(
          storageKey,
          (_name, _oldVal, newVal, remote) => {
            if (remote) {
              callback((newVal as T) ?? initialValue);
            }
          }
        );
      }

      signal.addEventListener(
        'abort',
        () => {
          localSubscribers.delete(callback);
          if (
            gmListenerId !== null &&
            typeof GM_removeValueChangeListener === 'function'
          ) {
            GM_removeValueChangeListener(gmListenerId);
          }
        },
        { once: true }
      );

      if (immediate) {
        callback(read());
      }
    },
  };
}
