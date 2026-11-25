import {
  BaseComponent,
  createComponent,
  createLogger,
  customElement,
  getAltKeyDisplayName,
  html,
  mountComponent,
  resolveLocale,
  useI18n,
  useObserver,
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
import { ChatExporter, type ExportFormat } from './features/chat-exporter.ts';
import { DomTrimmer, type TrimmerConfig } from './features/dom-trimmer.ts';
import { LayoutGuard, type LayoutGuardConfig } from './features/layout-guard.ts';
import { PromptQuickbar } from './features/prompt-quickbar.ts';
import { AISTUDIO_DICT } from './locales.ts';
import styleText from './style.css';

void DockShell;
void SettingRow;
void Switch;

const logger = createLogger('AIStudio');

const trimmerStore = useStorage<TrimmerConfig>('aistudio.trimmer', {
  enabled: true,
  baseMaxVisible: 35,
  maxCache: 50,
  restoreStep: 10,
});

const layoutGuardStore = useStorage<LayoutGuardConfig>('aistudio.layoutGuard', {
  guardNavigation: true,
  savePromptDraft: true,
  hideLeftNavbar: false,
  hideRightPanel: false,
});

const exportCfgStore = useStorage<{
  enabled: boolean;
  format: ExportFormat;
  includeThoughts: boolean;
  includeSystem: boolean;
  includeImagesBase64: boolean;
  stripEmojis: boolean;
}>('aistudio.exporter', {
  enabled: true,
  format: 'md',
  includeThoughts: true,
  includeSystem: true,
  includeImagesBase64: true,
  stripEmojis: false,
});

@customElement('s-aistudio-app')
export class AIStudioApp extends BaseComponent {
  static readonly tagName = 's-aistudio-app' as const;
  protected readonly stylesheet = styleText;

  #lastPathname = location.pathname;
  #exporter = new ChatExporter();
  #layoutGuard = new LayoutGuard();
  #quickbar = createComponent(PromptQuickbar);
  #dock: DockAppController | null = null;
  #observerDebounce: ReturnType<typeof setTimeout> | null = null;

  #trimmer = new DomTrimmer({
    onBeforeDetach: (turnEl) => this.#exporter.captureTurnElement(turnEl),
    onStatsChange: (st) => {
      const t = AISTUDIO_DICT[resolveLocale()];
      const statEl = this.$<HTMLElement>('#trim-stats');
      const limitEl = this.$<HTMLElement>('#trim-limit');
      if (statEl) {
        statEl.textContent = t.statsText
          .replace('{visible}', String(st.visibleRounds))
          .replace('{archived}', String(st.totalArchivedRounds));
      }
      if (limitEl) {
        limitEl.textContent = t.limitText
          .replace('{limit}', String(st.currentLimit))
          .replace('{hidden}', String(st.hiddenInDomRounds))
          .replace('{detached}', String(st.detachedInMemRounds));
      }
      this.#dock?.setBadge(String(st.visibleRounds));
    },
  });

  #updateTrimmerPatch(patch: Partial<TrimmerConfig>): void {
    const next = { ...trimmerStore.get(), ...patch };
    trimmerStore.set(next);
    this.#trimmer.syncConfig(next);
  }

  #updateLayoutPatch(patch: Partial<LayoutGuardConfig>): void {
    const next = { ...layoutGuardStore.get(), ...patch };
    layoutGuardStore.set(next);
    this.#layoutGuard.syncConfig(next);
  }

  #syncLocaleTexts(): void {
    const t = AISTUDIO_DICT[resolveLocale()];
    const mod = getAltKeyDisplayName();
    this.#dock?.syncTitles(t.appName, t.panelTitle);

    const setRow = (id: string, label: string, hint = '') => {
      const el = this.$<SettingRow>(id);
      if (!el) return;
      el.setAttribute('label', label);
      el.setAttribute('hint', hint);
    };
    const setText = (sel: string, txt: string) => {
      const el = this.$<HTMLElement>(sel);
      if (el) el.textContent = txt;
    };
    const setTitle = (sel: string, txt: string) => {
      const el = this.$<HTMLElement>(sel);
      if (el) el.title = txt;
    };

    setRow('#row-guard', t.guardLabel, t.guardHint.replace('{mod}', mod));
    setRow('#row-draft', t.draftLabel, t.draftHint);
    setRow('#row-hide-left', t.hideLeftLabel);
    setRow('#row-hide-right', t.hideRightLabel);
    setRow('#row-trim', t.trimLabel, t.trimHint);
    setRow('#row-base-max', t.baseMaxLabel, t.baseMaxHint);
    setRow('#row-max-cache', t.maxCacheLabel, t.maxCacheHint);
    setRow('#row-restore-step', t.restoreStepLabel, t.restoreStepHint);
    setRow('#row-exp-thoughts', t.exportThoughtsLabel);
    setRow('#row-exp-system', t.exportSystemLabel);
    setRow('#row-exp-images', t.exportImagesLabel, t.exportImagesHint);
    setRow('#row-exp-emoji', t.exportEmojiLabel, t.exportEmojiHint);

    setText('#btn-collapse-text', t.collapseCodeBtn);
    setTitle('#btn-collapse-code', t.collapseCodeTitle);
    setText('#btn-expand-text', t.expandCodeBtn);
    setTitle('#btn-expand-code', t.expandCodeTitle);
    setText('#btn-scroll-text', t.scrollLatestBtn);
    setTitle('#btn-scroll-latest', t.scrollLatestTitle);
    setText(
      '#btn-restore-step',
      t.restoreBtn.replace('{step}', String(trimmerStore.get().restoreStep))
    );
    setText('#btn-reset-trim', t.resetTrimBtn);
    setText('#lbl-export-title', t.exportTitle);
    setText('#lbl-export-hint', t.exportHint);
    setText('#btn-export-now-text', t.exportNowBtn);
    setText('#btn-deep-scan', t.exportFullBtn);
  }

  protected render(): DocumentFragment {
    const t = AISTUDIO_DICT[resolveLocale()];
    const mod = getAltKeyDisplayName();
    const tCfg = trimmerStore.get();

    return html`
      <s-dock-shell id="dock">
        <span slot="icon">${svgIcon(Icons.sparkles)}</span>
        <span slot="panel-icon">${svgIcon(Icons.sparkles)}</span>

        <div class="stats-card flex flex-col gap-2">
          <div>
            <div id="guard-tip" class="text-xs font-semibold">
              <span id="trim-stats">...</span>
            </div>
            <div id="trim-limit" class="text-xs font-mono text-muted">...</div>
          </div>
          <div class="flex gap-2">
            <button
              id="btn-collapse-code"
              type="button"
              class="s-btn flex-1"
              title=${t.collapseCodeTitle}
              @click=${() => {
                const c = this.#trimmer.collapseAllCodeBlocks();
                logger.info(`已收起 ${c} 个代码块`);
              }}
            >
              ${svgIcon(Icons.collapseCode)}
              <span id="btn-collapse-text">${t.collapseCodeBtn}</span>
            </button>
            <button
              id="btn-expand-code"
              type="button"
              class="s-btn flex-1"
              title=${t.expandCodeTitle}
              @click=${() => {
                const c = this.#trimmer.expandAllCodeBlocks();
                logger.info(`已展开 ${c} 个代码块`);
              }}
            >
              ${svgIcon(Icons.expandCode)}
              <span id="btn-expand-text">${t.expandCodeBtn}</span>
            </button>
            <button
              id="btn-scroll-latest"
              type="button"
              class="s-btn flex-1"
              title=${t.scrollLatestTitle}
              @click=${() => {
                this.#trimmer.scrollToLatestTurn();
              }}
            >
              ${svgIcon(Icons.arrowDown)}
              <span id="btn-scroll-text">${t.scrollLatestBtn}</span>
            </button>
          </div>
        </div>

        <s-setting-row
          id="row-guard"
          label=${t.guardLabel}
          hint=${t.guardHint.replace('{mod}', mod)}
        >
          <s-switch
            id="sw-guard"
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ guardNavigation: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row id="row-draft" label=${t.draftLabel} hint=${t.draftHint}>
          <s-switch
            id="sw-draft"
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ savePromptDraft: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row id="row-hide-left" compact label=${t.hideLeftLabel}>
          <s-switch
            id="sw-hide-left"
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ hideLeftNavbar: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row id="row-hide-right" compact label=${t.hideRightLabel}>
          <s-switch
            id="sw-hide-right"
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ hideRightPanel: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <div class="section-divider"></div>

        <s-setting-row id="row-trim" label=${t.trimLabel} hint=${t.trimHint}>
          <s-switch
            id="sw-trim"
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateTrimmerPatch({ enabled: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row id="row-base-max" compact label=${t.baseMaxLabel} hint=${t.baseMaxHint}>
          <input
            id="inp-base-max"
            type="number"
            min="0"
            class="num-input font-mono"
            value=${String(tCfg.baseMaxVisible)}
            @change=${(e: Event) => {
              const raw = Number((e.currentTarget as HTMLInputElement).value);
              const v = Number.isNaN(raw) ? 35 : Math.max(0, raw);
              this.#updateTrimmerPatch({ baseMaxVisible: v });
            }}
          />
        </s-setting-row>

        <s-setting-row id="row-max-cache" compact label=${t.maxCacheLabel} hint=${t.maxCacheHint}>
          <input
            id="inp-max-cache"
            type="number"
            min="10"
            class="num-input font-mono"
            value=${String(tCfg.maxCache)}
            @change=${(e: Event) => {
              const raw = Number((e.currentTarget as HTMLInputElement).value);
              const v = Number.isNaN(raw) ? 50 : Math.max(10, raw);
              this.#updateTrimmerPatch({ maxCache: v });
            }}
          />
        </s-setting-row>

        <s-setting-row
          id="row-restore-step"
          compact
          label=${t.restoreStepLabel}
          hint=${t.restoreStepHint}
        >
          <input
            id="inp-restore-step"
            type="number"
            min="1"
            class="num-input font-mono"
            value=${String(tCfg.restoreStep)}
            @change=${(e: Event) => {
              const v = Math.max(1, Number((e.currentTarget as HTMLInputElement).value) || 10);
              this.#updateTrimmerPatch({ restoreStep: v });
              const btn = this.$<HTMLButtonElement>('#btn-restore-step');
              if (btn) {
                btn.textContent = AISTUDIO_DICT[resolveLocale()].restoreBtn.replace(
                  '{step}',
                  String(v)
                );
              }
            }}
          />
        </s-setting-row>

        <div class="flex gap-2">
          <button
            id="btn-restore-step"
            type="button"
            class="s-btn flex-1"
            @click=${() => {
              this.#trimmer.restoreStep(trimmerStore.get());
            }}
          >
            ${t.restoreBtn.replace('{step}', String(tCfg.restoreStep))}
          </button>
          <button
            id="btn-reset-trim"
            type="button"
            class="s-btn flex-1"
            @click=${() => {
              this.#trimmer.resetToBaseVisible(trimmerStore.get());
            }}
          >
            ${t.resetTrimBtn}
          </button>
        </div>

        <div class="section-divider"></div>

        <div class="flex items-center justify-between gap-2">
          <div>
            <div id="lbl-export-title" class="text-sm font-medium">${t.exportTitle}</div>
            <div id="lbl-export-hint" class="text-xs text-muted">${t.exportHint}</div>
          </div>
          <select
            id="sel-fmt"
            class="fmt-select"
            @change=${(e: Event) => {
              const fmt = (e.currentTarget as HTMLSelectElement).value as ExportFormat;
              exportCfgStore.set({ ...exportCfgStore.get(), format: fmt });
            }}
          >
            <option value="md">Markdown (.md)</option>
            <option value="json">JSON (.json)</option>
          </select>
        </div>

        <s-setting-row id="row-exp-thoughts" compact label=${t.exportThoughtsLabel}>
          <s-switch
            id="sw-thoughts"
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), includeThoughts: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row id="row-exp-system" compact label=${t.exportSystemLabel}>
          <s-switch
            id="sw-system"
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), includeSystem: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row
          id="row-exp-images"
          compact
          label=${t.exportImagesLabel}
          hint=${t.exportImagesHint}
        >
          <s-switch
            id="sw-images"
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), includeImagesBase64: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row
          id="row-exp-emoji"
          compact
          label=${t.exportEmojiLabel}
          hint=${t.exportEmojiHint}
        >
          <s-switch
            id="sw-emoji"
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), stripEmojis: e.detail });
            }}
          ></s-switch>
        </s-setting-row>

        <div class="flex gap-2">
          <button
            type="button"
            class="s-btn flex-1"
            @click=${() => {
              void this.#exporter.exportSnapshot(exportCfgStore.get());
            }}
          >
            ${svgIcon(Icons.download)}
            <span id="btn-export-now-text">${t.exportNowBtn}</span>
          </button>
          <button
            id="btn-deep-scan"
            type="button"
            class="s-btn s-btn-primary flex-1"
            @click=${async (e: MouseEvent) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.disabled = true;
              try {
                await this.#exporter.performFullScrollExport(
                  this.#trimmer,
                  trimmerStore.get(),
                  exportCfgStore.get(),
                  (msg) => {
                    btn.textContent = msg;
                  }
                );
              } finally {
                btn.disabled = false;
                btn.textContent = AISTUDIO_DICT[resolveLocale()].exportFullBtn;
              }
            }}
          >
            ${t.exportFullBtn}
          </button>
        </div>
      </s-dock-shell>
    `;
  }

  protected override onMount(): void {
    const swGuard = this.$<Switch>('#sw-guard');
    const swDraft = this.$<Switch>('#sw-draft');
    const swHideLeft = this.$<Switch>('#sw-hide-left');
    const swHideRight = this.$<Switch>('#sw-hide-right');
    const swTrim = this.$<Switch>('#sw-trim');
    const swThoughts = this.$<Switch>('#sw-thoughts');
    const swSystem = this.$<Switch>('#sw-system');
    const swImages = this.$<Switch>('#sw-images');
    const swEmoji = this.$<Switch>('#sw-emoji');
    const selFmt = this.$<HTMLSelectElement>('#sel-fmt');

    const tCfg = trimmerStore.get();
    const lCfg = layoutGuardStore.get();
    const eCfg = exportCfgStore.get();

    this.#trimmer.syncConfig(tCfg);
    this.#layoutGuard.syncConfig(lCfg);

    if (swGuard) swGuard.checked = lCfg.guardNavigation;
    if (swDraft) swDraft.checked = lCfg.savePromptDraft;
    if (swHideLeft) swHideLeft.checked = lCfg.hideLeftNavbar;
    if (swHideRight) swHideRight.checked = lCfg.hideRightPanel;
    if (swTrim) swTrim.checked = tCfg.enabled;
    if (swThoughts) swThoughts.checked = eCfg.includeThoughts;
    if (swSystem) swSystem.checked = eCfg.includeSystem;
    if (swImages) swImages.checked = eCfg.includeImagesBase64;
    if (swEmoji) swEmoji.checked = eCfg.stripEmojis;
    if (selFmt) selFmt.value = eCfg.format;
  }

  protected override onConnect(): void {
    const shell = this.$<DockShell>('#dock');
    const guardTip = this.$<HTMLElement>('#guard-tip');

    if (shell) {
      this.#dock = useDockApp(shell, {
        moduleId: 'aistudio',
        moduleName: AISTUDIO_DICT[resolveLocale()].appName,
        defaultPreset: 'bottom-right',
        defaultShortcut: 'Alt+KeyA',
        signal: this.scope.signal,
      });
    }

    useI18n(AISTUDIO_DICT, this.scope.signal, () => this.#syncLocaleTexts());
    this.#syncLocaleTexts();

    this.#quickbar.setActions(
      () => {
        const c = this.#trimmer.collapseAllCodeBlocks();
        logger.info(`已收起 ${c} 个代码块`);
      },
      () => {
        const c = this.#trimmer.expandAllCodeBlocks();
        logger.info(`已展开 ${c} 个代码块`);
      },
      () => {
        this.#trimmer.scrollToLatestTurn();
      }
    );
    this.#quickbar.ensureAttached();

    this.#layoutGuard.bindGuards(this.scope.signal, (msg) => {
      logger.warn(msg);
      if (guardTip) {
        const prev = guardTip.textContent;
        guardTip.textContent = msg;
        setTimeout(() => {
          if (guardTip.textContent === msg) {
            guardTip.textContent = prev;
          }
        }, 3000);
      }
    });

    // * 流式回答期间合并防抖，避免每个字都全页扫描
    useObserver(
      document.body,
      () => {
        if (location.pathname !== this.#lastPathname) {
          this.#lastPathname = location.pathname;
          this.#exporter.resetSession();
          this.#trimmer.resetSession(trimmerStore.get());
          logger.info('切换到新对话，已清空旧缓存');
        }
        this.#quickbar.ensureAttached();
        this.#layoutGuard.checkGeneratingAndClearDraft();
        this.#layoutGuard.tryRestoreDraftOnce();

        if (this.#observerDebounce !== null) clearTimeout(this.#observerDebounce);
        this.#observerDebounce = setTimeout(() => {
          this.#observerDebounce = null;
          if (exportCfgStore.get().enabled) {
            this.#exporter.captureVisibleTurns();
          }
          this.#trimmer.optimize(trimmerStore.get());
        }, 250);
      },
      this.scope.signal
    );

    setTimeout(() => {
      this.#exporter.captureVisibleTurns();
      this.#trimmer.optimize(trimmerStore.get());
      this.#quickbar.ensureAttached();
      if (this.#layoutGuard.tryRestoreDraftOnce()) {
        logger.success('已自动恢复上次没发出去的草稿');
      }
    }, 1200);

    logger.success(`AI Studio 助手已开启，快捷键：${this.#dock?.shortcut.getLabel() ?? ''}`);
  }

  protected override onDisconnect(): void {
    if (this.#observerDebounce !== null) {
      clearTimeout(this.#observerDebounce);
      this.#observerDebounce = null;
    }
    this.#quickbar.remove();
  }
}

mountComponent(AIStudioApp);
