import {
  BaseComponent,
  type ComponentElement,
  css,
  customElement,
  getAltKeyDisplayName,
  html,
  isMac,
  type LocaleMode,
  type ResolvedLocale,
  resolveLocale,
  type ShortcutController,
  type ShortcutPreset,
  type SnapPositionController,
  type SnapPresetName,
  toggleNextLocale,
  useI18n,
  useShortcut,
  useSnapPosition,
  useStorage,
} from '@core';
import { Icons, svgIcon } from '../icons/index.ts';
import type { Popover } from '../popover/popover.ts';
import { closeTopLayerPopover, showTopLayerPopover } from '../popover/top-layer.ts';

const SHELL_DICT = {
  'zh-CN': {
    dragCapsuleHint: '按住可自由拖动并贴边，点击打开设置面板；聚焦后可用方向键微调',
    dragHeaderHint: '按住这里可自由拖动并贴边；聚焦后可用方向键微调',
    minimize: '收起成小按钮',
    langSwitch: '切换成 English',
    langBadge: '中',
    shortcutLabel: '打开/收起面板快捷键',
    recordBtn: '录制按键',
    recordingBtn: '请按键 (Esc取消)...',
    presetPrefix: '预设：',
    shortcutHintMac: 'macOS 下键盘的 Option (⌥) 就是网页里说的 Alt 键；按 Cmd 组合注意别和系统冲突',
    shortcutHintOther: '建议用 Alt + 字母，避免和浏览器常用快捷键冲突',
    posTitle: '停靠位置（也可直接拖动标题栏或小按钮贴边）',
    topLeft: '左上',
    centerLeft: '左中',
    bottomLeft: '左下',
    topRight: '右上',
    centerRight: '右中',
    bottomRight: '右下',
    movedPrefix: '位置已调整：',
  },
  en: {
    dragCapsuleHint: 'Drag to snap to edge, click to open panel; arrow keys work when focused',
    dragHeaderHint: 'Drag header to snap to edge; arrow keys work when focused',
    minimize: 'Minimize to button',
    langSwitch: 'Switch to 简体中文',
    langBadge: 'EN',
    shortcutLabel: 'Panel shortcut',
    recordBtn: 'Record key',
    recordingBtn: 'Press keys (Esc)...',
    presetPrefix: 'Preset: ',
    shortcutHintMac: 'On macOS, Option (⌥) is the Alt key. Avoid system Cmd shortcuts.',
    shortcutHintOther: 'Use Alt + letter to avoid browser shortcut conflicts.',
    posTitle: 'Dock position (or drag header / button to snap to edge)',
    topLeft: 'Top L',
    centerLeft: 'Mid L',
    bottomLeft: 'Bot L',
    topRight: 'Top R',
    centerRight: 'Mid R',
    bottomRight: 'Bot R',
    movedPrefix: 'Panel moved: ',
  },
} as const;

const SNAP_PRESET_KEYS: { id: SnapPresetName; key: keyof (typeof SHELL_DICT)['zh-CN'] }[] = [
  { id: 'top-left', key: 'topLeft' },
  { id: 'center-left', key: 'centerLeft' },
  { id: 'bottom-left', key: 'bottomLeft' },
  { id: 'top-right', key: 'topRight' },
  { id: 'center-right', key: 'centerRight' },
  { id: 'bottom-right', key: 'bottomRight' },
];

@customElement('s-dock-shell')
export class DockShell extends BaseComponent {
  static readonly tagName = 's-dock-shell' as const;

