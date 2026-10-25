import {
  BaseComponent,
  createLogger,
  customElement,
  html,
  type ShortcutController,
  type SnapPositionController,
  type SnapPresetName,
  useShortcut,
  useSnapPosition,
  useStorage,
} from '@core';
import { Icons, Popover, Switch, svgIcon } from '@ui';
import styleText from './style.css';

void Popover;
void Switch;

const logger = createLogger('Playground');
const persistedCounter = useStorage<number>('playground.count', 0);
const persistEnabledStore = useStorage<boolean>('playground.persistEnabled', true);
const collapsedStore = useStorage<boolean>('playground.collapsed', false);

const SNAP_PRESETS: { id: SnapPresetName; label: string }[] = [
  { id: 'top-left', label: '左上' },
  { id: 'center-left', label: '左中' },
  { id: 'bottom-left', label: '左下' },
  { id: 'top-right', label: '右上' },
  { id: 'center-right', label: '右中' },
  { id: 'bottom-right', label: '右下' },
];

@customElement('s-playground-app')
export class PlaygroundApp extends BaseComponent {
  static readonly tagName = 's-playground-app' as const;
  protected readonly stylesheet = styleText;

  #memoryCount = 0;
  #snapPos!: SnapPositionController;
  #shortcut!: ShortcutController;

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
    if (fabCountEl) fabCountEl.textContent = String(this.#memoryCount);
    if (diskStatusEl) {
      diskStatusEl.textContent = persistEnabledStore.get()
        ? `已存盘: ${persistedCounter.get()}`
        : '不存盘 (刷新归零)';
    }
  }

  #updateCount(nextVal: number): void {
    this.#memoryCount = nextVal;
    if (persistEnabledStore.get()) {
      persistedCounter.set(nextVal);
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
    requestAnimationFrame(() => this.#snapPos.syncTargets([pop, fab]));
  }

  #showConflict(reason: string | null): void {
    const el = this.$<HTMLElement>('#conflict-msg');
    if (!el) return;
    if (reason) {
      el.textContent = reason;
      el.setAttribute('data-show', 'true');
    } else {
      el.removeAttribute('data-show');
    }
  }

