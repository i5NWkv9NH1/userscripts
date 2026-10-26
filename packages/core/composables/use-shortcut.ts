import { formatComboLabel, formatEventCombo, isEditableElement } from './use-hotkey.ts';
import { useStorage } from './use-storage.ts';

export interface ShortcutPreset {
  readonly combo: string;
  readonly label: string;
}

export const DEFAULT_SHORTCUT_PRESETS: readonly ShortcutPreset[] = [
  { combo: 'Alt+KeyS', label: formatComboLabel('Alt+KeyS') },
  { combo: 'Alt+KeyA', label: formatComboLabel('Alt+KeyA') },
  { combo: 'Alt+KeyL', label: formatComboLabel('Alt+KeyL') },
  { combo: 'Alt+KeyQ', label: formatComboLabel('Alt+KeyQ') },
  { combo: 'Ctrl+Shift+KeyS', label: formatComboLabel('Ctrl+Shift+KeyS') },
  { combo: 'Alt+Backquote', label: formatComboLabel('Alt+Backquote') },
];

const SYSTEM_CONFLICT_DICT: Record<string, string> = {
  'Meta+KeyS': 'macOS 保存网页 (Cmd + S)',
  'Ctrl+KeyS': 'Windows/Linux 保存网页 (Ctrl + S)',
  'Meta+KeyW': 'macOS 关闭标签页 (Cmd + W)',
  'Ctrl+KeyW': 'Windows/Linux 关闭标签页 (Ctrl + W)',
  'Meta+KeyT': '新建标签页 (Cmd + T)',
  'Ctrl+KeyT': '新建标签页 (Ctrl + T)',
  'Meta+KeyN': '新建浏览器窗口',
  'Ctrl+KeyN': '新建浏览器窗口',
  'Meta+KeyR': '刷新网页 (Cmd + R)',
  'Ctrl+KeyR': '刷新网页 (Ctrl + R)',
  'Meta+KeyL': '聚焦浏览器地址栏',
  'Ctrl+KeyL': '聚焦浏览器地址栏',
  'Meta+KeyF': '网页内查找文本',
  'Ctrl+KeyF': '网页内查找文本',
  'Meta+KeyP': '打印当前网页',
  'Ctrl+KeyP': '打印当前网页',
  'Meta+KeyQ': 'macOS 退出浏览器应用 (Cmd + Q)',
  'Meta+KeyH': 'macOS 隐藏窗口 (Cmd + H)',
  'Ctrl+KeyH': '打开浏览器历史记录',
  'Alt+F4': '关闭当前窗口 (Alt + F4)',
};

const PASSTHROUGH_DEVTOOLS_COMBOS = new Set([
  'Meta+Alt+KeyI',
  'Meta+Alt+KeyJ',
  'Meta+Alt+KeyC',
  'Ctrl+Shift+KeyI',
  'Ctrl+Shift+KeyJ',
  'Ctrl+Shift+KeyC',
]);

const FORBIDDEN_SINGLE_CODES = new Set([
  'Escape',
  'Tab',
  'Enter',
  'Space',
  'Backspace',
  'Delete',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
]);

const activeModuleShortcuts = new Map<
  string,
  { token: symbol; moduleName: string; combo: string }
>();
let isRecordingGlobal = false;

export interface ShortcutConflict {
  readonly hasConflict: boolean;
  readonly reason: string | null;
}

export interface ShortcutController {
  readonly presets: readonly ShortcutPreset[];
  readonly isRecording: boolean;
  getCombo(): string;
  getLabel(): string;
  setCombo(nextCombo: string): ShortcutConflict;
  checkConflict(combo: string): ShortcutConflict;
  startRecording(
    onResult: (combo: string | null, conflict: ShortcutConflict, cancelled?: boolean) => void
  ): () => void;
}

