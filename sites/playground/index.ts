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
  Icons,
  Popover,
  Switch,
  svgIcon,
  type DockPosition,
} from '@ui';

void Popover;
void Switch;

const logger = createLogger('Playground');
const persistedCounter = useStorage<number>('playground.count', 0);
const persistEnabledStore = useStorage<boolean>('playground.persistEnabled', true);
const positionStore = useStorage<DockPosition>('playground.position', 'bottom-right');
const collapsedStore = useStorage<boolean>('playground.collapsed', false);

const POSITIONS: { id: DockPosition; label: string }[] = [
  { id: 'top-left', label: '左上' },
  { id: 'top-right', label: '右上' },
  { id: 'bottom-left', label: '左下' },
  { id: 'bottom-right', label: '右下' },
];

@customElement('s-playground-app')
export class PlaygroundApp extends BaseComponent {
  static readonly tagName = 's-playground-app' as const;
  #memoryCount = 0;

  protected readonly stylesheet = css`
    :host {
      display: contents;
    }

    .fab-capsule {
      position: fixed;
      inset: auto 24px 24px auto;
      margin: 0;
      padding: 8px 14px;
      border: 1px solid var(--s-border);
      border-radius: 999px;
      background: var(--s-bg);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      opacity: 0;
      transform: scale(0.85);
      transition:
        opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1),
        transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
        inset 0.3s cubic-bezier(0.22, 1, 0.36, 1),
        display 0.24s allow-discrete,
        overlay 0.24s allow-discrete;

      &:hover {
        transform: scale(1.05);
        background: var(--s-surface-hover);
      }
    }

    .fab-capsule:popover-open {
      opacity: 1;
      transform: scale(1);
    }

    @starting-style {
      .fab-capsule:popover-open {
        opacity: 0;
        transform: scale(0.8);
      }
    }

    .fab-capsule[data-pos='bottom-right'] { inset: auto 24px 24px auto; }
    .fab-capsule[data-pos='bottom-left'] { inset: auto auto 24px 24px; }
    .fab-capsule[data-pos='top-right'] { inset: 24px 24px auto auto; }
    .fab-capsule[data-pos='top-left'] { inset: 24px auto auto 24px; }

    .count-box {
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--s-surface);
      border: 1px solid var(--s-border);
    }

    .count-num {
      font-size: 20px;
      font-weight: 700;
      color: var(--s-accent);
      display: inline-block;
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .count-num[data-bump='true'] {
      transform: scale(1.28);
    }

    .pos-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    .pos-btn {
      padding: 5px 8px;
      border-radius: 7px;
      border: 1px solid var(--s-border);
      background: var(--s-surface);
      color: var(--s-text-muted);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;

      &[data-active='true'] {
        background: var(--s-accent);
        color: #ffffff;
        border-color: transparent;
      }
    }
  `;

  #syncCounterUI(bump = false): void {
    const countEl = this.$<HTMLElement>('#count-val');
    const fabCountEl = this.$<HTMLElement>('#fab-count');
    const diskStatusEl = this.$<HTMLElement>('#disk-status');

    if (countEl) {
      countEl.textContent = String(this.#memoryCount);
      if (bump) {
        countEl.setAttribute('data-bump', 'true');
        setTimeout(() => countEl.removeAttribute('data-bump'), 180);
      }
    }
    if (fabCountEl) {
      fabCountEl.textContent = String(this.#memoryCount);
    }
    if (diskStatusEl) {
      const enabled = persistEnabledStore.get();
      diskStatusEl.textContent = enabled
        ? `已存盘: ${persistedCounter.get()}`
        : '不存盘 (刷新归零)';
    }
  }

  #updateCount(nextVal: number): void {
    this.#memoryCount = nextVal;
    if (persistEnabledStore.get()) {
      persistedCounter.set(nextVal);
      logger.info(`计数已更新并写入持久化存储：${nextVal}`);
    } else {
      logger.debug(`计数仅在内存更新：${nextVal}（跨刷新记忆已关闭）`);
    }
    this.#syncCounterUI(true);
  }

  #setCollapsed(collapsed: boolean): void {
    collapsedStore.set(collapsed);
    const pop = this.$<Popover>('#pop');
    const fab = this.$<HTMLElement>('#fab');
    if (!pop || !fab) return;

