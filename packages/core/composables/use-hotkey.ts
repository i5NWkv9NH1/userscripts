// biome-ignore lint/suspicious/noConfusingVoidType: void 作为函数返回类型表示返回值可忽略，是标准写法
export type HotkeyHandler = (ev: KeyboardEvent) => void | boolean;
export type HotkeyMap = Record<string, HotkeyHandler>;

export interface UseHotkeyOptions {
  readonly target?: EventTarget;
  readonly ignoreInputs?: boolean;
  readonly preventDefault?: boolean;
  readonly capture?: boolean;
}

export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

export function formatEventCombo(ev: KeyboardEvent): {
  byCode: string;
  byKey: string;
} {
  const mods: string[] = [];
  if (ev.ctrlKey || ev.metaKey) mods.push('Mod');
  if (ev.altKey) mods.push('Alt');
  if (ev.shiftKey) mods.push('Shift');

  const prefix = mods.length > 0 ? `${mods.join('+')}+` : '';
  return {
    byCode: `${prefix}${ev.code}`,
    byKey: `${prefix}${ev.key}`,
  };
}

export function formatComboLabel(combo: string): string {
  return combo
    .replace('Mod+', '⌘/Ctrl + ')
    .replace('Alt+', 'Alt + ')
    .replace('Shift+', 'Shift + ')
    .replace('Key', '')
    .replace('Digit', '')
    .replace('Backquote', '`');
}

export function useHotkey(
  keymap: HotkeyMap,
  signal: AbortSignal,
  options: UseHotkeyOptions = {}
): void {
  if (signal.aborted) return;

  const { target = window, ignoreInputs = true, preventDefault = false, capture = true } = options;

  target.addEventListener(
    'keydown',
    (rawEv) => {
      const ev = rawEv as KeyboardEvent;
      if (ignoreInputs) {
        const path = ev.composedPath();
        const topTarget = path[0] ?? ev.target;
        if (isEditableElement(topTarget)) return;
      }

      const { byCode, byKey } = formatEventCombo(ev);
      const handler = keymap[byCode] ?? keymap[byKey] ?? keymap[ev.key] ?? keymap[ev.code];

      if (handler) {
        const result = handler(ev);
        if (result !== false && preventDefault) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
        }
      }
    },
    { signal, capture }
  );
}
