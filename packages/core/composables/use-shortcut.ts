import { formatComboLabel, formatEventCombo, isEditableElement } from './use-hotkey.ts';
import { useStorage } from './use-storage.ts';

export interface ShortcutPreset {
  readonly combo: string;
  readonly label: string;
}

export const DEFAULT_SHORTCUT_PRESETS: readonly ShortcutPreset[] = [
  { combo: 'Alt+KeyS', label: 'Alt + S' },
  { combo: 'Alt+KeyL', label: 'Alt + L' },
  { combo: 'Alt+KeyQ', label: 'Alt + Q' },
  { combo: 'Alt+KeyW', label: 'Alt + W' },
  { combo: 'Alt+Backquote', label: 'Alt + `' },
  { combo: 'Shift+Alt+KeyS', label: 'Shift + Alt + S' },
];

const BROWSER_RESERVED_COMBOS = new Set([
  'Mod+KeyW',
  'Mod+KeyT',
  'Mod+KeyN',
  'Mod+KeyR',
  'Mod+KeyC',
  'Mod+KeyV',
  'Mod+KeyX',
  'Mod+KeyA',
  'Mod+KeyF',
  'Mod+KeyL',
  'F5',
  'F12',
]);

const activeModuleShortcuts = new Map<string, { moduleName: string; combo: string }>();

export interface ShortcutConflict {
  readonly hasConflict: boolean;
  readonly reason: string | null;
}

export interface ShortcutController {
  readonly presets: readonly ShortcutPreset[];
  getCombo(): string;
  getLabel(): string;
  setCombo(nextCombo: string): ShortcutConflict;
  checkConflict(combo: string): ShortcutConflict;
  startRecording(onRecorded: (combo: string, conflict: ShortcutConflict) => void): () => void;
}

export function useShortcut(
  moduleId: string,
  moduleName: string,
  defaultCombo: string,
  onTrigger: (ev: KeyboardEvent) => void,
  signal: AbortSignal
): ShortcutController {
  const store = useStorage<string>(`shortcut.${moduleId}`, defaultCombo);

  const checkConflict = (combo: string): ShortcutConflict => {
    if (BROWSER_RESERVED_COMBOS.has(combo)) {
      return {
        hasConflict: true,
        reason: `「${formatComboLabel(combo)}」是浏览器系统保留快捷键，可能引发冲突`,
      };
    }
    for (const [id, info] of activeModuleShortcuts.entries()) {
      if (id !== moduleId && info.combo === combo) {
        return {
          hasConflict: true,
          reason: `与已加载模块「${info.moduleName}」的快捷键冲突`,
        };
      }
    }
    return { hasConflict: false, reason: null };
  };

  activeModuleShortcuts.set(moduleId, {
    moduleName,
    combo: store.get(),
  });

  window.addEventListener(
    'keydown',
    (ev) => {
      if (ev.repeat) return;
      const topTarget = ev.composedPath()[0] ?? ev.target;
      if (isEditableElement(topTarget)) return;

      const { byCode, byKey } = formatEventCombo(ev);
      const current = store.get();
      if (byCode === current || byKey === current) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        onTrigger(ev);
      }
    },
    { signal, capture: true }
  );

  signal.addEventListener(
    'abort',
    () => {
      activeModuleShortcuts.delete(moduleId);
    },
    { once: true }
  );

  return {
    presets: DEFAULT_SHORTCUT_PRESETS,
    getCombo: () => store.get(),
    getLabel: () => formatComboLabel(store.get()),
    checkConflict,
    setCombo(nextCombo: string): ShortcutConflict {
      const conflict = checkConflict(nextCombo);
      store.set(nextCombo);
      activeModuleShortcuts.set(moduleId, { moduleName, combo: nextCombo });
      return conflict;
    },
    startRecording(onRecorded) {
      const recController = new AbortController();
      window.addEventListener(
        'keydown',
        (ev) => {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;

          const { byCode } = formatEventCombo(ev);
          recController.abort();
          const conflict = this.setCombo(byCode);
          onRecorded(byCode, conflict);
        },
        { signal: recController.signal, capture: true }
      );
      return () => recController.abort();
    },
  };
}
