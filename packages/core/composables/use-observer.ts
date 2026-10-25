export function useObserver(
  target: Node,
  callback: (addedElements: HTMLElement[]) => void,
  signal: AbortSignal,
  options: MutationObserverInit = { childList: true, subtree: true }
): void {
  if (signal.aborted) return;

  const pending = new Set<HTMLElement>();
  let rafId: number | null = null;

  const flush = () => {
    rafId = null;
    if (signal.aborted || pending.size === 0) return;
    const batch = Array.from(pending);
    pending.clear();
    callback(batch);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          pending.add(node as HTMLElement);
        }
      }
    }
    if (pending.size > 0 && rafId === null) {
      rafId = requestAnimationFrame(flush);
    }
  });

  observer.observe(target, options);

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
