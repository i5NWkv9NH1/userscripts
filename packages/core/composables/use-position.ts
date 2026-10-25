import { useStorage } from './use-storage.ts';

export type SnapSide = 'left' | 'right';

export interface SnapCoordinate {
  readonly side: SnapSide;
  readonly yRatio: number;
  readonly margin: number;
}

export type SnapPresetName =
  | 'top-left'
  | 'top-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-right';

const PRESET_COORDS: Record<SnapPresetName, SnapCoordinate> = {
  'top-left': { side: 'left', yRatio: 0.04, margin: 20 },
  'top-right': { side: 'right', yRatio: 0.04, margin: 20 },
  'center-left': { side: 'left', yRatio: 0.45, margin: 20 },
  'center-right': { side: 'right', yRatio: 0.45, margin: 20 },
  'bottom-left': { side: 'left', yRatio: 0.88, margin: 20 },
  'bottom-right': { side: 'right', yRatio: 0.88, margin: 20 },
};

export interface SnapPositionController {
  getCoord(): SnapCoordinate;
  applyPreset(preset: SnapPresetName): void;
  bindDragHandle(
    handleEl: HTMLElement,
    FloatingTargets: HTMLElement[],
    onClickWithoutDrag?: (ev: PointerEvent) => void
  ): void;
  syncTargets(targets: HTMLElement[]): void;
}

export function useSnapPosition(
  moduleId: string,
  defaultPreset: SnapPresetName,
  signal: AbortSignal
): SnapPositionController {
  const hostKey = location.hostname || 'global';
  const siteStore = useStorage<SnapCoordinate>(
    `pos.${moduleId}.${hostKey}`,
    PRESET_COORDS[defaultPreset]
  );

  const applyCoordToElement = (el: HTMLElement, coord: SnapCoordinate) => {
    const rect = el.getBoundingClientRect();
    const elHeight = rect.height || 44;
    const maxTop = Math.max(16, window.innerHeight - elHeight - 16);
    const topPx = Math.round(Math.min(maxTop, Math.max(16, coord.yRatio * window.innerHeight)));

    if (coord.side === 'left') {
      el.style.inset = `${topPx}px auto auto ${coord.margin}px`;
      el.style.transformOrigin = 'left center';
    } else {
      el.style.inset = `${topPx}px ${coord.margin}px auto auto`;
      el.style.transformOrigin = 'right center';
    }
  };

  let trackedTargets: HTMLElement[] = [];

  const syncTargets = (targets: HTMLElement[] = trackedTargets) => {
    trackedTargets = targets;
    const coord = siteStore.get();
    for (const t of targets) {
      applyCoordToElement(t, coord);
    }
  };

  window.addEventListener(
    'resize',
    () => {
      requestAnimationFrame(() => syncTargets());
    },
    { signal, passive: true }
  );

  return {
    getCoord: () => siteStore.get(),
    syncTargets,
    applyPreset(preset: SnapPresetName) {
      const next = PRESET_COORDS[preset];
      siteStore.set(next);
      syncTargets();
    },
    bindDragHandle(handleEl, targets, onClickWithoutDrag) {
      trackedTargets = targets;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;
      let moved = false;
      let dragging = false;
      let activeBox: HTMLElement | null = null;

      handleEl.style.touchAction = 'none';
      handleEl.style.cursor = 'grab';

      const resetDragState = () => {
        dragging = false;
        handleEl.style.cursor = 'grab';
        if (activeBox) activeBox.style.transition = '';
      };

      handleEl.addEventListener(
        'pointerdown',
        (ev) => {
          if (ev.button !== 0) return;
          const composedTarget = ev.composedPath()[0];
          const interactiveEl =
            composedTarget instanceof Element
              ? composedTarget.closest('button, input, select, s-switch')
              : null;

          // ! 关键修复 1：
          // # 只有点在「非手柄自身的内部子按钮」上才跳过，点在胶囊内部的文字/图标上正常放行！
          if (interactiveEl && interactiveEl !== handleEl) {
            return;
          }

          activeBox = targets.find((t) => t.matches(':popover-open')) ?? targets[0] ?? null;
          if (!activeBox) return;

          const rect = activeBox.getBoundingClientRect();
          startX = ev.clientX;
          startY = ev.clientY;
          initialLeft = rect.left;
          initialTop = rect.top;
          moved = false;
          dragging = true;
        },
        { signal }
      );

      // ! 关键修复 2
      // # 将 pointermove 与 pointerup 挂载到 window，并校验 ev.buttons，彻底杜绝松手丢失导致胶囊粘鼠标
      window.addEventListener(
        'pointermove',
        (ev) => {
          if (!dragging || !activeBox) return;
          if ((ev.buttons & 1) === 0) {
            resetDragState();
            return;
          }

          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          if (!moved && Math.hypot(dx, dy) > 6) {
            moved = true;
            handleEl.style.cursor = 'grabbing';
            activeBox.style.transition = 'none';
          }

          if (moved) {
            const rect = activeBox.getBoundingClientRect();
            const nextLeft = Math.max(
              8,
              Math.min(window.innerWidth - rect.width - 8, initialLeft + dx)
            );
            const nextTop = Math.max(
              8,
              Math.min(window.innerHeight - rect.height - 8, initialTop + dy)
            );
            activeBox.style.inset = `${Math.round(nextTop)}px auto auto ${Math.round(nextLeft)}px`;
          }
        },
        { signal, passive: true }
      );

      const finishPointer = (ev: PointerEvent) => {
        if (!dragging) return;
        const wasMoved = moved;
        resetDragState();

        if (!wasMoved) {
          onClickWithoutDrag?.(ev);
          return;
        }

        if (activeBox) {
          const rect = activeBox.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const side: SnapSide = centerX < window.innerWidth / 2 ? 'left' : 'right';
          const yRatio = Number(
            Math.max(0.02, Math.min(0.92, rect.top / Math.max(1, window.innerHeight))).toFixed(4)
          );

          siteStore.set({ side, yRatio, margin: 20 });
          syncTargets();
        }
      };

      window.addEventListener('pointerup', finishPointer, { signal });
      window.addEventListener('pointercancel', finishPointer, { signal });
    },
  };
}
