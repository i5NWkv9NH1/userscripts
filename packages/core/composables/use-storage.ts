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
  subscribe(callback: (val: T) => void, signal: AbortSignal, immediate?: boolean): void;
}

const hasGMStorage = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

const subscribersByKey = new Map<string, Set<(val: any) => void>>();

function getSubscriberSet(storageKey: string): Set<(val: any) => void> {
  let set = subscribersByKey.get(storageKey);
  if (!set) {
    set = new Set();
    subscribersByKey.set(storageKey, set);
  }
  return set;
}

export function useStorage<T>(key: string, initialValue: T): ReactiveStorage<T> {
  const storageKey = `sora:${key}`;
  const subscribers = getSubscriberSet(storageKey);

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
    for (const sub of subscribers) {
      try {
        sub(val);
      } catch {}
    }
  };

  return {
    get: read,
    set(next) {
      const prev = read();
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      if (Object.is(prev, resolved)) return;
      write(resolved);
    },
    subscribe(callback, signal, immediate = true) {
      if (signal.aborted) return;

      subscribers.add(callback);
      let gmListenerId: string | number | null = null;

      if (hasGMStorage && typeof GM_addValueChangeListener === 'function') {
        gmListenerId = GM_addValueChangeListener(storageKey, (_name, _oldVal, newVal, remote) => {
          if (remote) {
            try {
              callback((newVal as T) ?? initialValue);
            } catch {}
          }
        });
      }

      signal.addEventListener(
        'abort',
        () => {
          subscribers.delete(callback);
          if (subscribers.size === 0) {
            subscribersByKey.delete(storageKey);
          }
          if (gmListenerId !== null && typeof GM_removeValueChangeListener === 'function') {
            GM_removeValueChangeListener(gmListenerId);
          }
        },
        { once: true }
      );

      if (immediate) {
        try {
          callback(read());
        } catch {}
      }
    },
  };
}
