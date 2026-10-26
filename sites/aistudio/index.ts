// sites/aistudio/index.ts
import {
  BaseComponent,
  createLogger,
  customElement,
  html,
  type ShortcutController,
  type SnapPositionController,
  type SnapPresetName,
  useObserver,
  useShortcut,
  useSnapPosition,
  useStorage,
} from '@core';
import { Icons, Popover, Switch, svgIcon } from '@ui';
import { ChatExporterEngine, type ExportFormat } from './features/chat-exporter.ts';
import { DomTrimmerEngine, type TrimmerConfig } from './features/dom-trimmer.ts';
import { type LayoutGuardConfig, LayoutGuardEngine } from './features/layout-guard.ts';
import styleText from './style.css';

void Popover;
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

const collapsedStore = useStorage<boolean>('aistudio.collapsed', false);

const SNAP_PRESETS: { id: SnapPresetName; label: string }[] = [
  { id: 'top-left', label: '左上' },
  { id: 'center-left', label: '左中' },
  { id: 'bottom-left', label: '左下' },
  { id: 'top-right', label: '右上' },
  { id: 'center-right', label: '右中' },
  { id: 'bottom-right', label: '右下' },
];

@customElement('s-aistudio-app')
export class AIStudioApp extends BaseComponent {
  static readonly tagName = 's-aistudio-app' as const;
  protected readonly stylesheet = styleText;