  protected readonly stylesheet = css`
    :host {
      display: contents;
    }

    .capsule-btn {
      position: fixed;
      inset: auto auto 20px 20px;
      margin: 0;
      padding: 7px 14px;
      border: 1px solid var(--s-border);
      border-radius: 999px;
      background: var(--s-bg);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      transition-property: opacity, transform, inset, background, display, overlay;
      transition-duration: 0.22s, 0.22s, 0.28s, 0.15s, 0.22s, 0.22s;
      transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
      transition-behavior: allow-discrete;

      @media (prefers-reduced-motion: no-preference) {
        transform: scale(0.88);
      }

      &:hover {
        background: var(--s-surface-hover);
      }
    }

    .capsule-btn:popover-open {
      display: inline-flex;
      opacity: 1;

      @starting-style {
        opacity: 0;
      }

      @media (prefers-reduced-motion: no-preference) {
        transform: scale(1);

        @starting-style {
          transform: scale(0.84);
        }
      }
    }

    .capsule-btn[data-closing] {
      opacity: 0;

      @media (prefers-reduced-motion: no-preference) {
        transform: scale(0.88);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .capsule-btn {
        transition-duration: 0.1s;
      }
    }

    .capsule-badge:empty {
      display: none;
    }

    .lang-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 26px;
      padding: 0 7px;
      border: 1px solid var(--s-border);
      border-radius: 7px;
      background: var(--s-surface);
      color: var(--s-text-muted);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;

      &:hover {
        background: var(--s-surface-hover);
        color: var(--s-text);
      }
    }

    .section-divider {
      height: 1px;
      background: var(--s-border);
      margin: 2px 0;
    }

    .pos-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
    }

    .pos-btn,
    .shortcut-select {
      padding: 5px 8px;
      border-radius: 7px;
      border: 1px solid var(--s-border);
      background: var(--s-surface);
      color: var(--s-text);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: var(--s-surface-hover);
      }
    }

    .conflict-banner {
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--s-danger-bg);
      color: var(--s-danger);
      font-size: 11px;
      display: none;

      &[data-show="true"] {
        display: block;
      }
    }
  `;

  #presets: readonly ShortcutPreset[] = [];
  #showPresets = false;
  #capsuleTitle = 'Sora';
  #panelTitle = 'Sora';
  #badgeText = '';
  #shortcutLabel = '';
  #conflictReason: string | null = null;
  #announceTimer: ReturnType<typeof setTimeout> | null = null;
  #onLocaleChange?: (locale: ResolvedLocale) => void;

  get popoverEl(): ComponentElement<Popover> | null {
    return this.$<Popover>('#pop');
  }

  get capsuleEl(): HTMLButtonElement | null {
    return this.$<HTMLButtonElement>('#capsule');
  }

  configure(opts: {
    capsuleTitle: string;
    panelTitle: string;
    badgeText?: string;
    shortcutPresets?: readonly ShortcutPreset[];
    showPresets?: boolean;
    onLocaleChange?: (locale: ResolvedLocale) => void;
  }): void {
    this.#capsuleTitle = opts.capsuleTitle;
    this.#panelTitle = opts.panelTitle;
    if (opts.badgeText !== undefined) this.#badgeText = opts.badgeText;
    if (opts.shortcutPresets) this.#presets = opts.shortcutPresets;
    if (opts.showPresets !== undefined) this.#showPresets = opts.showPresets;
    if (opts.onLocaleChange) this.#onLocaleChange = opts.onLocaleChange;
    this.#syncTexts();
  }

  setBadge(text: string): void {
    this.#badgeText = text;
    const el = this.$<HTMLElement>('#capsule-badge');
    if (el) el.textContent = text;
  }

  setShortcutState(label: string, conflictReason: string | null, currentCombo?: string): void {
    this.#shortcutLabel = label;
    this.#conflictReason = conflictReason;
    const lbl = this.$<HTMLElement>('#shortcut-badge');
    if (lbl) lbl.textContent = label;
    const sel = this.$<HTMLSelectElement>('#shortcut-select');
    if (sel && currentCombo) sel.value = currentCombo;
    const banner = this.$<HTMLElement>('#conflict-msg');
    if (banner) {
      if (conflictReason) {
        banner.textContent = conflictReason;
        banner.setAttribute('data-show', 'true');
      } else {
        banner.textContent = '';
        banner.removeAttribute('data-show');
      }
    }
  }

