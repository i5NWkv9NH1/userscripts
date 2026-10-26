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

const VIEWPORT_PADDING = 8;
const SNAP_EDGE_MARGIN = 20;
const DRAG_THRESHOLD_PX = 6;

const PRESET_COORDS: Record<SnapPresetName, SnapCoordinate> = {
  'top-left': { side: 'left', yRatio: 0.04, margin: SNAP_EDGE_MARGIN },
  'top-right': { side: 'right', yRatio: 0.04, margin: SNAP_EDGE_MARGIN },
  'center-left': { side: 'left', yRatio: 0.45, margin: SNAP_EDGE_MARGIN },
  'center-right': { side: 'right', yRatio: 0.45, margin: SNAP_EDGE_MARGIN },
  'bottom-left': { side: 'left', yRatio: 0.88, margin: SNAP_EDGE_MARGIN },
  'bottom-right': { side: 'right', yRatio: 0.88, margin: SNAP_EDGE_MARGIN },
};

export interface SnapPositionController {
  getCoord(): SnapCoordinate;
  applyPreset(preset: SnapPresetName): void;
  bindDragHandle(
    handleEl: HTMLElement,
    floatingTargets: HTMLElement[],
    onClickWithoutDrag?: (ev: PointerEvent) => void
  ): void;
  syncTargets(targets?: HTMLElement[]): void;
}

