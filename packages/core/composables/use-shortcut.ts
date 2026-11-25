import {
  formatComboLabel,
  formatEventCombo,
  getAltKeyDisplayName,
  isEditableElement,
  isMac,
} from './use-hotkey.ts';
import { type ResolvedLocale, resolveLocale } from './use-i18n.ts';
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

const SYSTEM_CONFLICT_DICT: Record<string, Record<ResolvedLocale, string>> = {
  'Meta+KeyS': { 'zh-CN': 'macOS 保存网页 (Cmd + S)', en: 'Save page (Cmd + S)' },
  'Ctrl+KeyS': { 'zh-CN': '保存网页 (Ctrl + S)', en: 'Save page (Ctrl + S)' },
  'Meta+KeyW': { 'zh-CN': 'macOS 关闭标签页 (Cmd + W)', en: 'Close tab (Cmd + W)' },
  'Ctrl+KeyW': { 'zh-CN': '关闭标签页 (Ctrl + W)', en: 'Close tab (Ctrl + W)' },
  'Meta+KeyT': { 'zh-CN': '新建标签页 (Cmd + T)', en: 'New tab (Cmd + T)' },
  'Ctrl+KeyT': { 'zh-CN': '新建标签页 (Ctrl + T)', en: 'New tab (Ctrl + T)' },
  'Meta+KeyN': { 'zh-CN': '新建浏览器窗口', en: 'New window' },
  'Ctrl+KeyN': { 'zh-CN': '新建浏览器窗口', en: 'New window' },
  'Meta+KeyR': { 'zh-CN': '刷新网页 (Cmd + R)', en: 'Reload page (Cmd + R)' },
  'Ctrl+KeyR': { 'zh-CN': '刷新网页 (Ctrl + R)', en: 'Reload page (Ctrl + R)' },
  'Meta+KeyL': { 'zh-CN': '聚焦浏览器地址栏', en: 'Focus address bar' },
  'Ctrl+KeyL': { 'zh-CN': '聚焦浏览器地址栏', en: 'Focus address bar' },
  'Meta+KeyF': { 'zh-CN': '网页内查找文字', en: 'Find in page' },
  'Ctrl+KeyF': { 'zh-CN': '网页内查找文字', en: 'Find in page' },
  'Meta+KeyP': { 'zh-CN': '打印当前网页', en: 'Print page' },
  'Ctrl+KeyP': { 'zh-CN': '打印当前网页', en: 'Print page' },
  'Meta+KeyQ': { 'zh-CN': 'macOS 退出浏览器 (Cmd + Q)', en: 'Quit browser (Cmd + Q)' },
  'Meta+KeyH': { 'zh-CN': 'macOS 隐藏窗口 (Cmd + H)', en: 'Hide window (Cmd + H)' },
  'Ctrl+KeyH': { 'zh-CN': '打开浏览器历史记录', en: 'Open history' },
  'Alt+F4': { 'zh-CN': '关闭当前窗口 (Alt + F4)', en: 'Close window (Alt + F4)' },
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

// * 通过页面共享 DOM 属性和事件实现跨脚本、跨沙盒的快捷键协调
const REGISTRY_ATTR = 'data-sora-shortcuts';
const RECORDING_ATTR = 'data-sora-shortcut-recording';
const SHORTCUT_CHANGED_EVENT = 'sora:shortcut-changed';

interface SharedShortcutEntry {
  moduleId: string;
  moduleName: string;
  combo: string;
  instanceId: string;
}

function createInstanceId(moduleId: string): string {
  return `${moduleId}-${Math.random().toString(36).slice(2, 9)}`;
}

function readSharedShortcuts(): SharedShortcutEntry[] {
  try {
    const raw = document.documentElement.getAttribute(REGISTRY_ATTR);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SharedShortcutEntry[]) : [];
  } catch {
    return [];
  }
}

function writeSharedShortcuts(entries: SharedShortcutEntry[]): void {
  try {
    if (entries.length === 0) {
      document.documentElement.removeAttribute(REGISTRY_ATTR);
    } else {
      document.documentElement.setAttribute(REGISTRY_ATTR, JSON.stringify(entries));
    }
    document.dispatchEvent(new CustomEvent(SHORTCUT_CHANGED_EVENT));
  } catch {}
}

function upsertSharedShortcut(entry: SharedShortcutEntry): void {
  const list = readSharedShortcuts().filter(
    (item) => item.instanceId !== entry.instanceId && item.moduleId !== entry.moduleId
  );
  list.push(entry);
  writeSharedShortcuts(list);
}

function removeSharedShortcut(instanceId: string): void {
  const list = readSharedShortcuts().filter((item) => item.instanceId !== instanceId);
  writeSharedShortcuts(list);
}

