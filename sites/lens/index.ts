// sites/sora-lens/index.ts
import {
  BaseComponent,
  createLogger,
  customElement,
  html,
  type ShortcutController,
  type SnapPositionController,
  useShortcut,
  useSnapPosition,
  useStorage,
} from '@core';
import {
  type ChipPosition,
  type ChipStyle,
  ExtractorRegistry,
  LensTrigger,
  LensViewer,
} from '@preview';
import { Icons, Popover, Switch, svgIcon } from '@ui';
import { universalExtractor } from './extractors/universal.ts';
import { xExtractor } from './extractors/x.ts';
import styleText from './style.css';

void Popover;
void Switch;

const logger = createLogger('SoraLens');
const enabledStore = useStorage<boolean>('lens.enabled', true);
const altDirectOpenStore = useStorage<boolean>('lens.altDirectOpen', true);
const panelOpenStore = useStorage<boolean>('lens.panelOpen', false);
const chipPosStore = useStorage<ChipPosition>('lens.chipPos', 'top-right');
const chipStyleStore = useStorage<ChipStyle>('lens.chipStyle', 'full');
const filenameTplStore = useStorage<string>('lens.filenameTpl', '{site}-{name}-{w}x{h}');

const registry = new ExtractorRegistry().register(xExtractor, universalExtractor);

@customElement('s-lens-controller')
export class SoraLensController extends BaseComponent {
  static readonly tagName = 's-lens-controller' as const;
  protected readonly stylesheet = styleText;

  #viewer = new LensViewer();
  #trigger = new LensTrigger();
  #snapPos!: SnapPositionController;
  #shortcut!: ShortcutController;
  #rafPending = false;
  // * #lastHoverTarget: EventTarget | null = null;
  // # 替换为鼠标坐标记录：
  #mouseX = 0;
  #mouseY = 0;

  #toggleSettingsPanel(open?: boolean): void {
    const pop = this.$<Popover>('#settings-pop');
    const orb = this.$<HTMLElement>('#lens-orb');
    if (!pop || !orb) return;

    const nextState = open ?? !pop.matches(':popover-open');
    panelOpenStore.set(nextState);

    if (nextState) {
      if (orb.matches(':popover-open')) orb.hidePopover();
      if (!pop.matches(':popover-open')) pop.showPopover();
    } else {
      if (pop.matches(':popover-open')) pop.hidePopover();
      if (!orb.matches(':popover-open')) orb.showPopover();
    }
    requestAnimationFrame(() => this.#snapPos.syncTargets([pop, orb]));
  }