    if (collapsed) {
      if (pop.matches(':popover-open')) pop.hidePopover();
      if (!fab.matches(':popover-open')) fab.showPopover();
    } else {
      if (fab.matches(':popover-open')) fab.hidePopover();
      if (!pop.matches(':popover-open')) pop.showPopover();
    }
  }

  #applyPosition(pos: DockPosition): void {
    positionStore.set(pos);
    const pop = this.$<Popover>('#pop');
    const fab = this.$<HTMLElement>('#fab');
    if (pop) pop.setPosition(pos);
    if (fab) fab.setAttribute('data-pos', pos);

    const buttons = this.shadowRoot.querySelectorAll<HTMLButtonElement>('.pos-btn');
    for (const btn of buttons) {
      btn.setAttribute('data-active', String(btn.dataset.pos === pos));
    }
  }

  protected render(): DocumentFragment {
    return html`
      <button
        id='fab'
        type='button'
        popover='manual'
        class='fab-capsule'
        title='点击展开 Sora 2026 极速沙盒 (Alt + S)'
        @click=${() => this.#setCollapsed(false)}
      >
        ${svgIcon(Icons.sparkles)}
        <span>沙盒</span>
        <span id='fab-count' class='s-badge font-mono'>0</span>
      </button>

      <s-popover
        id='pop'
        popover='manual'
        @minimize=${() => this.#setCollapsed(true)}
      >
        <span slot='title' class='flex items-center gap-2'>
          ${svgIcon(Icons.sparkles)}
          <span>Sora 2026 极速沙盒</span>
        </span>

        <div class='count-box flex items-center justify-between'>
          <div>
            <div class='text-xs text-muted'>当前计数状态</div>
            <div id='disk-status' class='text-xs font-mono text-muted'>已存盘: 0</div>
          </div>
          <span id='count-val' class='count-num font-mono'>0</span>
        </div>

        <div class='flex items-center justify-between gap-4'>
          <div>
            <div class='text-sm font-medium'>跨刷新记忆数据</div>
            <div class='text-xs text-muted'>关闭时清空存盘，刷新网页自动归零</div>
          </div>
          <s-switch
            id='persist-switch'
            @change=${(e: CustomEvent<boolean>) => {
              const enabled = e.detail;
              persistEnabledStore.set(enabled);
              if (enabled) {
                persistedCounter.set(this.#memoryCount);
                logger.success(`已开启跨刷新记忆，当前值 ${this.#memoryCount} 已存盘`);
              } else {
                persistedCounter.set(0);
                logger.warn('已关闭跨刷新记忆并清除旧存档，下次刷新将归零');
              }
              this.#syncCounterUI(false);
            }}
          ></s-switch>
        </div>

        <div class='flex flex-col gap-1'>
          <div class='text-xs text-muted'>卡片与收纳胶囊停靠方位</div>
          <div class='pos-grid'>
            ${POSITIONS.map(
              (p) => html`
                <button
                  type='button'
                  class='pos-btn'
                  data-pos=${p.id}
                  @click=${() => this.#applyPosition(p.id)}
                >
                  ${p.label}
                </button>
              `
            )}
          </div>
        </div>

        <div class='flex gap-2'>
          <button
            type='button'
            class='s-btn s-btn-primary flex-1'
            @click=${() => this.#updateCount(this.#memoryCount + 1)}
          >
            计数 +1
          </button>
          <button
            type='button'
            class='s-btn flex-1'
            @click=${() => this.#updateCount(0)}
          >
            重置为 0
          </button>
          <button
            type='button'
            class='s-btn s-btn-danger'
            title='从 DOM 物理移除组件并触发 AbortController 一键释放'
            @click=${() => this.remove()}
          >
            ${svgIcon(Icons.trash)}
          </button>
        </div>
      </s-popover>
    `;
  }

  protected override onMount(): void {
    const endTimer = logger.time('PlaygroundApp 挂载');
    const switchEl = this.$<Switch>('#persist-switch');

    const isPersistOn = persistEnabledStore.get();
    this.#memoryCount = isPersistOn ? persistedCounter.get() : 0;

    if (switchEl) switchEl.checked = isPersistOn;
    this.#syncCounterUI(false);
    this.#applyPosition(positionStore.get());
    this.#setCollapsed(collapsedStore.get());

    persistedCounter.subscribe(
      (val) => {
        if (persistEnabledStore.get()) {
          this.#memoryCount = val;
          this.#syncCounterUI(false);
        }
      },
      this.scope.signal,
      false
    );

    useHotkey(
      {
        'Alt+KeyS': () => this.#setCollapsed(!collapsedStore.get()),
      },
      this.scope.signal
    );

    endTimer();
    logger.success('沙盒组件已就绪！点击右上角「—」可收纳为胶囊，按「Alt + S」快速切换');
  }

  protected override onDestroy(): void {
    logger.warn('Playground 已从 DOM 物理移除，全部监听已通过 AbortSignal 释放');
  }
}

if (!document.querySelector(PlaygroundApp.tagName)) {
  document.documentElement.appendChild(new PlaygroundApp());
}
