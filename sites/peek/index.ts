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
  useStorage,
} from '@core';
import {
  type ChipPosition,
  type ChipStyle,
  ExtractorRegistry,
  type GifSaveFormat,
  PeekTrigger,
  PeekViewer,
  type SearchEngineId,
} from '@preview';
import {
  type DockAppController,
  DockShell,
  Icons,
  SettingRow,
  Switch,
  svgIcon,
  useDockApp,
} from '@ui';
import { universalExtractor } from './extractors/universal.ts';
import { xExtractor } from './extractors/x.ts';
import { PEEK_DICT } from './locales.ts';
import styleText from './style.css';

void DockShell;
void SettingRow;
void Switch;

const logger = createLogger('Peek');

const enabledStore = useStorage<boolean>('peek.enabled', true);
const altDirectOpenStore = useStorage<boolean>('peek.altDirectOpen', true);
const chipPosStore = useStorage<ChipPosition>('peek.chipPos', 'top-left');
const chipStyleStore = useStorage<ChipStyle>('peek.chipStyle', 'full');
const searchEngineStore = useStorage<SearchEngineId>('peek.searchEngine', 'yandex');
const gifFormatStore = useStorage<GifSaveFormat>('peek.gifFormat', 'gif');
const filenameTplStore = useStorage<string>('peek.filenameTpl', '{original}');

const registry = new ExtractorRegistry().register(xExtractor, universalExtractor);

@customElement('s-peek-app')
export class PeekApp extends BaseComponent {
  static readonly tagName = 's-peek-app' as const;
  protected readonly stylesheet = styleText;

  #viewer = createComponent(PeekViewer);
  #trigger = createComponent(PeekTrigger);
  #dock: DockAppController | null = null;
  #rafPending = false;
  #mouseX = 0;
  #mouseY = 0;

