import { css, useStorage } from '@core';

export interface LayoutGuardConfig {
  readonly guardNavigation: boolean;
  readonly savePromptDraft: boolean;
  readonly hideLeftNavbar: boolean;
  readonly hideRightPanel: boolean;
}

const promptDraftStore = useStorage<string>('aistudio.promptDraftText', '');

export class LayoutGuardEngine {
  readonly #sheet = new CSSStyleSheet();
  #sheetMounted = false;
  #guardEnabled = true;
  #draftEnabled = true;

  syncConfig(cfg: LayoutGuardConfig): void {
    this.#guardEnabled = cfg.guardNavigation;
    this.#draftEnabled = cfg.savePromptDraft;

    if (!this.#sheetMounted) {
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.#sheet];
      this.#sheetMounted = true;
    }

    const rules: string[] = [];

    if (cfg.hideLeftNavbar) {
      rules.push(css`
        ms-navbar-v2,
        .makersuite-layout > .sidebar-overlay {
          display: none !important;
        }
      `);
    }

    if (cfg.hideRightPanel) {
      rules.push(css`
        ms-right-side-panel,
        ms-paid-api-key-callout,
        ms-global-banner {
          display: none !important;
        }
        ms-chunk-editor .chunk-editor-main {
          max-width: 100% !important;
          flex: 1 1 100% !important;
        }
      `);
    }

    this.#sheet.replaceSync(rules.join('\n'));
  }

  getSavedDraft(): string {
    return promptDraftStore.get();
  }

  #restoredOnce = false;

  // 仅在页面初次加载、且未处于 AI 生成态（无 .spin）时恢复一次草稿
  tryRestoreDraftOnce(): boolean {
    if (this.#restoredOnce || !this.#draftEnabled) return false;
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'ms-prompt-box textarea, textarea[formcontrolname="promptText"]'
    );
    if (!textarea) return false;

    this.#restoredOnce = true;
    const isGenerating = document.querySelector('ms-run-button .spin') !== null;
    if (isGenerating || textarea.value.trim().length > 0) {
      return false;
    }

    const draft = promptDraftStore.get();
    if (!draft) return false;

    textarea.value = draft;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  // 当检测到 ms-run-button 出现 .spin（正在生成 Stop 状态）且输入框为空时，立即清空草稿存储
  checkGeneratingAndClearDraft(): void {
    const isGenerating = document.querySelector('ms-run-button .spin') !== null;
    if (!isGenerating) return;

    const textarea = document.querySelector<HTMLTextAreaElement>(
      'ms-prompt-box textarea, textarea[formcontrolname="promptText"]'
    );
    if (textarea && textarea.value.trim() === '') {
      promptDraftStore.set('');
    }
  }

  bindGuards(signal: AbortSignal, onNotice: (msg: string) => void): void {
    // 1. 监听 Prompt 输入框人工打字，实时备份草稿
    document.addEventListener(
      'input',
      (ev) => {
        if (!this.#draftEnabled || !ev.isTrusted) return;
        const target = ev.target;
        if (
          target instanceof HTMLTextAreaElement &&
          (target.getAttribute('formcontrolname') === 'promptText' ||
            Boolean(target.closest('ms-prompt-box')))
        ) {
          promptDraftStore.set(target.value);
        }
      },
      { signal, passive: true }
    );

    // 2. 监听回车发送（Enter / Cmd+Enter / Ctrl+Enter）与点击 Run 按钮，发送后立即清空草稿
    const clearDraftAfterSubmit = () => {
      promptDraftStore.set('');
    };

    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key !== 'Enter') return;
        const target = ev.target;
        if (
          target instanceof HTMLTextAreaElement &&
          target.closest('ms-prompt-box') &&
          !ev.shiftKey
        ) {
          clearDraftAfterSubmit();
        }
      },
      { signal, capture: true }
    );

    document.addEventListener(
      'pointerdown',
      (ev) => {
        const target = ev.target;
        if (
          target instanceof Element &&
          target.closest('ms-run-button') &&
          !document.querySelector('ms-run-button .spin')
        ) {
          clearDraftAfterSubmit();
        }
      },
      { signal, capture: true }
    );

    // 3. 拦截误触点击侧边栏链接跳转
    document.addEventListener(
      'click',
      (ev) => {
        if (!this.#guardEnabled || ev.button !== 0 || ev.altKey || ev.metaKey || ev.ctrlKey) {
          return;
        }

        const path = ev.composedPath();
        for (const node of path) {
          if (!(node instanceof Element)) continue;

          const isAnchor = node.tagName === 'A' && node.hasAttribute('href');
          const inNavbar = Boolean(node.closest('ms-navbar-v2, ms-omnibar'));

          if (isAnchor || inNavbar) {
            const anchor = node as HTMLAnchorElement;
            if (isAnchor && anchor.target === '_blank') return;
            if (isAnchor && anchor.hasAttribute('download')) return;

            ev.preventDefault();
            ev.stopImmediatePropagation();
            onNotice('已拦截误触跳转！如需跳转请按住「Alt + 左键」点击');
            return;
          }
        }
      },
      { signal, capture: true }
    );

    // 4. 拦截触控板误滑后退或关闭标签页
    window.addEventListener(
      'beforeunload',
      (ev) => {
        if (!this.#guardEnabled) return;
        const hasTurns = document.querySelector('ms-chat-turn') !== null;
        const hasDraft = promptDraftStore.get().trim().length > 0;
        if (hasTurns || hasDraft) {
          ev.preventDefault();
          ev.returnValue = '';
        }
      },
      { signal, capture: true }
    );
  }
}