function setRecordingLock(instanceId: string | null): void {
  try {
    if (!instanceId) {
      document.documentElement.removeAttribute(RECORDING_ATTR);
      return;
    }
    document.documentElement.setAttribute(
      RECORDING_ATTR,
      JSON.stringify({ instanceId, expiresAt: Date.now() + 12000 })
    );
  } catch {}
}

function isAnyScriptRecording(): boolean {
  try {
    const raw = document.documentElement.getAttribute(RECORDING_ATTR);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { expiresAt?: number };
    if (typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()) {
      return true;
    }
    document.documentElement.removeAttribute(RECORDING_ATTR);
    return false;
  } catch {
    return false;
  }
}

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
  getActiveConflicts(): ShortcutConflict;
  onRegistryChange(cb: () => void, signal: AbortSignal): void;
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
  const instanceId = createInstanceId(moduleId);
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
      setRecordingLock(null);
    }
  };

  const checkConflict = (combo: string): ShortcutConflict => {
    const locale = resolveLocale();
    const sysEntry = SYSTEM_CONFLICT_DICT[combo];
    if (sysEntry) {
      const sysReason = sysEntry[locale];
      return {
        hasConflict: true,
        reason:
          locale === 'en'
            ? `Conflict: "${formatComboLabel(combo)}" conflicts with system/browser "${sysReason}"`
            : `注意：「${formatComboLabel(combo)}」与系统或浏览器「${sysReason}」冲突`,
      };
    }

    for (const info of readSharedShortcuts()) {
      if (info.moduleId !== moduleId && info.combo === combo) {
        return {
          hasConflict: true,
          reason:
            locale === 'en'
              ? `Conflict: already used by "${info.moduleName}" on this page`
              : `冲突：与当前网页已开启的「${info.moduleName}」快捷键相同`,
        };
      }
    }
    return { hasConflict: false, reason: null };
  };

  const setCombo = (nextCombo: string): ShortcutConflict => {
    const conflict = checkConflict(nextCombo);
    // * 有冲突时直接拦截，绝对不写入存储也不覆盖原有可用快捷键
    if (conflict.hasConflict) {
      return conflict;
    }
    store.set(nextCombo);
    upsertSharedShortcut({
      instanceId,
      moduleId,
      moduleName,
      combo: nextCombo,
    });
    return conflict;
  };

  upsertSharedShortcut({
    instanceId,
    moduleId,
    moduleName,
    combo: store.get(),
  });

  window.addEventListener(
    'keydown',
    (ev) => {
      if (isAnyScriptRecording() || ev.repeat) return;
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
      removeSharedShortcut(instanceId);
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
    getActiveConflicts: () => checkConflict(store.get()),
    onRegistryChange(cb, cbSignal) {
      document.addEventListener(SHORTCUT_CHANGED_EVENT, cb, { signal: cbSignal });
    },
    setCombo,
    startRecording: (onResult) => {
      if (activeRecAbort) {
        stopActiveRecording();
        onResult(null, { hasConflict: false, reason: null }, true);
        return () => {};
      }

      const recController = new AbortController();
      activeRecAbort = recController;
      setRecordingLock(instanceId);

      // * 10 秒没按键自动取消录制，避免一直拦住键盘输入
      recTimeoutId = setTimeout(() => {
        stopActiveRecording();
        onResult(null, { hasConflict: false, reason: null }, true);
      }, 10000);

      window.addEventListener(
        'keydown',
        (ev) => {
          const { byCode, hasModifier } = formatEventCombo(ev);

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
            const locale = resolveLocale();
            const modHint = isMac
              ? `${getAltKeyDisplayName()}、Ctrl 或 Shift`
              : `${getAltKeyDisplayName()}、Ctrl 或 Shift`;
            onResult(null, {
              hasConflict: true,
              reason:
                locale === 'en'
                  ? `Hold a modifier (${isMac ? 'Option ⌥, Ctrl, or Shift' : 'Alt, Ctrl, or Shift'}) + key, Esc to cancel`
                  : `请至少按住一个组合键（如 ${modHint}）再按字母键，按 Esc 取消`,
            });
            return;
          }

          const conflict = checkConflict(byCode);
          if (conflict.hasConflict) {
            const locale = resolveLocale();
            const suffix =
              locale === 'en'
                ? ' (Not saved, press another key or Esc)'
                : '（未保存，请改按其他按键或按 Esc 取消）';
            onResult(null, {
              hasConflict: true,
              reason: `${conflict.reason}${suffix}`,
            });
            return;
          }

          stopActiveRecording();
          const savedResult = setCombo(byCode);
          onResult(byCode, savedResult, false);
        },
        { signal: recController.signal, capture: true }
      );

      return stopActiveRecording;
    },
  };
}
