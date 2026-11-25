import {
  BaseComponent,
  createLogger,
  customElement,
  formatComboLabel,
  html,
  mountComponent,
  resolveLocale,
  type ShortcutPreset,
  useI18n,
  useStorage,
} from '@core';
import {
  type DockAppController,
  DockShell,
  Icons,
  SettingRow,
  Switch,
  svgIcon,
  useDockApp,
} from '@ui';
import { PLAYGROUND_DICT } from './locales.ts';
import styleText from './style.css';

void DockShell;
void SettingRow;
void Switch;

const logger = createLogger('Playground');
const persistedCounter = useStorage<number>('playground.count', 0);
const persistEnabledStore = useStorage<boolean>('playground.persistEnabled', true);

const PLAYGROUND_SHORTCUT_PRESETS: readonly ShortcutPreset[] = [
  { combo: 'Alt+KeyS', label: formatComboLabel('Alt+KeyS') },
  { combo: 'Alt+KeyQ', label: formatComboLabel('Alt+KeyQ') },
  { combo: 'Alt+KeyW', label: formatComboLabel('Alt+KeyW') },
  { combo: 'Alt+Backquote', label: formatComboLabel('Alt+Backquote') },
  { combo: 'Alt+KeyP', label: `${formatComboLabel('Alt+KeyP')} (Peek)` },
];

@customElement('s-playground-app')
export class PlaygroundApp extends BaseComponent {
  static readonly tagName = 's-playground-app' as const;
  protected readonly stylesheet = styleText;

  #memoryCount = 0;
  #dock: DockAppController | null = null;

  #syncCounterUI(bump = false): void {
    const t = PLAYGROUND_DICT[resolveLocale()];
    const countEl = this.$<HTMLElement>('#count-val');
    const diskStatusEl = this.$<HTMLElement>('#disk-status');

    if (countEl) {
      countEl.textContent = String(this.#memoryCount);
      if (bump) {
        countEl.setAttribute('data-bump', 'true');
        setTimeout(() => countEl.removeAttribute('data-bump'), 180);
      }
    }
    this.#dock?.setBadge(String(this.#memoryCount));
    if (diskStatusEl) {
      diskStatusEl.textContent = persistEnabledStore.get()
        ? `${t.savedPrefix}${persistedCounter.get()}`
        : t.memoryOnly;
    }
  }

  #updateCount(nextVal: number): void {
    this.#memoryCount = nextVal;
    if (persistEnabledStore.get()) {
      persistedCounter.set(nextVal);
    }
    this.#syncCounterUI(true);
  }

  #syncLocaleTexts(): void {
    const t = PLAYGROUND_DICT[resolveLocale()];
    this.#dock?.syncTitles(t.appName, t.panelTitle);

    const rowPersist = this.$<SettingRow>('#row-persist');
    if (rowPersist) {
      rowPersist.setAttribute('label', t.persistLabel);
      rowPersist.setAttribute('hint', t.persistHint);
    }
    const setText = (sel: string, txt: string) => {
      const el = this.$<HTMLElement>(sel);
      if (el) el.textContent = txt;
    };
    setText('#lbl-drag-tip', t.dragTip);
    setText('#btn-inc', t.incBtn);
    setText('#btn-reset', t.resetBtn);
    const removeBtn = this.$<HTMLButtonElement>('#btn-remove');
    if (removeBtn) removeBtn.title = t.removeTitle;
    this.#syncCounterUI(false);
  }

  protected render(): DocumentFragment {
    const t = PLAYGROUND_DICT[resolveLocale()];

    return html`
      <s-dock-shell id="dock">
        <span slot="icon">${svgIcon(Icons.sparkles)}</span>
        <span slot="panel-icon">${svgIcon(Icons.sparkles)}</span>

        <div class="count-box flex items-center justify-between">
          <div>
            <div id="lbl-drag-tip" class="text-xs text-muted">${t.dragTip}</div>
            <div id="disk-status" class="text-xs font-mono text-muted">...</div>
          </div>
          <span id="count-val" class="count-num font-mono">0</span>
        </div>

        <s-setting-row id="row-persist" label=${t.persistLabel} hint=${t.persistHint}>
          <s-switch
            id="persist-switch"
            @change=${(e: CustomEvent<boolean>) => {
              const enabled = e.detail;
              persistEnabledStore.set(enabled);
              persistedCounter.set(enabled ? this.#memoryCount : 0);
              this.#syncCounterUI(false);
            }}
          ></s-switch>
        </s-setting-row>

        <div class="flex gap-2">
          <button
            id="btn-inc"
            type="button"
            class="s-btn s-btn-primary flex-1"
            @click=${() => this.#updateCount(this.#memoryCount + 1)}
          >
            ${t.incBtn}
          </button>
          <button
            id="btn-reset"
            type="button"
            class="s-btn flex-1"
            @click=${() => this.#updateCount(0)}
          >
            ${t.resetBtn}
          </button>
          <button
            id="btn-remove"
            type="button"
            class="s-btn s-btn-danger"
            title=${t.removeTitle}
            @click=${() => this.remove()}
          >
            ${svgIcon(Icons.trash)}
          </button>
        </div>
      </s-dock-shell>
    `;
  }

  protected override onMount(): void {
    const switchEl = this.$<Switch>('#persist-switch');
    const isPersistOn = persistEnabledStore.get();
    this.#memoryCount = isPersistOn ? persistedCounter.get() : 0;
    if (switchEl) switchEl.checked = isPersistOn;
    this.#syncCounterUI(false);
  }

  protected override onConnect(): void {
    const shell = this.$<DockShell>('#dock');

    if (shell) {
      this.#dock = useDockApp(shell, {
        moduleId: 'playground',
        moduleName: PLAYGROUND_DICT[resolveLocale()].appName,
        defaultPreset: 'bottom-right',
        defaultShortcut: 'Alt+KeyS',
        signal: this.scope.signal,
        shortcutPresets: PLAYGROUND_SHORTCUT_PRESETS,
        showShortcutPresets: true,
      });
    }

    useI18n(PLAYGROUND_DICT, this.scope.signal, () => this.#syncLocaleTexts());
    this.#syncLocaleTexts();
    logger.success(`测试面板已开启，快捷键：${this.#dock?.shortcut.getLabel() ?? ''}`);
  }
}

mountComponent(PlaygroundApp);