  protected render(): DocumentFragment {
    return html`
      <button
        id="fab"
        type="button"
        popover="manual"
        class="fab-capsule select-none"
        title="按住可自由拖动磁吸，点击展开沙盒面板"
      >
        ${svgIcon(Icons.sparkles)}
        <span>沙盒</span>
        <span id="fab-count" class="s-badge font-mono">0</span>
      </button>

      <s-popover
        id="pop"
        popover="manual"
        @minimize=${() => this.#setCollapsed(true)}
      >
        <span slot="title" class="flex items-center gap-2">
          ${svgIcon(Icons.sparkles)}
          <span>Sora 2026 极速沙盒</span>
        </span>

        <div class="count-box flex items-center justify-between">
          <div>
            <div class="text-xs text-muted">按住标题栏或胶囊可自由拖拽磁吸</div>
            <div id="disk-status" class="text-xs font-mono text-muted">
              已存盘: 0
            </div>
          </div>
          <span id="count-val" class="count-num font-mono">0</span>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-sm font-medium">跨刷新记忆数据</div>
            <div class="text-xs text-muted">关闭时清空存档，刷新自动归零</div>
          </div>
          <s-switch
            id="persist-switch"
            @change=${(e: CustomEvent<boolean>) => {
              const enabled = e.detail;
              persistEnabledStore.set(enabled);
              persistedCounter.set(enabled ? this.#memoryCount : 0);
              this.#syncCounterUI(false);
            }}
          ></s-switch>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between text-xs text-muted">
            <span>面板呼出快捷键</span>
            <span id="shortcut-badge" class="s-badge font-mono">Alt + S</span>
          </div>
          <div class="flex gap-2">
            <select
              id="shortcut-select"
              class="shortcut-select flex-1"
              @change=${(e: Event) => {
                const val = (e.currentTarget as HTMLSelectElement).value;
                const conflict = this.#shortcut.setCombo(val);
                const badge = this.$<HTMLElement>('#shortcut-badge');
                if (badge) badge.textContent = this.#shortcut.getLabel();
                this.#showConflict(conflict.reason);
              }}
            >
              <option value="Alt+KeyS">预设：Alt + S</option>
              <option value="Alt+KeyQ">预设：Alt + Q</option>
              <option value="Alt+KeyW">预设：Alt + W</option>
              <option value="Alt+Backquote">预设：Alt + \`</option>
              <option value="Alt+KeyL">测试冲突：Alt + L (与看图冲突)</option>
            </select>
            <button
              id="record-btn"
              type="button"
              class="s-btn"
              @click=${(e: MouseEvent) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.textContent = '请按键...';
                this.#shortcut.startRecording((_combo, conflict) => {
                  btn.textContent = '录制按键';
                  const badge = this.$<HTMLElement>('#shortcut-badge');
                  if (badge) badge.textContent = this.#shortcut.getLabel();
                  this.#showConflict(conflict.reason);
                });
              }}
            >
              ${svgIcon(Icons.keyboard)}
              <span>录制按键</span>
            </button>
          </div>
          <div id="conflict-msg" class="conflict-banner"></div>
        </div>

        <div class="flex flex-col gap-1">
          <div class="text-xs text-muted">
            快捷磁吸方位（也支持直接鼠标拖拽边缘吸附）
          </div>
          <div class="pos-grid">
            ${SNAP_PRESETS.map(
              (p) => html`
                <button
                  type="button"
                  class="pos-btn"
                  @click=${() => this.#snapPos.applyPreset(p.id)}
                >
                  ${p.label}
                </button>
              `
            )}
          </div>
        </div>

        <div class="flex gap-2">
          <button
            type="button"
            class="s-btn s-btn-primary flex-1"
            @click=${() => this.#updateCount(this.#memoryCount + 1)}
          >
            计数 +1
          </button>
          <button
            type="button"
            class="s-btn flex-1"
            @click=${() => this.#updateCount(0)}
          >
            重置为 0
          </button>
          <button
            type="button"
            class="s-btn s-btn-danger"
            title="从 DOM 物理移除组件"
            @click=${() => this.remove()}
          >
            ${svgIcon(Icons.trash)}
          </button>
        </div>
      </s-popover>
    `;
  }

  protected override onMount(): void {
    const pop = this.$<Popover>('#pop');
    const fab = this.$<HTMLElement>('#fab');
    const switchEl = this.$<Switch>('#persist-switch');
    const badgeEl = this.$<HTMLElement>('#shortcut-badge');
    const selectEl = this.$<HTMLSelectElement>('#shortcut-select');

    this.#snapPos = useSnapPosition('playground', 'bottom-right', this.scope.signal);
    this.#shortcut = useShortcut(
      'playground',
      'Playground 沙盒',
      'Alt+KeyS',
      () => this.#setCollapsed(!collapsedStore.get()),
      this.scope.signal
    );

    if (badgeEl) badgeEl.textContent = this.#shortcut.getLabel();
    if (selectEl) selectEl.value = this.#shortcut.getCombo();

    if (pop && fab) {
      if (pop.headerEl) {
        this.#snapPos.bindDragHandle(pop.headerEl, [pop, fab]);
      }
      this.#snapPos.bindDragHandle(fab, [pop, fab], () => this.#setCollapsed(false));
    }

    const isPersistOn = persistEnabledStore.get();
    this.#memoryCount = isPersistOn ? persistedCounter.get() : 0;
    if (switchEl) switchEl.checked = isPersistOn;

    this.#syncCounterUI(false);
    this.#setCollapsed(collapsedStore.get());
    logger.success(`沙盒已就绪！当前快捷键：${this.#shortcut.getLabel()}`);
  }
}

if (!document.querySelector(PlaygroundApp.tagName)) {
  document.documentElement.appendChild(new PlaygroundApp());
}
