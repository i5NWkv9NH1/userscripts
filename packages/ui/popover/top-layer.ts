// * 兼容 Firefox 和 Safari：不支持 overlay 或离散 display 过渡时，用 data-closing 播完离场动画再关闭弹层
let supportsDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto')) && canTransitionDisplay();
}

export function showTopLayerPopover(el: HTMLElement): void {
  if (!el.hasAttribute('popover')) {
    el.setAttribute('popover', 'manual');
  }
  el.removeAttribute('data-closing');
  if (!el.matches(':popover-open')) {
    el.showPopover();
  }
}

export async function closeTopLayerPopover(el: HTMLElement): Promise<void> {
  if (!el.matches(':popover-open')) return;

  if (!supportsTopLayerExit()) {
    el.setAttribute('data-closing', '');
    const animations = el.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 400)),
      ]);
    }
    if (!el.hasAttribute('data-closing')) return;
    el.removeAttribute('data-closing');
  }

  if (el.matches(':popover-open')) {
    el.hidePopover();
  }
}