  setRecording(isRecording: boolean): void {
    const labelSpan = this.$<HTMLElement>('#record-btn-text');
    const locale = resolveLocale();
    if (labelSpan) {
      labelSpan.textContent = isRecording
        ? SHELL_DICT[locale].recordingBtn
        : SHELL_DICT[locale].recordBtn;
    }
  }

  announce(message: string): void {
    const region = this.$<HTMLElement>('#live-region');
    if (!region) return;
    if (this.#announceTimer !== null) clearTimeout(this.#announceTimer);
    region.textContent = message;
    this.#announceTimer = setTimeout(() => {
      region.textContent = '';
      this.#announceTimer = null;
    }, 1200);
  }

  #syncTexts(): void {
    const locale = resolveLocale();
    const t = SHELL_DICT[locale];

    const capTitle = this.$<HTMLElement>('#capsule-label');
    const panTitle = this.$<HTMLElement>('#panel-title');
    const badge = this.$<HTMLElement>('#capsule-badge');
    const cap = this.capsuleEl;
    const pop = this.popoverEl;
    const langBtn = this.$<HTMLButtonElement>('#btn-lang');
    const langText = this.$<HTMLElement>('#lang-text');
    const scLabel = this.$<HTMLElement>('#shortcut-label');
    const scHint = this.$<HTMLElement>('#shortcut-hint');
    const posTitle = this.$<HTMLElement>('#pos-title');
    const recText = this.$<HTMLElement>('#record-btn-text');

    if (capTitle) capTitle.textContent = this.#capsuleTitle;
    if (panTitle) panTitle.textContent = this.#panelTitle;
    if (badge) badge.textContent = this.#badgeText;
    if (cap) cap.title = t.dragCapsuleHint;
    if (pop) {
      pop.setAttribute('drag-title', t.dragHeaderHint);
      pop.setAttribute('minimize-title', t.minimize);
    }
    if (langBtn) langBtn.title = t.langSwitch;
    if (langText) langText.textContent = t.langBadge;
    if (scLabel) scLabel.textContent = t.shortcutLabel;
    if (scHint) {
      scHint.textContent = isMac
        ? `${t.shortcutHintMac} (${getAltKeyDisplayName()})`
        : t.shortcutHintOther;
    }
    if (posTitle) posTitle.textContent = t.posTitle;
    if (recText) recText.textContent = t.recordBtn;

    for (const item of SNAP_PRESET_KEYS) {
      const btn = this.$<HTMLButtonElement>(`#pos-btn-${item.id}`);
      if (btn) btn.textContent = t[item.key];
    }

    const sel = this.$<HTMLSelectElement>('#shortcut-select');
    if (sel) {
      sel.hidden = !this.#showPresets || this.#presets.length === 0;
    }
  }

  protected override onConnect(): void {
    useI18n(SHELL_DICT, this.scope.signal, (locale) => {
      this.#syncTexts();
      this.#onLocaleChange?.(locale);
    });
  }

  protected override onMount(): void {
    this.#syncTexts();
    if (this.#shortcutLabel) {
      this.setShortcutState(this.#shortcutLabel, this.#conflictReason);
    }
  }

  protected override onDestroy(): void {
    if (this.#announceTimer !== null) clearTimeout(this.#announceTimer);
  }

  protected render(): DocumentFragment {
    const locale = resolveLocale();
    const t = SHELL_DICT[locale];

    return html`
      <button
        id="capsule"
        type="button"
        popover="manual"
        class="capsule-btn select-none"
        title=${t.dragCapsuleHint}
      >
        <slot name="icon"></slot>
        <span id="capsule-label">${this.#capsuleTitle}</span>
        <span id="capsule-badge" class="capsule-badge s-badge font-mono">${this.#badgeText}</span>
      </button>

      <s-popover
        id="pop"
        popover="manual"
        drag-title=${t.dragHeaderHint}
        minimize-title=${t.minimize}
        @minimize=${() => {
          this.dispatchEvent(new CustomEvent('shell-minimize', { bubbles: true, composed: true }));
        }}
      >
        <span slot="title" class="flex items-center gap-2">
          <slot name="panel-icon"></slot>
          <span id="panel-title">${this.#panelTitle}</span>
        </span>

        <button
          slot="header-actions"
          id="btn-lang"
          type="button"
          class="lang-btn"
          title=${t.langSwitch}
          @click=${() => {
            toggleNextLocale();
          }}
        >
          ${svgIcon(Icons.globe)}
          <span id="lang-text">${t.langBadge}</span>
        </button>

        <slot></slot>

        <div class="section-divider"></div>

        <div id="shortcut-section" class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs text-muted">
            <span id="shortcut-label">${t.shortcutLabel}</span>
            <span id="shortcut-badge" class="s-badge font-mono">${this.#shortcutLabel || '...'}</span>
          </div>
          <div class="flex gap-2">
            <select
              id="shortcut-select"
              class="shortcut-select flex-1"
              ?hidden=${!this.#showPresets || this.#presets.length === 0}
              @change=${(e: Event) => {
                const combo = (e.currentTarget as HTMLSelectElement).value;
                this.dispatchEvent(
                  new CustomEvent<string>('shell-select-shortcut', {
                    detail: combo,
                    bubbles: true,
                    composed: true,
                  })
                );
              }}
            >
              ${this.#presets.map(
                (p) => html`<option value=${p.combo}>${t.presetPrefix}${p.label}</option>`
              )}
            </select>
            <button
              id="record-btn"
              type="button"
              class="s-btn ${this.#showPresets ? '' : 'w-full'}"
              @click=${() => {
                this.dispatchEvent(
                  new CustomEvent('shell-record-shortcut', { bubbles: true, composed: true })
                );
              }}
            >
              ${svgIcon(Icons.keyboard)}
              <span id="record-btn-text">${t.recordBtn}</span>
            </button>
          </div>
          <div id="shortcut-hint" class="text-xs text-muted">
            ${isMac ? t.shortcutHintMac : t.shortcutHintOther}
          </div>
          <div id="conflict-msg" class="conflict-banner"></div>
        </div>

        <div id="position-section" class="flex flex-col gap-1">
          <div id="pos-title" class="text-xs text-muted">${t.posTitle}</div>
          <div class="pos-grid">
            ${SNAP_PRESET_KEYS.map(
              (item) => html`
                <button
                  id=${`pos-btn-${item.id}`}
                  type="button"
                  class="pos-btn"
                  @click=${() => {
                    this.dispatchEvent(
                      new CustomEvent<SnapPresetName>('shell-preset-position', {
                        detail: item.id,
                        bubbles: true,
                        composed: true,
                      })
                    );
                  }}
                >
                  ${t[item.key]}
                </button>
              `
            )}
          </div>
        </div>
      </s-popover>

      <div id="live-region" class="visually-hidden" aria-live="polite"></div>
    `;
  }
}

export interface UseDockAppOptions {
  readonly moduleId: string;
  readonly moduleName: string;
  readonly defaultPreset: SnapPresetName;
  readonly defaultShortcut: string;
  readonly signal: AbortSignal;
  readonly shortcutPresets?: readonly ShortcutPreset[];
  readonly showShortcutPresets?: boolean;
  readonly onExpandedChange?: (expanded: boolean) => void;
}

export interface DockAppController {
  readonly snapPos: SnapPositionController;
  readonly shortcut: ShortcutController;
  isExpanded(): boolean;
  setExpanded(expanded: boolean, animate?: boolean): void;
  setBadge(text: string): void;
  syncTitles(capsuleTitle: string, panelTitle: string): void;
}

// * 一键把无状态 <s-dock-shell>、存储、位置防重叠、跨脚本快捷键和多语言连起来，方便快速写新脚本
export function useDockApp(
  shell: ComponentElement<DockShell> | DockShell,
  options: UseDockAppOptions
): DockAppController {
  const {
    moduleId,
    moduleName,
    defaultPreset,
    defaultShortcut,
    signal,
    shortcutPresets,
    showShortcutPresets = false,
    onExpandedChange,
  } = options;

  const expandedStore = useStorage<boolean>(`${moduleId}.expanded`, false);

  const snapPos = useSnapPosition(moduleId, defaultPreset, signal, (msg) => {
    const locale = resolveLocale();
    shell.announce(`${SHELL_DICT[locale].movedPrefix}${msg}`);
  });

  const setExpanded = (expanded: boolean, animate = true) => {
    expandedStore.set(expanded);
    const pop = shell.popoverEl;
    const cap = shell.capsuleEl;
    if (!pop || !cap) return;

    if (expanded) {
      if (animate) void closeTopLayerPopover(cap);
      else if (cap.matches(':popover-open')) cap.hidePopover();
      showTopLayerPopover(pop);
    } else {
      if (animate) void closeTopLayerPopover(pop);
      else if (pop.matches(':popover-open')) pop.hidePopover();
      showTopLayerPopover(cap);
    }
    requestAnimationFrame(() => snapPos.syncTargets([pop, cap]));
    onExpandedChange?.(expanded);
  };

  const shortcut = useShortcut(
    moduleId,
    moduleName,
    defaultShortcut,
    () => setExpanded(!expandedStore.get()),
    signal
  );

  const refreshShortcutState = () => {
    const conflict = shortcut.getActiveConflicts();
    shell.setShortcutState(shortcut.getLabel(), conflict.reason, shortcut.getCombo());
  };

  shell.configure({
    capsuleTitle: moduleName,
    panelTitle: moduleName,
    shortcutPresets,
    showPresets: showShortcutPresets,
    onLocaleChange: () => refreshShortcutState(),
  });

  const pop = shell.popoverEl;
  const cap = shell.capsuleEl;
  if (pop && cap) {
    if (pop.headerEl) {
      snapPos.bindDragHandle(pop.headerEl, [pop, cap]);
    }
    snapPos.bindDragHandle(cap, [pop, cap], () => setExpanded(true));
  }

  shell.addEventListener('shell-minimize', () => setExpanded(false), { signal });
  shell.addEventListener(
    'shell-preset-position',
    (e: Event) => {
      const preset = (e as CustomEvent<SnapPresetName>).detail;
      snapPos.applyPreset(preset);
    },
    { signal }
  );
  shell.addEventListener(
    'shell-select-shortcut',
    (e: Event) => {
      const combo = (e as CustomEvent<string>).detail;
      const conflict = shortcut.setCombo(combo);
      shell.setShortcutState(shortcut.getLabel(), conflict.reason, shortcut.getCombo());
    },
    { signal }
  );
  shell.addEventListener(
    'shell-record-shortcut',
    () => {
      shell.setRecording(true);
      shortcut.startRecording((combo, conflict, cancelled) => {
        if (cancelled) {
          shell.setRecording(false);
          refreshShortcutState();
          return;
        }
        if (combo === null && conflict.reason) {
          shell.setShortcutState(shortcut.getLabel(), conflict.reason);
          return;
        }
        shell.setRecording(false);
        shell.setShortcutState(shortcut.getLabel(), conflict.reason, combo ?? undefined);
      });
    },
    { signal }
  );

  shortcut.onRegistryChange(() => refreshShortcutState(), signal);
  refreshShortcutState();
  setExpanded(expandedStore.get(), false);

  return {
    snapPos,
    shortcut,
    isExpanded: () => expandedStore.get(),
    setExpanded: (v, anim = true) => setExpanded(v, anim),
    setBadge: (txt) => shell.setBadge(txt),
    syncTitles: (capsuleTitle, panelTitle) => {
      shell.configure({ capsuleTitle, panelTitle });
    },
  };
}

export type { LocaleMode };