  #lastPathname = location.pathname;
  #exporter = new ChatExporterEngine();
  #layoutGuard = new LayoutGuardEngine();
  #trimmer = new DomTrimmerEngine({
    onBeforeDetach: (turnEl) => this.#exporter.captureTurnElement(turnEl),
    onStatsChange: (st) => {
      const statEl = this.$<HTMLElement>('#trim-stats');
      const limitEl = this.$<HTMLElement>('#trim-limit');
      const orbBadge = this.$<HTMLElement>('#orb-badge');
      if (statEl) {
        statEl.textContent = `当前显示 ${st.visibleRounds} 轮问答 · 已收起 ${st.totalArchivedRounds} 轮`;
      }
      if (limitEl) {
        limitEl.textContent = `保留上限: ${st.currentLimit} 轮 (DOM隐藏 ${st.hiddenInDomRounds} / 内存归档 ${st.detachedInMemRounds})`;
      }
      if (orbBadge) {
        orbBadge.textContent = String(st.visibleRounds);
      }
    },
  });

  #snapPos!: SnapPositionController;
  #shortcut!: ShortcutController;

  #setCollapsed(collapsed: boolean): void {
    collapsedStore.set(collapsed);
    const pop = this.$<Popover>('#studio-pop');
    const orb = this.$<HTMLElement>('#studio-orb');
    if (!pop || !orb) return;

    if (collapsed) {
      if (pop.matches(':popover-open')) pop.hidePopover();
      if (!orb.matches(':popover-open')) orb.showPopover();
    } else {
      if (orb.matches(':popover-open')) orb.hidePopover();
      if (!pop.matches(':popover-open')) pop.showPopover();
    }
    requestAnimationFrame(() => this.#snapPos.syncTargets([pop, orb]));
  }

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

  protected render(): DocumentFragment {
    const tCfg = trimmerStore.get();

    return html`
      <button
        id='studio-orb'
        type='button'
        popover='manual'
        class='studio-orb select-none'
        title='按住可自由拖动磁吸，点击展开 AI Studio 助手面板'
      >
        ${svgIcon(Icons.sparkles)}
        <span>AI Studio 助手</span>
        <span id='orb-badge' class='s-badge font-mono'>0</span>
      </button>

      <s-popover
        id='studio-pop'
        popover='manual'
        @minimize=${() => this.#setCollapsed(true)}
      >
        <span slot='title' class='flex items-center gap-2'>
          ${svgIcon(Icons.sparkles)}
          <span>AI Studio 防卡顿与导出助手</span>
        </span>

        <div class='stats-card flex items-center justify-between gap-2'>
          <div>
            <div id='guard-tip' class='text-xs font-semibold'>
              <span id='trim-stats'>当前页面显示 0 条 · 已自动收起 0 条旧对话</span>
            </div>
            <div id='trim-limit' class='text-xs font-mono text-muted'>
              当前显示上限: ${tCfg.baseMaxVisible} 条
            </div>
          </div>
          <button
            type='button'
            class='s-btn'
            title='把当前网页里所有展开的长代码块一键收起'
            @click=${() => {
              const c = this.#trimmer.collapseAllCodeBlocks();
              logger.info(`已一键收起 ${c} 个代码块`);
            }}
          >
            收起全部代码块
          </button>
        </div>

        <div class='flex items-center justify-between gap-4'>
          <div>
            <div class='text-sm font-medium'>防误触离开网页保护</div>
            <div class='text-xs text-muted'>阻止误点左侧菜单中断 AI 回答 (需按住 Alt+左键才跳转)</div>
          </div>
          <s-switch
            id='sw-guard'
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ guardNavigation: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='flex items-center justify-between gap-4'>
          <div>
            <div class='text-sm font-medium'>提问输入框草稿自动防丢</div>
            <div class='text-xs text-muted'>打字时实时保存草稿，意外刷新网页后自动恢复未发送内容</div>
          </div>
          <s-switch
            id='sw-draft'
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ savePromptDraft: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='flex items-center justify-between gap-4 text-xs'>
          <span>简洁模式：隐藏网页左侧历史导航栏</span>
          <s-switch
            id='sw-hide-left'
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ hideLeftNavbar: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='flex items-center justify-between gap-4 text-xs'>
          <span>简洁模式：隐藏网页右侧模型参数栏</span>
          <s-switch
            id='sw-hide-right'
            @change=${(e: CustomEvent<boolean>) => {
              this.#updateLayoutPatch({ hideRightPanel: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='section-divider'></div>

        <div class='flex items-center justify-between gap-4'>
            <div>
                <div class='text-sm font-medium'>长对话自动防卡顿</div>
                <div class='text-xs text-muted'>对话变长时自动收起早期问答，解决打字和滚动卡顿</div>
            </div>
            <s-switch
                id='sw-trim'
                @change=${(e: CustomEvent<boolean>) => {
                  this.#updateTrimmerPatch({ enabled: e.detail });
                }}
                >
                </s-switch>
        </div>

        <div class='flex items-center justify-between gap-2 text-xs'>
            <div>
                <div>页面保留最新问答轮数</div>
                <div class='text-muted'>超出此轮数的旧问答会自动收起 (1轮=提问+回答，默认 35)</div>
            </div>
            <input
                type='number'
                min='0'
                class='num-input font-mono'
                value=${String(tCfg.baseMaxVisible)}
                @change=${(e: Event) => {
                  const raw = Number((e.currentTarget as HTMLInputElement).value);
                  const v = Number.isNaN(raw) ? 35 : Math.max(0, raw);
                  this.#updateTrimmerPatch({ baseMaxVisible: v });
                }}
            />
        </div>

        <div class='flex items-center justify-between gap-2 text-xs'>
            <div>
                <div>单次点击往回加载轮数</div>
                <div class='text-muted'>每次点击下方「往前加载旧问答」取回的问答轮数</div>
            </div>
            <input
                type='number'
                min='1'
                class='num-input font-mono'
                value=${String(tCfg.restoreStep)}
                @change=${(e: Event) => {
                  const v = Math.max(1, Number((e.currentTarget as HTMLInputElement).value) || 10);
                  this.#updateTrimmerPatch({ restoreStep: v });
                  const btn = this.$<HTMLButtonElement>('#btn-restore-step');
                  if (btn) btn.textContent = `往前加载 ${v} 轮旧问答`;
                }}
            />
        </div>

        <div class='flex gap-2'>
            <button
                id='btn-restore-step'
                type='button'
                class='s-btn flex-1'
                title='临时把早期被收起的旧问答往前多显示几轮'
                @click=${() => {
                  this.#trimmer.restoreStep(trimmerStore.get());
                }}
                >
                往前加载 ${tCfg.restoreStep} 轮旧问答
            </button>
            <button
                type='button'
                class='s-btn flex-1'
                title='将刚刚临时展开的旧问答重新按设定轮数收起，恢复最佳流畅度'
                @click=${() => {
                  this.#trimmer.resetToBaseVisible(trimmerStore.get());
                }}
            >
                重新按设定收起旧问答
            </button>
        </div>

        <div class='section-divider'></div>

        <div class='flex items-center justify-between gap-2'>
          <div>
            <div class='text-sm font-medium'>导出当前整场聊天记录</div>
            <div class='text-xs text-muted'>自动附带账号、模型、思考等级、工具开关与系统指令</div>
          </div>
          <select
            id='sel-fmt'
            class='fmt-select'
            @change=${(e: Event) => {
              const fmt = (e.currentTarget as HTMLSelectElement).value as ExportFormat;
              exportCfgStore.set({ ...exportCfgStore.get(), format: fmt });
            }}
          >
            <option value='md'>Markdown (.md)</option>
            <option value='json'>JSON (.json)</option>
          </select>
        </div>

        <div class='flex items-center justify-between text-xs'>
          <span>导出 Gemini 的思考过程 (Thoughts 折叠块)</span>
          <s-switch
            id='sw-thoughts'
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), includeThoughts: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='flex items-center justify-between text-xs'>
          <span>导出 System Instructions 系统指令</span>
          <s-switch
            id='sw-system'
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), includeSystem: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='flex items-center justify-between text-xs'>
          <div>
            <div>导出聊天中上传的图片 (转 Base64 内嵌)</div>
            <div class='text-muted'>开启后图片直接内嵌进文档，离线也能查看</div>
          </div>
          <s-switch
            id='sw-images'
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), includeImagesBase64: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='flex items-center justify-between text-xs'>
          <div>
            <div>清除聊天正文里的 Emoji 表情图标</div>
            <div class='text-muted'>自动过滤提问与回答里的表情符号，但不会改动代码块内容</div>
          </div>
          <s-switch
            id='sw-emoji'
            @change=${(e: CustomEvent<boolean>) => {
              exportCfgStore.set({ ...exportCfgStore.get(), stripEmojis: e.detail });
            }}
          ></s-switch>
        </div>

        <div class='flex gap-2'>
          <button
            type='button'
            class='s-btn flex-1'
            title='直接导出当前脚本已自动记录的对话内容，无需等待网页滚动'
            @click=${() => {
              this.#exporter.exportSnapshot(exportCfgStore.get());
            }}
          >
            ${svgIcon(Icons.download)}
            <span>导出已记录对话</span>
          </button>
          <button
            id='btn-deep-scan'
            type='button'
            class='s-btn s-btn-primary flex-1'
            title='自动将网页滚回最顶部并逐屏扫描到底部，确保历史长对话 100% 完整导出'
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
                btn.textContent = '滚动全页完整导出';
              }
            }}
          >
            滚动全页完整导出
          </button>
        </div>

        <div class='section-divider'></div>

        <div class='flex flex-col gap-1 text-xs'>
            <div class='flex items-center justify-between gap-2'>
              <span class='text-muted'>
                面板快捷键：<span id='studio-key-label' class='s-badge font-mono'>Alt + A</span>
              </span>

              <button
                type='button'
                class='s-btn'
                @click=${(e: MouseEvent) => {
                  const btn = e.currentTarget as HTMLButtonElement;
                  const hintEl = this.$<HTMLElement>('#studio-key-hint');
                  btn.textContent = '请按键 (Esc取消)...';
                  this.#shortcut.startRecording((_combo, conflict, cancelled) => {
                    if (cancelled) {
                      btn.textContent = '修改快捷键';
                      if (hintEl)
                        hintEl.textContent =
                          '建议使用 Opt/Alt + 字母，避免覆盖 Cmd/Ctrl + S 保存热键';
                      return;
                    }
                    if (_combo === null && conflict.reason) {
                      if (hintEl) hintEl.textContent = conflict.reason;
                      return;
                    }
                    btn.textContent = '修改快捷键';
                    const lbl = this.$<HTMLElement>('#studio-key-label');
                    if (lbl) lbl.textContent = this.#shortcut.getLabel();
                    if (hintEl) {
                      hintEl.textContent =
                        conflict.reason ?? '快捷键已更新！建议使用 Opt/Alt + 字母组合';
                    }
                  });
                }}
              >
                ${svgIcon(Icons.keyboard)}
                <span>修改快捷键</span>
              </button>
            </div>

            <div id='studio-key-hint' class='text-muted'>
              建议使用 Opt/Alt + 字母，避免覆盖系统 Cmd/Ctrl + S 等默认热键
            </div>
        </div>


        <div class='flex flex-col gap-1'>
          <div class='text-xs text-muted'>面板与胶囊停靠位置（也支持按住标题栏或胶囊自由拖动磁吸）</div>
          <div class='pos-grid'>
            ${SNAP_PRESETS.map(
              (p) => html`
                <button
                  type='button'
                  class='pos-btn'
                  @click=${() => this.#snapPos.applyPreset(p.id)}
                >
                  ${p.label}
                </button>
              `
            )}
          </div>
        </div>
      </s-popover>
    `;
  }

  protected override onMount(): void {
    const pop = this.$<Popover>('#studio-pop');
    const orb = this.$<HTMLElement>('#studio-orb');
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
    const keyLbl = this.$<HTMLElement>('#studio-key-label');
    const guardTip = this.$<HTMLElement>('#guard-tip');

    this.#snapPos = useSnapPosition('aistudio', 'bottom-right', this.scope.signal);
    this.#shortcut = useShortcut(
      'aistudio',
      'AI Studio 助手',
      'Alt+KeyA',
      () => this.#setCollapsed(!collapsedStore.get()),
      this.scope.signal
    );

    if (keyLbl) keyLbl.textContent = this.#shortcut.getLabel();

    const tCfg = trimmerStore.get();
    const lCfg = layoutGuardStore.get();
    const eCfg = exportCfgStore.get();

    // ? 修复：页面刷新挂载时立即将存储中的 baseMaxVisible 同步进裁剪引擎
    this.#trimmer.syncConfig(tCfg);

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

    this.#layoutGuard.syncConfig(lCfg);
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

    if (pop && orb) {
      if (pop.headerEl) {
        this.#snapPos.bindDragHandle(pop.headerEl, [pop, orb]);
      }
      this.#snapPos.bindDragHandle(orb, [pop, orb], () => this.#setCollapsed(false));
    }

    this.#setCollapsed(collapsedStore.get());

    useObserver(
      document.body,
      () => {
        if (location.pathname !== this.#lastPathname) {
          this.#lastPathname = location.pathname;
          this.#exporter.resetSession();
          this.#trimmer.resetSession(trimmerStore.get());
          logger.info('检测到切换新对话，已自动重置裁剪与导出缓存');
        }
        if (exportCfgStore.get().enabled) {
          this.#exporter.captureVisibleTurns();
        }
        this.#trimmer.optimize(trimmerStore.get());
        this.#layoutGuard.checkGeneratingAndClearDraft();
        this.#layoutGuard.tryRestoreDraftOnce();
      },
      this.scope.signal
    );

    setTimeout(() => {
      this.#exporter.captureVisibleTurns();
      this.#trimmer.optimize(trimmerStore.get());
      if (this.#layoutGuard.tryRestoreDraftOnce()) {
        logger.success('已自动为您恢复上次未发送的 Prompt 草稿！');
      }
    }, 1200);

    logger.success(`AI Studio 助手已就绪！快捷键：${this.#shortcut.getLabel()}`);
  }
}

if (!document.querySelector(AIStudioApp.tagName)) {
  document.documentElement.appendChild(new AIStudioApp());
}