  #syncTriggerConfig(): void {
    this.#trigger.configure(chipPosStore.get(), chipStyleStore.get());
    this.#viewer.setFilenameTemplate(filenameTplStore.get());
  }

  async #tryOpenUnderCursor(): Promise<void> {
    if (this.#trigger.hasActiveTarget) {
      await this.#trigger.openCurrentMedia();
      return;
    }
    const elements = document.elementsFromPoint(this.#mouseX, this.#mouseY);
    for (const el of elements) {
      if (el === this || el === this.#trigger || el === this.#viewer) continue;
      const hit = await registry.resolveFromHoverTarget(el);
      if (hit) {
        this.#trigger.attachTo(hit.anchorEl, hit.media, this.#viewer, registry);
        await this.#trigger.openCurrentMedia();
        return;
      }
    }
  }

  protected render(): DocumentFragment {
    const activeNames = registry
      .getActiveExtractors()
      .map((e) => e.name)
      .join(' / ');

    return html`
      <button
        id="lens-orb"
        type="button"
        popover="manual"
        class="lens-orb select-none"
        title="按住可自由拖动磁吸，点击展开 Sora Lens 控制台"
      >
        ${svgIcon(Icons.lens)}
        <span>Sora Lens</span>
      </button>

      <s-popover
        id="settings-pop"
        popover="manual"
        @minimize=${() => this.#toggleSettingsPanel(false)}
      >
        <span slot="title" class="flex items-center gap-2">
          ${svgIcon(Icons.lens)}
          <span>Sora Lens 引擎控制台</span>
        </span>

        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-sm font-medium">启用悬停原图嗅探</div>
            <div class="text-xs text-muted">
              含推文原图与 X / 知乎 / GH 高清头像
            </div>
          </div>
          <s-switch
            id="sw-enable"
            @change=${(e: CustomEvent<boolean>) => {
              enabledStore.set(e.detail);
              if (!e.detail) this.#trigger.dismissImmediate();
            }}
          ></s-switch>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-sm font-medium">Alt 键直开无损灯箱</div>
            <div class="text-xs text-muted">
              悬停图片时点按或按住 Alt 瞬间弹窗
            </div>
          </div>
          <s-switch
            id="sw-alt"
            @change=${(e: CustomEvent<boolean>) => altDirectOpenStore.set(e.detail)}
          ></s-switch>
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-muted">图片悬浮标位置与样式</span>
          <div class="flex gap-1">
            <select
              id="sel-chip-pos"
              class="form-select"
              @change=${(e: Event) => {
                chipPosStore.set((e.currentTarget as HTMLSelectElement).value as ChipPosition);
                this.#syncTriggerConfig();
              }}
            >
              <option value="top-right">右上角</option>
              <option value="top-left">左上角</option>
              <option value="bottom-right">右下角</option>
              <option value="bottom-left">左下角</option>
            </select>
            <select
              id="sel-chip-style"
              class="form-select"
              @change=${(e: Event) => {
                chipStyleStore.set((e.currentTarget as HTMLSelectElement).value as ChipStyle);
                this.#syncTriggerConfig();
              }}
            >
              <option value="icon-only">仅图标 (极简)</option>
              <option value="compact">图标 + 标签</option>
              <option value="full">完整工具条</option>
            </select>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <div class="text-xs text-muted">
            原图保存命名规则（支持
            <span class="font-mono">{site} {name} {w} {h} {date}</span>）
          </div>
          <input
            id="inp-filename"
            type="text"
            class="form-input font-mono w-full"
            placeholder="{site}-{name}-{w}x{h}"
            @change=${(e: Event) => {
              filenameTplStore.set((e.currentTarget as HTMLInputElement).value);
              this.#syncTriggerConfig();
            }}
          />
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-muted">
            面板快捷键：<span id="lens-key-label" class="s-badge font-mono"
              >Alt + L</span
            >
          </span>
          <button
            type="button"
            class="s-btn"
            @click=${(e: MouseEvent) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.textContent = '请按键...';
              this.#shortcut.startRecording(() => {
                btn.textContent = '修改快捷键';
                const lbl = this.$<HTMLElement>('#lens-key-label');
                if (lbl) lbl.textContent = this.#shortcut.getLabel();
              });
            }}
          >
            ${svgIcon(Icons.keyboard)}
            <span>修改快捷键</span>
          </button>
        </div>

        <div class="text-xs text-muted">
          已激活：<span class="s-badge">${activeNames}</span>
        </div>
      </s-popover>
    `;
  }

  protected override onMount(): void {
    const pop = this.$<Popover>('#settings-pop');
    const orb = this.$<HTMLElement>('#lens-orb');
    const swEnable = this.$<Switch>('#sw-enable');
    const swAlt = this.$<Switch>('#sw-alt');
    const selPos = this.$<HTMLSelectElement>('#sel-chip-pos');
    const selStyle = this.$<HTMLSelectElement>('#sel-chip-style');
    const inpFile = this.$<HTMLInputElement>('#inp-filename');
    const keyLbl = this.$<HTMLElement>('#lens-key-label');

    this.#snapPos = useSnapPosition('sora-lens', 'bottom-left', this.scope.signal);
    this.#shortcut = useShortcut(
      'sora-lens',
      'Sora Lens 看图引擎',
      'Alt+KeyL',
      () => this.#toggleSettingsPanel(),
      this.scope.signal
    );

    if (keyLbl) keyLbl.textContent = this.#shortcut.getLabel();
    if (selPos) selPos.value = chipPosStore.get();
    if (selStyle) selStyle.value = chipStyleStore.get();
    if (inpFile) inpFile.value = filenameTplStore.get();
    this.#syncTriggerConfig();

    if (pop && orb) {
      if (pop.headerEl) {
        this.#snapPos.bindDragHandle(pop.headerEl, [pop, orb]);
      }
      this.#snapPos.bindDragHandle(orb, [pop, orb], () => this.#toggleSettingsPanel(true));
    }

    enabledStore.subscribe((v) => {
      if (swEnable) swEnable.checked = v;
    }, this.scope.signal);

    altDirectOpenStore.subscribe((v) => {
      if (swAlt) swAlt.checked = v;
    }, this.scope.signal);

    this.#toggleSettingsPanel(panelOpenStore.get());

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
        if (target === this || target === this.#trigger || target === this.#viewer) {
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
      `看图引擎已就绪！激活规则：[${registry
        .getActiveExtractors()
        .map((e) => e.id)
        .join(', ')}]，快捷键：${this.#shortcut.getLabel()}`
    );
  }
}

if (!document.querySelector(SoraLensController.tagName)) {
  document.documentElement.appendChild(new SoraLensController());
}
