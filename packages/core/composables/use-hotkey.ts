// biome-ignore lint/suspicious/noConfusingVoidType: allow handlers without explicit boolean return
export type HotkeyHandler = (ev: KeyboardEvent) => void | boolean;
export type HotkeyMap = Record<string, HotkeyHandler>;

export interface UseHotkeyOptions {
  readonly target?: EventTarget;
  readonly ignoreInputs?: boolean;
  readonly preventDefault?: boolean;
  readonly capture?: boolean;
}

const platformStr =
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
  navigator.platform ??
  '';
const isMac = /Mac|iPhone|iPad|iPod/i.test(platformStr);

export function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

export function formatEventCombo(ev: KeyboardEvent): {
  byCode: string;
  byKey: string;
  hasModifier: boolean;
} {
  const mods: string[] = [];
  if (ev.metaKey) mods.push('Meta');
  if (ev.ctrlKey) mods.push('Ctrl');
  if (ev.altKey) mods.push('Alt');
  if (ev.shiftKey) mods.push('Shift');

  const prefix = mods.length > 0 ? `${mods.join('+')}+` : '';
  return {
    byCode: `${prefix}${ev.code}`,
    byKey: `${prefix}${ev.key}`,
    hasModifier: mods.length > 0,
  };
}

export function formatComboLabel(combo: string): string {
  return combo
    .replace('Meta+', isMac ? 'Cmd(⌘) + ' : 'Win + ')
    .replace('Ctrl+', isMac ? 'Ctrl(⌃) + ' : 'Ctrl + ')
    .replace('Alt+', isMac ? 'Opt(⌥) + ' : 'Alt + ')
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

      const { byCode, byKey, hasModifier } = formatEventCombo(ev);
      const handler =
        keymap[byCode] ??
        keymap[byKey] ??
        (!hasModifier ? (keymap[ev.key] ?? keymap[ev.code]) : undefined);

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