export function useShortcut(
  moduleId: string,
  moduleName: string,
  defaultCombo: string,
  onTrigger: (ev: KeyboardEvent) => void,
  signal: AbortSignal
): ShortcutController {
  const store = useStorage<string>(`shortcut.${moduleId}`, defaultCombo);
  const instanceToken = Symbol(moduleId);
  let activeRecAbort: AbortController | null = null;
  let recTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const stopActiveRecording = () => {
    if (recTimeoutId !== null) {
      clearTimeout(recTimeoutId);
      recTimeoutId = null;
    }
    if (activeRecAbort) {
      activeRecAbort.abort();
      activeRecAbort = null;
      isRecordingGlobal = false;
    }
  };

  const checkConflict = (combo: string): ShortcutConflict => {
    const sysReason = SYSTEM_CONFLICT_DICT[combo];
    if (sysReason) {
      return {
        hasConflict: true,
        reason: `注意：「${formatComboLabel(combo)}」与系统/浏览器「${sysReason}」存在冲突`,
      };
    }
    for (const [id, info] of activeModuleShortcuts.entries()) {
      if (id !== moduleId && info.combo === combo) {
        return {
          hasConflict: true,
          reason: `冲突：与当前页面已加载的「${info.moduleName}」快捷键相同`,
        };
      }
    }
    return { hasConflict: false, reason: null };
  };

  const setCombo = (nextCombo: string): ShortcutConflict => {
    const conflict = checkConflict(nextCombo);
    store.set(nextCombo);
    activeModuleShortcuts.set(moduleId, {
      token: instanceToken,
      moduleName,
      combo: nextCombo,
    });
    return conflict;
  };

  activeModuleShortcuts.set(moduleId, {
    token: instanceToken,
    moduleName,
    combo: store.get(),
  });

  window.addEventListener(
    'keydown',
    (ev) => {
      if (isRecordingGlobal || ev.repeat) return;
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
      if (activeModuleShortcuts.get(moduleId)?.token === instanceToken) {
        activeModuleShortcuts.delete(moduleId);
      }
      stopActiveRecording();
    },
    { once: true }
  );

  return {
    presets: DEFAULT_SHORTCUT_PRESETS,
    get isRecording() {
      return activeRecAbort !== null;
    },
    getCombo: () => store.get(),
    getLabel: () => formatComboLabel(store.get()),
    checkConflict,
    setCombo,
    startRecording: (onResult) => {
      if (activeRecAbort) {
        stopActiveRecording();
        onResult(null, { hasConflict: false, reason: null }, true);
        return () => {};
      }

      const recController = new AbortController();
      activeRecAbort = recController;
      isRecordingGlobal = true;

      // 10 秒无操作自动超时取消录制，防止永久阻塞快捷键
      recTimeoutId = setTimeout(() => {
        stopActiveRecording();
        onResult(null, { hasConflict: false, reason: null }, true);
      }, 10000);

      window.addEventListener(
        'keydown',
        (ev) => {
          const { byCode, hasModifier } = formatEventCombo(ev);

          // 放行 F1~F12 及开发者工具组合键
          if (
            (!ev.ctrlKey && !ev.altKey && !ev.metaKey && /^F([1-9]|1[0-2])$/.test(ev.code)) ||
            PASSTHROUGH_DEVTOOLS_COMBOS.has(byCode)
          ) {
            return;
          }

          ev.preventDefault();
          ev.stopImmediatePropagation();

          if (ev.code === 'Escape') {
            stopActiveRecording();
            onResult(null, { hasConflict: false, reason: null }, true);
            return;
          }

          if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;

          if (!hasModifier || FORBIDDEN_SINGLE_CODES.has(ev.code)) {
            onResult(null, {
              hasConflict: true,
              reason: '请至少按住一个修饰键（如 Opt/Alt、Ctrl 或 Shift）再加字母键，按 Esc 取消',
            });
            return;
          }

          stopActiveRecording();
          const conflict = setCombo(byCode);
          onResult(byCode, conflict, false);
        },
        { signal: recController.signal, capture: true }
      );

      return stopActiveRecording;
    },
  };
}
