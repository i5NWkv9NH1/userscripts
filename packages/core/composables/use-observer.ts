// packages/core/composables/use-observer.ts
export function useObserver(
  target: Node,
  callback: (addedElements: HTMLElement[]) => void,
  signal: AbortSignal,
  options?: MutationObserverInit
): void {
  if (signal.aborted) return;

  const pending = new Set<HTMLElement>();
  let rafId: number | null = null;

  const flush = () => {
    rafId = null;
    if (signal.aborted || pending.size === 0) return;
    const batch = Array.from(pending).filter((el) => el.isConnected);
    pending.clear();
    if (batch.length > 0) {
      callback(batch);
    }
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) {
          pending.add(node);
        }
      }
    }
    if (pending.size > 0 && rafId === null) {
      rafId = requestAnimationFrame(flush);
    }
  });

  observer.observe(target, {
    childList: true,
    subtree: true,
    ...options,
  });

  signal.addEventListener(
    'abort',
    () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      pending.clear();
    },
    { once: true }
  );
}
