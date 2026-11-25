import { useStorage } from './use-storage.ts';

export type LocaleMode = 'auto' | 'zh-CN' | 'en';
export type ResolvedLocale = 'zh-CN' | 'en';

export type I18nDict<K extends string = string> = Record<ResolvedLocale, Record<K, string>>;

const LOCALE_EVENT = 'sora:locale-changed';
const localeStore = useStorage<LocaleMode>('locale', 'auto');

export function resolveLocale(mode: LocaleMode = localeStore.get()): ResolvedLocale {
  if (mode === 'zh-CN' || mode === 'en') return mode;
  const navLang = (navigator.language || 'en').toLowerCase();
  return navLang.startsWith('zh') ? 'zh-CN' : 'en';
}

export function getLocaleMode(): LocaleMode {
  return localeStore.get();
}

export function setLocaleMode(mode: LocaleMode): void {
  localeStore.set(mode);
  document.documentElement.setAttribute('data-sora-locale', mode);
  document.dispatchEvent(new CustomEvent(LOCALE_EVENT, { detail: mode }));
}

export function toggleNextLocale(): ResolvedLocale {
  const current = resolveLocale();
  const next: ResolvedLocale = current === 'zh-CN' ? 'en' : 'zh-CN';
  setLocaleMode(next);
  return next;
}

export function formatMessage(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => {
    const val = params[key];
    return val === undefined ? `{${key}}` : String(val);
  });
}

export interface I18nController<K extends string> {
  getMode(): LocaleMode;
  getLocale(): ResolvedLocale;
  setMode(mode: LocaleMode): void;
  toggleLocale(): ResolvedLocale;
  t(key: K, params?: Record<string, string | number>): string;
}

export function useI18n<K extends string>(
  dict: I18nDict<K>,
  signal: AbortSignal,
  onChange?: (locale: ResolvedLocale) => void
): I18nController<K> {
  let activeLocale = resolveLocale();

  const notifyIfChanged = (nextMode?: LocaleMode) => {
    const next = resolveLocale(nextMode);
    if (next !== activeLocale) {
      activeLocale = next;
      onChange?.(next);
    }
  };

  if (!signal.aborted) {
    localeStore.subscribe((mode) => notifyIfChanged(mode), signal, false);
    document.addEventListener(
      LOCALE_EVENT,
      () => {
        const attrMode = document.documentElement.getAttribute(
          'data-sora-locale'
        ) as LocaleMode | null;
        if (attrMode === 'auto' || attrMode === 'zh-CN' || attrMode === 'en') {
          if (localeStore.get() !== attrMode) {
            localeStore.set(attrMode);
          }
          notifyIfChanged(attrMode);
        } else {
          notifyIfChanged();
        }
      },
      { signal }
    );
  }

  return {
    getMode: () => localeStore.get(),
    getLocale: () => activeLocale,
    setMode: setLocaleMode,
    toggleLocale: toggleNextLocale,
    t(key, params) {
      const table = dict[activeLocale] ?? dict['zh-CN'];
      const text = table[key] ?? dict['zh-CN'][key] ?? key;
      return formatMessage(text, params);
    },
  };
}
