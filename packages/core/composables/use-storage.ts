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

const subscribersByKey = new Map<string, Set<(val: unknown) => void>>();

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

// * 兼容旧版本存档：当默认值是对象时，自动把缺掉的新字段补齐
function mergeWithDefaults<T>(raw: unknown, initialValue: T): T {
  if (raw === null || raw === undefined) return initialValue;
  if (isPlainObject(initialValue)) {
    if (!isPlainObject(raw)) return initialValue;
    return { ...initialValue, ...raw } as T;
  }
  if (typeof raw !== typeof initialValue) {
    return initialValue;
  }
  return raw as T;
}

function getSubscriberSet(storageKey: string): Set<(val: unknown) => void> {
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
      const val = GM_getValue<unknown>(storageKey, initialValue);
      return mergeWithDefaults(val, initialValue);
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === null) return initialValue;
      return mergeWithDefaults(JSON.parse(raw), initialValue);
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

      const wrapped = callback as (val: unknown) => void;
      subscribers.add(wrapped);
      let gmListenerId: string | number | null = null;

      if (hasGMStorage && typeof GM_addValueChangeListener === 'function') {
        gmListenerId = GM_addValueChangeListener(storageKey, (_name, _oldVal, newVal, remote) => {
          if (remote) {
            try {
              callback(mergeWithDefaults(newVal, initialValue));
            } catch {}
          }
        });
      }

      signal.addEventListener(
        'abort',
        () => {
          subscribers.delete(wrapped);
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
