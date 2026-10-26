export interface TrimmerConfig {
  enabled: boolean;
  baseMaxVisible: number;
  maxCache: number;
  restoreStep: number;
}

export interface TrimmerStats {
  readonly visibleRounds: number;
  readonly hiddenInDomRounds: number;
  readonly detachedInMemRounds: number;
  readonly totalArchivedRounds: number;
  readonly currentLimit: number;
}

export class DomTrimmerEngine {
  #maxVisibleRounds = 35;
  #hiddenTurns: HTMLElement[] = [];
  #detachedRounds: HTMLElement[][] = [];
  #chatContainer: ParentNode | null = null;
  readonly #onBeforeDetach?: (turnEl: HTMLElement) => void;
  readonly #onStatsChange?: (stats: TrimmerStats) => void;

  constructor(options?: {
    onBeforeDetach?: (turnEl: HTMLElement) => void;
    onStatsChange?: (stats: TrimmerStats) => void;
  }) {
    this.#onBeforeDetach = options?.onBeforeDetach;
    this.#onStatsChange = options?.onStatsChange;
  }

  getTurns(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('ms-chat-turn'));
  }

  // 将散装的 ms-chat-turn（提问图片、提问文字、AI思考、AI回答）按「完整问答回合」智能聚合
  getConversationRounds(): HTMLElement[][] {
    const turns = this.getTurns();
    const rounds: HTMLElement[][] = [];
    let currentRound: HTMLElement[] = [];
    let lastRole: 'User' | 'Model' = 'User';

    for (const turn of turns) {
      const isUser =
        turn.querySelector('[data-turn-role="User"], .user, .user-prompt-container') !== null;
      const role: 'User' | 'Model' = isUser ? 'User' : 'Model';

      // 当遇到新的 User 提问，且上一轮已经进入过 Model 回答阶段，则开启新的一轮问答
      if (role === 'User' && lastRole === 'Model' && currentRound.length > 0) {
        rounds.push(currentRound);
        currentRound = [turn];
      } else {
        currentRound.push(turn);
      }
      lastRole = role;
    }

    if (currentRound.length > 0) {
      rounds.push(currentRound);
    }
    return rounds;
  }

  getStats(): TrimmerStats {
    const rounds = this.getConversationRounds();
    let visibleRounds = 0;
    let hiddenInDomRounds = 0;

    for (const r of rounds) {
      const isHidden = r[0]?.style.display === 'none';
      if (isHidden) hiddenInDomRounds++;
      else visibleRounds++;
    }

    const detachedInMemRounds = this.#detachedRounds.length;
    return {
      visibleRounds,
      hiddenInDomRounds,
      detachedInMemRounds,
      totalArchivedRounds: hiddenInDomRounds + detachedInMemRounds,
      currentLimit: this.#maxVisibleRounds,
    };
  }

  syncConfig(cfg: TrimmerConfig): void {
    this.#maxVisibleRounds = Math.max(0, cfg.baseMaxVisible);
    if (cfg.enabled) {
      this.optimize(cfg);
    } else {
      this.restoreAll();
    }
  }

  optimize(cfg: TrimmerConfig): void {
    if (!cfg.enabled) {
      this.#emitStats();
      return;
    }

    const rounds = this.getConversationRounds();
    if (rounds.length <= this.#maxVisibleRounds) {
      for (const r of rounds) {
        for (const el of r) {
          if (el.style.display === 'none') el.style.display = '';
        }
      }
      this.#hiddenTurns = [];
      this.#emitStats();
      return;
    }

    const toHideRoundCount = rounds.length - this.#maxVisibleRounds;
    const hiddenRoundsList = rounds.slice(0, toHideRoundCount);
    const visibleRoundsList = rounds.slice(toHideRoundCount);

    this.#hiddenTurns = [];
    for (const r of hiddenRoundsList) {
      for (const el of r) {
        if (!this.#chatContainer && el.parentNode) {
          this.#chatContainer = el.parentNode;
        }
        if (el.style.display !== 'none') el.style.display = 'none';
        this.#hiddenTurns.push(el);
      }
    }

    for (const r of visibleRoundsList) {
      for (const el of r) {
        if (el.style.display === 'none') el.style.display = '';
      }
    }

    if (hiddenRoundsList.length > cfg.maxCache) {
      const excessRounds = hiddenRoundsList.length - cfg.maxCache;
      const roundsToPurge = hiddenRoundsList.slice(0, excessRounds);

      for (const r of roundsToPurge) {
        for (const el of r) {
          if (!this.#chatContainer && el.parentNode) {
            this.#chatContainer = el.parentNode;
          }
          this.#onBeforeDetach?.(el);
          el.remove();
        }
        this.#detachedRounds.push(r);
      }
    }

    this.#emitStats();
  }

  restoreStep(cfg: TrimmerConfig): number {
    const st = this.getStats();
    if (st.totalArchivedRounds === 0) {
      this.#emitStats();
      return 0;
    }

    const step = Math.min(cfg.restoreStep, st.totalArchivedRounds);
    this.#maxVisibleRounds += step;

    const currentRounds = this.getConversationRounds();
    const neededFromDetached = this.#maxVisibleRounds - currentRounds.length;

    if (neededFromDetached > 0 && this.#detachedRounds.length > 0) {
      const count = Math.min(neededFromDetached, this.#detachedRounds.length);
      const roundsToReattach = this.#detachedRounds.splice(-count);
      const firstTurn = this.getTurns()[0] ?? null;
      const container =
        firstTurn?.parentNode ??
        this.#chatContainer ??
        document.querySelector('.chat-view-container, .chat-container');

      if (container) {
        const frag = document.createDocumentFragment();
        for (const r of roundsToReattach) {
          for (const el of r) {
            el.style.display = '';
            frag.appendChild(el);
          }
        }
        if (firstTurn && firstTurn.parentNode === container) {
          container.insertBefore(frag, firstTurn);
        } else {
          container.appendChild(frag);
        }
      }
    }

    this.optimize(cfg);
    return step;
  }

  restoreAll(): void {
    const firstTurn = this.getTurns()[0] ?? null;
    const container =
      firstTurn?.parentNode ??
      this.#chatContainer ??
      document.querySelector('.chat-view-container, .chat-container');

    if (this.#detachedRounds.length > 0 && container) {
      const frag = document.createDocumentFragment();
      for (const r of this.#detachedRounds) {
        for (const el of r) {
          el.style.display = '';
          frag.appendChild(el);
        }
      }
      if (firstTurn && firstTurn.parentNode === container) {
        container.insertBefore(frag, firstTurn);
      } else {
        container.appendChild(frag);
      }
      this.#detachedRounds = [];
    }

    for (const el of this.getTurns()) {
      if (el.style.display === 'none') el.style.display = '';
    }
    this.#hiddenTurns = [];
    this.#maxVisibleRounds = this.getConversationRounds().length || this.#maxVisibleRounds;
    this.#emitStats();
  }

  resetToBaseVisible(cfg: TrimmerConfig): void {
    this.#maxVisibleRounds = Math.max(0, cfg.baseMaxVisible);
    this.optimize(cfg);
  }

  collapseAllCodeBlocks(): number {
    const spans = document.querySelectorAll<HTMLElement>(
      'ms-code-block button[data-test-id="expand-icon-button"] span'
    );
    let collapsed = 0;
    for (const span of spans) {
      if (span.textContent?.trim() === 'expand_less') {
        const btn = span.closest<HTMLButtonElement>('button');
        if (btn) {
          btn.click();
          collapsed++;
        }
      }
    }
    return collapsed;
  }

  resetSession(cfg: TrimmerConfig): void {
    this.#hiddenTurns = [];
    this.#detachedRounds = [];
    this.#chatContainer = null;
    this.#maxVisibleRounds = Math.max(0, cfg.baseMaxVisible);
    this.#emitStats();
  }

  #emitStats(): void {
    this.#onStatsChange?.(this.getStats());
  }
}