export function useSnapPosition(
  moduleId: string,
  defaultPreset: SnapPresetName,
  signal: AbortSignal
): SnapPositionController {
  // # DeepSeek 修改
  let dragSessionAbort: AbortController | null = null;

  signal.addEventListener(
    'abort',
    () => {
      dragSessionAbort?.abort();
      dragSessionAbort = null;
    },
    { once: true }
  );

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

  const syncTargets = (targets?: HTMLElement[]) => {
    if (targets) trackedTargets = targets;
    const coord = siteStore.get();
    for (const t of trackedTargets) {
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
    bindDragHandle(handleEl, floatingTargets, onClickWithoutDrag) {
      trackedTargets = floatingTargets;
      handleEl.style.touchAction = 'none';
      handleEl.style.cursor = 'grab';

      // # DeepSeek 建议，移到顶部，bindDragHandle 里只引用这个共享变量。
      // let dragSessionAbort: AbortController | null = null;

      // * 这段每次调 bindDragHandle 都会往同一个 signal 上再挂一个监听器。功能上没问题（都做同一件事），但多次调用会累积。如果想彻底干净，把这段也挪到 useSnapPosition 函数顶层、return 之前，和 resize 监听放一起。不改也不影响正确性，只是个小泄漏
      // signal.addEventListener(
      //   'abort',
      //   () => {
      //     dragSessionAbort?.abort();
      //     dragSessionAbort = null;
      //   },
      //   { once: true }
      // );

      handleEl.addEventListener(
        'pointerdown',
        (downEv) => {
          if (!downEv.isPrimary || downEv.button !== 0) return;
          const composedTarget = downEv.composedPath()[0];
          const interactiveEl =
            composedTarget instanceof Element
              ? composedTarget.closest('button, input, select, s-switch')
              : null;

          if (interactiveEl && interactiveEl !== handleEl) {
            return;
          }

          const activeBox =
            trackedTargets.find((t) => t.matches(':popover-open')) ?? trackedTargets[0] ?? null;
          if (!activeBox) return;

          dragSessionAbort?.abort();
          dragSessionAbort = new AbortController();
          const dragSignal = dragSessionAbort.signal;

          const rect = activeBox.getBoundingClientRect();
          const startX = downEv.clientX;
          const startY = downEv.clientY;
          const initialLeft = rect.left;
          const initialTop = rect.top;
          const boxW = rect.width;
          const boxH = rect.height;

          // # DeepSeek 修复
          // * pointerdown 里 const boxH = rect.height; 之后加
          try {
            handleEl.setPointerCapture(downEv.pointerId);
          } catch {}

          let moved = false;
          let rafId: number | null = null;
          let pendingLeft = initialLeft;
          let pendingTop = initialTop;

          // # DeepSeek 修改
          // * cleanupSession 里 handleEl.style.cursor = 'grab'; 之前加
          const cleanupSession = () => {
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }

            try {
              if (handleEl.hasPointerCapture(downEv.pointerId)) {
                handleEl.releasePointerCapture(downEv.pointerId);
              }
            } catch {}

            handleEl.style.cursor = 'grab';
            activeBox.style.transition = '';
            dragSessionAbort?.abort();
            dragSessionAbort = null;
          };

          // # DeekSeep 修改
          // * 在 finishPointer 定义之前加一行 let finished = false;，函数体第一行加守卫：
          // * 因为改完后 finishPointer 会从 pointermove 和 pointerup 两个入口被调用，必须保证吸附只跑一次。
          let finished = false;
          // * 把 finishPointer 整段挪到 pointermove 之前
          const finishPointer = (upEv: PointerEvent) => {
            if (finished) return;
            finished = true;

            const wasMoved = moved;
            cleanupSession();

            if (!wasMoved) {
              onClickWithoutDrag?.(upEv);
              return;
            }

            // const finalRect = activeBox.getBoundingClientRect();
            // const centerX = finalRect.left + finalRect.width / 2;
            // const side: SnapSide = centerX < window.innerWidth / 2 ? 'left' : 'right';
            // const yRatio = Number(
            //   Math.max(
            //     0.02,
            //     Math.min(0.92, finalRect.top / Math.max(1, window.innerHeight))
            //   ).toFixed(4)
            // );

            // # DeepSeek 修改
            // * 用 pending 值代替 getBoundingClientRect，避免 rAF 未 flush 的旧 rect
            const centerX = pendingLeft + boxW / 2;
            const side: SnapSide = centerX < window.innerWidth / 2 ? 'left' : 'right';
            const yRatio = Number(
              Math.max(0.02, Math.min(0.92, pendingTop / Math.max(1, window.innerHeight))).toFixed(
                4
              )
            );

            siteStore.set({ side, yRatio, margin: SNAP_EDGE_MARGIN });
            syncTargets();
          };

          window.addEventListener(
            'pointermove',
            (moveEv) => {
              // # DeepSeek 修改
              // ? pointermove 的 buttons === 0 分支改为调用 finishPointer
              // * 这是核心修复。浏览器经常在真正的 pointerup 之前先派发一个 buttons 已为 0 的 pointermove
              // * 原来的 cleanupSession() 会 abort 掉 dragSignal，把 pointerup 监听器一起移走，导致 finishPointer 永远不执行
              // * 改成直接调 finishPointer，不管哪个先到，吸附都会触发

              // if ((moveEv.buttons & 1) === 0) {
              //   cleanupSession();
              //   return;
              // }
              if ((moveEv.buttons & 1) === 0) {
                finishPointer(moveEv);
                return;
              }

              const dx = moveEv.clientX - startX;
              const dy = moveEv.clientY - startY;

              if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
                moved = true;
                handleEl.style.cursor = 'grabbing';
                activeBox.style.transition = 'none';
              }

              if (moved) {
                pendingLeft = Math.max(
                  VIEWPORT_PADDING,
                  Math.min(window.innerWidth - boxW - VIEWPORT_PADDING, initialLeft + dx)
                );
                pendingTop = Math.max(
                  VIEWPORT_PADDING,
                  Math.min(window.innerHeight - boxH - VIEWPORT_PADDING, initialTop + dy)
                );

                if (rafId === null) {
                  rafId = requestAnimationFrame(() => {
                    rafId = null;
                    activeBox.style.inset = `${Math.round(pendingTop)}px auto auto ${Math.round(pendingLeft)}px`;
                  });
                }
              }
            },
            { signal: dragSignal, passive: true }
          );

          window.addEventListener('pointerup', finishPointer, { signal: dragSignal });
          window.addEventListener('pointercancel', finishPointer, { signal: dragSignal });
        },
        { signal }
      );
    },
  };
}
