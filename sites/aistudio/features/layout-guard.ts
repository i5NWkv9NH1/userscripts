import { css, getAltKeyDisplayName, resolveLocale, useStorage } from '@core';

export interface LayoutGuardConfig {
  readonly guardNavigation: boolean;
  readonly savePromptDraft: boolean;
  readonly hideLeftNavbar: boolean;
  readonly hideRightPanel: boolean;
}

const promptDraftStore = useStorage<string>('aistudio.promptDraftText', '');

export class LayoutGuard {
  readonly #sheet = new CSSStyleSheet();
  #sheetMounted = false;
  #guardEnabled = true;
  #draftEnabled = true;
  #restoredOnce = false;

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

  // * 只在页面刚加载且 AI 没在回答时恢复一次草稿
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
    // * 1. 输入框打字时实时保存草稿
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

    const clearDraftAfterSubmit = () => {
      promptDraftStore.set('');
    };

    // * 2. 遵循 ime-safe-enter-submit：中文/日文输入法选词按回车时绝不误清草稿
    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key !== 'Enter' || ev.shiftKey) return;
        if (ev.isComposing || ev.keyCode === 229) return;
        const target = ev.target;
        if (target instanceof HTMLTextAreaElement && target.closest('ms-prompt-box')) {
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

    // * 3. 只拦侧边栏里会跳转离开当前对话的链接，放行折叠按钮、聊天正文链接与输入框
    document.addEventListener(
      'click',
      (ev) => {
        if (!this.#guardEnabled || ev.button !== 0 || ev.altKey || ev.metaKey || ev.ctrlKey) {
          return;
        }

        const path = ev.composedPath();
        for (const node of path) {
          if (!(node instanceof Element)) continue;
          if (node.closest('ms-chat-turn')) return;

          const isAnchor = node.tagName === 'A' && node.hasAttribute('href');
          if (isAnchor && node.closest('ms-navbar-v2, ms-omnibar')) {
            const anchor = node as HTMLAnchorElement;
            if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

            ev.preventDefault();
            ev.stopImmediatePropagation();
            const isEn = resolveLocale() === 'en';
            const mod = getAltKeyDisplayName();
            onNotice(
              isEn
                ? `Navigation blocked. Hold ${mod} + Click to jump.`
                : `已拦住误触跳转，按住「${mod} + 左键」即可跳转`
            );
            return;
          }
        }
      },
      { signal, capture: true }
    );

    // * 4. 仅在 AI 正在输出或输入框还有未发送草稿时提醒，正常看历史记录允许直接关标签页
    window.addEventListener(
      'beforeunload',
      (ev) => {
        if (!this.#guardEnabled) return;
        const isGenerating = document.querySelector('ms-run-button .spin') !== null;
        const hasDraft = promptDraftStore.get().trim().length > 0;
        if (isGenerating || hasDraft) {
          ev.preventDefault();
          ev.returnValue = '';
        }
      },
      { signal, capture: true }
    );
  }
}
