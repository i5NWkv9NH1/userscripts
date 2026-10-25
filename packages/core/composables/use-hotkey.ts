export type HotkeyHandler = (ev: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyHandler>;

export interface UseHotkeyOptions {
  readonly target?: EventTarget;
  readonly ignoreInputs?: boolean;
  readonly preventDefault?: boolean;
}

function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

function normalizeEventCombo(ev: KeyboardEvent): {
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

export function useHotkey(
  keymap: HotkeyMap,
  signal: AbortSignal,
  options: UseHotkeyOptions = {}
): void {
  if (signal.aborted) return;

  const {
    target = window,
    ignoreInputs = true,
    preventDefault = false,
  } = options;

  target.addEventListener(
    'keydown',
    (rawEv) => {
      const ev = rawEv as KeyboardEvent;
      if (ignoreInputs) {
        const path = ev.composedPath();
        const topTarget = path[0] ?? ev.target;
        if (isEditableElement(topTarget)) return;
      }

      const { byCode, byKey } = normalizeEventCombo(ev);
      const handler = keymap[byCode] ?? keymap[byKey] ?? keymap[ev.key] ?? keymap[ev.code];

      if (handler) {
        if (preventDefault) ev.preventDefault();
        handler(ev);
      }
    },
    { signal }
  );
}