  #syncViewerAndTriggerConfig(): void {
    this.#trigger.configure(chipPosStore.get(), chipStyleStore.get());
    this.#viewer.setPreferences({
      filenameTemplate: filenameTplStore.get(),
      searchEngine: searchEngineStore.get(),
      gifSaveFormat: gifFormatStore.get(),
      onSearchEngineChange: (engine) => {
        searchEngineStore.set(engine);
        const sel = this.$<HTMLSelectElement>('#sel-search-engine');
        if (sel) sel.value = engine;
      },
      onGifFormatChange: (fmt) => {
        gifFormatStore.set(fmt);
        const sel = this.$<HTMLSelectElement>('#sel-gif-format');
        if (sel) sel.value = fmt;
      },
    });
  }

  #syncLocaleTexts(): void {
    const t = PEEK_DICT[resolveLocale()];
    const mod = getAltKeyDisplayName();
    this.#dock?.syncTitles(t.appName, t.appName);

    const rowEnable = this.$<SettingRow>('#row-enable');
    if (rowEnable) {
      rowEnable.setAttribute('label', t.enableLabel);
      rowEnable.setAttribute('hint', t.enableHint);
    }
    const rowQuick = this.$<SettingRow>('#row-quick-key');
    if (rowQuick) {
      rowQuick.setAttribute('label', t.quickKeyLabel.replace('{mod}', mod));
      rowQuick.setAttribute('hint', t.quickKeyHint.replace('{mod}', mod));
    }

    const setText = (sel: string, txt: string) => {
      const el = this.$<HTMLElement>(sel);
      if (el) el.textContent = txt;
    };

    setText('#lbl-chip', t.chipLabel);
    setText('#opt-pos-tr', t.posTopRight);
    setText('#opt-pos-tl', t.posTopLeft);
    setText('#opt-pos-br', t.posBottomRight);
    setText('#opt-pos-bl', t.posBottomLeft);
    setText('#opt-style-icon', t.styleIconOnly);
    setText('#opt-style-compact', t.styleCompact);
    setText('#opt-style-full', t.styleFull);
    setText('#lbl-search-engine', t.searchEngineLabel);
    setText('#lbl-gif-format', t.gifFormatLabel);
    setText('#opt-gif-mp4', t.gifFormatMp4);
    setText('#opt-gif-gif', t.gifFormatGif);
    setText('#lbl-filename', t.filenameLabel);
    setText('#hint-filename', t.filenameHint);
    setText('#lbl-active-rules', t.activeRules);
  }

  async #tryOpenUnderCursor(): Promise<void> {
    if (this.#trigger.hasActiveTarget) {
      await this.#trigger.openCurrentMedia();
      return;
    }
    const elements = document.elementsFromPoint(this.#mouseX, this.#mouseY);
    for (const el of elements) {
      if (el === this.host || el === this.#trigger.host || el === this.#viewer.host) continue;
      const hit = await registry.resolveFromHoverTarget(el);
      if (hit) {
        this.#trigger.attachTo(hit.anchorEl, hit.media, this.#viewer, registry);
        await this.#trigger.openCurrentMedia();
        return;
      }
    }
  }

  protected render(): DocumentFragment {
    const t = PEEK_DICT[resolveLocale()];
    const mod = getAltKeyDisplayName();
    const activeNames = registry
      .getActiveExtractors()
      .map((e) => e.name)
      .join(' / ');

    return html`
      <s-dock-shell id="dock">
        <span slot="icon">${svgIcon(Icons.lens)}</span>
        <span slot="panel-icon">${svgIcon(Icons.lens)}</span>

        <s-setting-row id="row-enable" label=${t.enableLabel} hint=${t.enableHint}>
          <s-switch
            id="sw-enable"
            @change=${(e: CustomEvent<boolean>) => {
              enabledStore.set(e.detail);
              if (!e.detail) this.#trigger.dismissImmediate();
            }}
          ></s-switch>
        </s-setting-row>

        <s-setting-row
          id="row-quick-key"
          label=${t.quickKeyLabel.replace('{mod}', mod)}
          hint=${t.quickKeyHint.replace('{mod}', mod)}
        >
          <s-switch
            id="sw-alt"
            @change=${(e: CustomEvent<boolean>) => altDirectOpenStore.set(e.detail)}
          ></s-switch>
        </s-setting-row>

        <div class="flex items-center justify-between gap-2">
          <span id="lbl-chip" class="text-xs text-muted">${t.chipLabel}</span>
          <div class="flex gap-1">
            <select
              id="sel-chip-pos"
              class="form-select"
              @change=${(e: Event) => {
                chipPosStore.set((e.currentTarget as HTMLSelectElement).value as ChipPosition);
                this.#syncViewerAndTriggerConfig();
              }}
            >
              <option id="opt-pos-tl" value="top-left">${t.posTopLeft}</option>
              <option id="opt-pos-tr" value="top-right">${t.posTopRight}</option>
              <option id="opt-pos-bl" value="bottom-left">${t.posBottomLeft}</option>
              <option id="opt-pos-br" value="bottom-right">${t.posBottomRight}</option>
            </select>
            <select
              id="sel-chip-style"
              class="form-select"
              @change=${(e: Event) => {
                chipStyleStore.set((e.currentTarget as HTMLSelectElement).value as ChipStyle);
                this.#syncViewerAndTriggerConfig();
              }}
            >
              <option id="opt-style-icon" value="icon-only">${t.styleIconOnly}</option>
              <option id="opt-style-compact" value="compact">${t.styleCompact}</option>
              <option id="opt-style-full" value="full">${t.styleFull}</option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span id="lbl-search-engine" class="text-xs text-muted">${t.searchEngineLabel}</span>
          <select
            id="sel-search-engine"
            class="form-select"
            @change=${(e: Event) => {
              searchEngineStore.set((e.currentTarget as HTMLSelectElement).value as SearchEngineId);
              this.#syncViewerAndTriggerConfig();
            }}
          >
            <option value="yandex">Yandex</option>
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="saucenao">SauceNAO</option>
          </select>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span id="lbl-gif-format" class="text-xs text-muted">${t.gifFormatLabel}</span>
          <select
            id="sel-gif-format"
            class="form-select"
            @change=${(e: Event) => {
              gifFormatStore.set((e.currentTarget as HTMLSelectElement).value as GifSaveFormat);
              this.#syncViewerAndTriggerConfig();
            }}
          >
            <option id="opt-gif-mp4" value="mp4">${t.gifFormatMp4}</option>
            <option id="opt-gif-gif" value="gif">${t.gifFormatGif}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1">
          <div id="lbl-filename" class="text-xs text-muted">${t.filenameLabel}</div>
          <input
            id="inp-filename"
            type="text"
            class="form-input font-mono w-full"
            placeholder="{original}"
            @change=${(e: Event) => {
              const val = (e.currentTarget as HTMLInputElement).value.trim() || '{original}';
              filenameTplStore.set(val);
              this.#syncViewerAndTriggerConfig();
            }}
          />
          <div id="hint-filename" class="text-xs text-muted">${t.filenameHint}</div>
        </div>

        <div class="text-xs text-muted">
          <span id="lbl-active-rules">${t.activeRules}</span>
          <span class="s-badge">${activeNames}</span>
        </div>
      </s-dock-shell>
    `;
  }

  protected override onMount(): void {
    const selPos = this.$<HTMLSelectElement>('#sel-chip-pos');
    const selStyle = this.$<HTMLSelectElement>('#sel-chip-style');
    const selEngine = this.$<HTMLSelectElement>('#sel-search-engine');
    const selGif = this.$<HTMLSelectElement>('#sel-gif-format');
    const inpFile = this.$<HTMLInputElement>('#inp-filename');

    if (selPos) selPos.value = chipPosStore.get();
    if (selStyle) selStyle.value = chipStyleStore.get();
    if (selEngine) selEngine.value = searchEngineStore.get();
    if (selGif) selGif.value = gifFormatStore.get();
    if (inpFile) inpFile.value = filenameTplStore.get();
    this.#syncViewerAndTriggerConfig();
  }

  protected override onConnect(): void {
    const shell = this.$<DockShell>('#dock');
    const swEnable = this.$<Switch>('#sw-enable');
    const swAlt = this.$<Switch>('#sw-alt');

    if (swEnable) swEnable.checked = enabledStore.get();
    if (swAlt) swAlt.checked = altDirectOpenStore.get();

    if (shell) {
      this.#dock = useDockApp(shell, {
        moduleId: 'peek',
        moduleName: PEEK_DICT[resolveLocale()].appName,
        defaultPreset: 'center-left',
        defaultShortcut: 'Alt+KeyP',
        signal: this.scope.signal,
      });
    }

    useI18n(PEEK_DICT, this.scope.signal, () => this.#syncLocaleTexts());
    this.#syncLocaleTexts();

    this.on(
      window,
      'pointermove',
      (ev) => {
        this.#mouseX = ev.clientX;
        this.#mouseY = ev.clientY;
      },
      { passive: true }
    );

    this.on(
      document,
      'pointerover',
      (ev) => {
        if (!enabledStore.get()) return;
        const target = ev.target;
        if (target === this.host || target === this.#trigger.host || target === this.#viewer.host) {
          return;
        }
        this.#mouseX = ev.clientX;
        this.#mouseY = ev.clientY;

        if (this.#rafPending) return;
        this.#rafPending = true;
        const altPressed = ev.altKey;

        requestAnimationFrame(async () => {
          this.#rafPending = false;
          const hit = await registry.resolveFromHoverTarget(target);
          if (!hit) {
            this.#trigger.scheduleDismiss();
            return;
          }

          this.#trigger.attachTo(hit.anchorEl, hit.media, this.#viewer, registry);
          if (altPressed && altDirectOpenStore.get()) {
            await this.#trigger.openCurrentMedia();
          }
        });
      },
      { passive: true }
    );

    this.on(
      window,
      'keydown',
      (ev) => {
        if (
          (ev.key === 'Alt' || ev.code === 'AltLeft' || ev.code === 'AltRight') &&
          enabledStore.get() &&
          altDirectOpenStore.get() &&
          !this.#viewer.matches(':popover-open')
        ) {
          void this.#tryOpenUnderCursor();
        }
      },
      { capture: true }
    );

    logger.success(
      `看图功能已开启，当前规则：[${registry
        .getActiveExtractors()
        .map((e) => e.id)
        .join(', ')}]，快捷键：${this.#dock?.shortcut.getLabel() ?? ''}`
    );
  }
}

mountComponent(PeekApp);
