// sites/sora-lens/index.ts
import {
    BaseComponent,
    createLogger,
    css,
    customElement,
    html,
    useHotkey,
    useStorage,
} from '@core';
import {
    ExtractorRegistry,
    LensTrigger,
    LensViewer,
} from '@preview';
import {
    Icons,
    Popover,
    Switch,
    svgIcon,
} from '@ui';
import { universalExtractor } from './extractors/universal.ts';
import { xExtractor } from './extractors/x.ts';

void Popover;
void Switch;

const logger = createLogger('SoraLens');
const enabledStore = useStorage<boolean>('lens.enabled', true);
const altDirectOpenStore = useStorage<boolean>('lens.altDirectOpen', false);
const panelOpenStore = useStorage<boolean>('lens.panelOpen', false);

const registry = new ExtractorRegistry().register(
  xExtractor,
  universalExtractor
);

@customElement('s-lens-controller')
export class SoraLensController extends BaseComponent {
  static readonly tagName = 's-lens-controller' as const;

  #viewer = new LensViewer();
  #trigger = new LensTrigger();
  #rafPending = false;

  protected readonly stylesheet = css`
    :host {
      display: contents;
    }

    .lens-orb {
      position: fixed;
      inset: auto auto 24px 24px;
      margin: 0;
      padding: 7px 12px;
      border-radius: 999px;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), background 0.15s;

      &:hover {
        transform: scale(1.06);
        background: var(--s-surface-hover);
      }
    }
  `;

  #toggleSettingsPanel(open?: boolean): void {
    const pop = this.$<Popover>('#settings-pop');
    const orb = this.$<HTMLElement>('#lens-orb');
    if (!pop || !orb) return;

    const nextState = open ?? !pop.matches(':popover-open');
    panelOpenStore.set(nextState);

    if (nextState) {
      if (orb.matches(':popover-open')) orb.hidePopover();
      pop.setPosition('bottom-left');
      if (!pop.matches(':popover-open')) pop.showPopover();
    } else {
      if (pop.matches(':popover-open')) pop.hidePopover();
      if (!orb.matches(':popover-open')) orb.showPopover();
    }
  }

  protected render(): DocumentFragment {
    const activeNames = registry
      .getActiveExtractors()
      .map((e) => e.name)
      .join(' / ');

    return html`
      <button
        id='lens-orb'
        type='button'
        popover='manual'
        class='lens-orb'
        title='点击展开 Sora Lens 看图引擎控制台 (Alt + L)'
        @click=${() => this.#toggleSettingsPanel(true)}
      >
        ${svgIcon(Icons.lens)}
        <span>Sora Lens</span>
      </button>

      <s-popover
        id='settings-pop'
        popover='manual'
        data-pos='bottom-left'
        @minimize=${() => this.#toggleSettingsPanel(false)}
      >
        <span slot='title' class='flex items-center gap-2'>
          ${svgIcon(Icons.lens)}
          <span>Sora Lens 引擎控制台</span>
        </span>

        <div class='flex items-center justify-between gap-4'>
          <div>
            <div class='text-sm font-medium'>启用悬停原图嗅探</div>
            <div class='text-xs text-muted'>移入图片右上角弹出无损原图胶囊</div>
          </div>
          <s-switch
            id='sw-enable'
            @change=${(e: CustomEvent<boolean>) => {
              enabledStore.set(e.detail);
              if (!e.detail) this.#trigger.dismissImmediate();
            }}
          ></s-switch>
        </div>

        <div class='flex items-center justify-between gap-4'>
          <div>
            <div class='text-sm font-medium'>按住 Alt 键悬停直开灯箱</div>
            <div class='text-xs text-muted'>无需点击胶囊，悬停瞬间秒开原图</div>
          </div>
          <s-switch
            id='sw-alt'
            @change=${(e: CustomEvent<boolean>) => altDirectOpenStore.set(e.detail)}
          ></s-switch>
        </div>

        <div class='text-xs text-muted'>
          当前激活提取器：<span class='s-badge'>${activeNames}</span>
        </div>
        <div class='text-xs text-muted'>
          快捷键：灯箱内按「← / → / ↑ / ↓」切换上下张图片
        </div>
      </s-popover>
    `;
  }

  protected override onMount(): void {
    const swEnable = this.$<Switch>('#sw-enable');
    const swAlt = this.$<Switch>('#sw-alt');

    enabledStore.subscribe((v) => {
      if (swEnable) swEnable.checked = v;
    }, this.scope.signal);

    altDirectOpenStore.subscribe((v) => {
      if (swAlt) swAlt.checked = v;
    }, this.scope.signal);

    this.#toggleSettingsPanel(panelOpenStore.get());

    this.on(
      document,
      'pointerover',
      (ev) => {
        if (!enabledStore.get() || this.#rafPending) return;
        const target = ev.target;
        if (target === this || target === this.#trigger || target === this.#viewer) {
          return;
        }

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

    useHotkey(
      {
        'Alt+KeyL': () => this.#toggleSettingsPanel(),
      },
      this.scope.signal
    );

    logger.success(
      `看图引擎已启动！当前匹配提取器：[${registry.getActiveExtractors().map((e) => e.id).join(', ')}]`
    );
  }
}

if (!document.querySelector(SoraLensController.tagName)) {
  document.documentElement.appendChild(new SoraLensController());
}
