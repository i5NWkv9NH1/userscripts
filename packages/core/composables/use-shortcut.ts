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

// 覆盖 macOS / Windows / Linux 与主流浏览器的系统级保留快捷键字典
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
  'Meta+Alt+KeyI': 'macOS 开发者工具',
  'Ctrl+Shift+KeyI': '开发者工具',
  'Ctrl+Shift+KeyJ': '开发者工具控制台',
  'Ctrl+Shift+KeyC': '开发者工具元素检查',
  'Alt+F4': '关闭当前窗口 (Alt + F4)',
};

// 严禁被录制为快捷键的独立按键（如 F1~F12、Esc、Tab 等）
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

const activeModuleShortcuts = new Map<string, { moduleName: string; combo: string }>();
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
  let activeRecAbort: AbortController | null = null;

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

  activeModuleShortcuts.set(moduleId, {
    moduleName,
    combo: store.get(),
  });

  window.addEventListener(
    'keydown',
    (ev) => {
      // 当任意面板处于「正在录制新快捷键」状态时，暂停所有快捷键触发，防止面板被意外收起
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
      activeModuleShortcuts.delete(moduleId);
      if (activeRecAbort) {
        activeRecAbort.abort();
        isRecordingGlobal = false;
      }
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
    setCombo(nextCombo: string): ShortcutConflict {
      const conflict = checkConflict(nextCombo);
      store.set(nextCombo);
      activeModuleShortcuts.set(moduleId, { moduleName, combo: nextCombo });
      return conflict;
    },
    startRecording(onResult) {
      // 如果已经在录制中，再次点击按钮则直接取消录制
      if (activeRecAbort) {
        activeRecAbort.abort();
        activeRecAbort = null;
        isRecordingGlobal = false;
        onResult(null, { hasConflict: false, reason: null }, true);
        return () => {};
      }

      const recController = new AbortController();
      activeRecAbort = recController;
      isRecordingGlobal = true;

      window.addEventListener(
        'keydown',
        (ev) => {
          // 1. 单独按下 F1~F12（如 F12 开发者工具），完全放行给浏览器原生行为！
          if (!ev.ctrlKey && !ev.altKey && !ev.metaKey && /^F([1-9]|1[0-2])$/.test(ev.code)) {
            return;
          }

          ev.preventDefault();
          ev.stopImmediatePropagation();

          // 2. 按下 Escape 键：立即取消本次录制
          if (ev.code === 'Escape') {
            recController.abort();
            activeRecAbort = null;
            isRecordingGlobal = false;
            onResult(null, { hasConflict: false, reason: null }, true);
            return;
          }

          // 3. 忽略单独按下的修饰键本身
          if (['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key)) return;

          const { byCode, hasModifier } = formatEventCombo(ev);

          // 4. 禁止不带任何修饰键的裸按键（防止把普通打字字母或空格录成快捷键）
          if (!hasModifier || FORBIDDEN_SINGLE_CODES.has(ev.code)) {
            onResult(null, {
              hasConflict: true,
              reason: '请至少按住一个修饰键（如 Opt/Alt、Ctrl 或 Shift）再加字母键，按 Esc 可取消',
            });
            return;
          }

          recController.abort();
          activeRecAbort = null;
          isRecordingGlobal = false;
          const conflict = this.setCombo(byCode);
          onResult(byCode, conflict, false);
        },
        { signal: recController.signal, capture: true }
      );

      return () => {
        recController.abort();
        activeRecAbort = null;
        isRecordingGlobal = false;
      };
    },
  };
}
