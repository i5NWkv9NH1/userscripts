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

const VIEWPORT_PADDING = 16;
const SNAP_EDGE_MARGIN = 20;
const DRAG_THRESHOLD_PX = 6;
const DOCK_GAP_PX = 10;
const KEYBOARD_STEP_PX = 15;

const DOCKS_ATTR = 'data-sora-docks';
const DOCK_CHANGED_EVENT = 'sora:dock-changed';

interface SharedDockRect {
  id: string;
  side: SnapSide;
  top: number;
  height: number;
}

const PRESET_COORDS: Record<SnapPresetName, SnapCoordinate> = {
  'top-left': { side: 'left', yRatio: 0.04, margin: SNAP_EDGE_MARGIN },
  'top-right': { side: 'right', yRatio: 0.04, margin: SNAP_EDGE_MARGIN },
  'center-left': { side: 'left', yRatio: 0.45, margin: SNAP_EDGE_MARGIN },
  'center-right': { side: 'right', yRatio: 0.45, margin: SNAP_EDGE_MARGIN },
  'bottom-left': { side: 'left', yRatio: 0.88, margin: SNAP_EDGE_MARGIN },
  'bottom-right': { side: 'right', yRatio: 0.88, margin: SNAP_EDGE_MARGIN },
};

function readSharedDocks(): SharedDockRect[] {
  try {
    const raw = document.documentElement.getAttribute(DOCKS_ATTR);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SharedDockRect[]) : [];
  } catch {
    return [];
  }
}

function writeSharedDocks(docks: SharedDockRect[]): void {
  try {
    if (docks.length === 0) {
      document.documentElement.removeAttribute(DOCKS_ATTR);
    } else {
      document.documentElement.setAttribute(DOCKS_ATTR, JSON.stringify(docks));
    }
    document.dispatchEvent(new CustomEvent(DOCK_CHANGED_EVENT));
  } catch {}
}

function rangesOverlap(topA: number, hA: number, topB: number, hB: number): boolean {
  return topA < topB + hB + DOCK_GAP_PX && topA + hA + DOCK_GAP_PX > topB;
}

// * 同一侧出现多个脚本胶囊或面板时，自动向上或向下挪出空位，避免互相盖住
function resolveNonOverlappingTop(
  desiredTop: number,
  elHeight: number,
  side: SnapSide,
  selfId: string,
  maxTop: number
): number {
  const others = readSharedDocks()
    .filter((d) => d.id !== selfId && d.side === side)
    .sort((a, b) => a.top - b.top);

  const isFree = (top: number): boolean => {
    if (top < VIEWPORT_PADDING || top > maxTop) return false;
    return !others.some((o) => rangesOverlap(top, elHeight, o.top, o.height));
  };

  if (isFree(desiredTop)) return desiredTop;

  const candidates: number[] = [];
  for (const o of others) {
    candidates.push(o.top - elHeight - DOCK_GAP_PX);
    candidates.push(o.top + o.height + DOCK_GAP_PX);
  }

  let bestTop = desiredTop;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const clamped = Math.round(Math.min(maxTop, Math.max(VIEWPORT_PADDING, c)));
    if (isFree(clamped)) {
      const dist = Math.abs(clamped - desiredTop);
      if (dist < bestDist) {
        bestDist = dist;
        bestTop = clamped;
      }
    }
  }
  return bestTop;
}

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
  signal: AbortSignal,
  onAnnounce?: (text: string) => void
): SnapPositionController {
  let dragSessionAbort: AbortController | null = null;
  let isDragging = false;
  let lastPublished: SharedDockRect | null = null;

  const removeOwnDock = () => {
    const next = readSharedDocks().filter((d) => d.id !== moduleId);
    if (lastPublished !== null) {
      lastPublished = null;
      writeSharedDocks(next);
    }
  };

  signal.addEventListener(
    'abort',
    () => {
      dragSessionAbort?.abort();
      dragSessionAbort = null;
      removeOwnDock();
    },
    { once: true }
  );

  const hostKey = location.hostname || 'global';
  const siteStore = useStorage<SnapCoordinate>(
    `pos.${moduleId}.${hostKey}`,
    PRESET_COORDS[defaultPreset]
  );

  let trackedTargets: HTMLElement[] = [];

  const publishDock = (side: SnapSide, top: number, height: number) => {
    if (
      lastPublished &&
      lastPublished.side === side &&
      lastPublished.top === top &&
      lastPublished.height === height
    ) {
      return;
    }
    lastPublished = { id: moduleId, side, top, height };
    const others = readSharedDocks().filter((d) => d.id !== moduleId);
    others.push(lastPublished);
    writeSharedDocks(others);
  };

  const applyCoordToElement = (el: HTMLElement, coord: SnapCoordinate, resolvedTop: number) => {
    if (coord.side === 'left') {
      el.style.inset = `${resolvedTop}px auto auto ${coord.margin}px`;
      el.style.transformOrigin = 'left center';
    } else {
      el.style.inset = `${resolvedTop}px ${coord.margin}px auto auto`;
      el.style.transformOrigin = 'right center';
    }
  };

  const syncTargets = (targets?: HTMLElement[]) => {
    if (targets) trackedTargets = targets;
    if (trackedTargets.length === 0) return;

    const coord = siteStore.get();
    const visibleTarget =
      trackedTargets.find((t) => t.matches(':popover-open')) ?? trackedTargets[0];
    const rect = visibleTarget?.getBoundingClientRect();
    const activeHeight = rect && rect.height > 0 ? Math.round(rect.height) : 44;

    const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - activeHeight - VIEWPORT_PADDING);
    const desiredTop = Math.round(
      Math.min(maxTop, Math.max(VIEWPORT_PADDING, coord.yRatio * window.innerHeight))
    );
    const resolvedTop = resolveNonOverlappingTop(
      desiredTop,
      activeHeight,
      coord.side,
      moduleId,
      maxTop
    );

    for (const t of trackedTargets) {
      const tRect = t.getBoundingClientRect();
      const tHeight = tRect.height > 0 ? tRect.height : activeHeight;
      const tMaxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - tHeight - VIEWPORT_PADDING);
      const clampedTop = Math.min(tMaxTop, Math.max(VIEWPORT_PADDING, resolvedTop));
      applyCoordToElement(t, coord, clampedTop);
    }

    publishDock(coord.side, resolvedTop, activeHeight);
  };

  window.addEventListener(
    'resize',
    () => {
      requestAnimationFrame(() => syncTargets());
    },
    { signal, passive: true }
  );

  document.addEventListener(
    DOCK_CHANGED_EVENT,
    () => {
      if (!isDragging) {
        requestAnimationFrame(() => syncTargets());
      }
    },
    { signal }
  );

  const nudgeByKeyboard = (dxSide: SnapSide | null, dyPx: number) => {
    const prev = siteStore.get();
    const nextSide = dxSide ?? prev.side;
    const currentTop = prev.yRatio * window.innerHeight;
    const nextTop = Math.max(
      VIEWPORT_PADDING,
      Math.min(window.innerHeight - 60, currentTop + dyPx)
    );
    const nextRatio = Number((nextTop / Math.max(1, window.innerHeight)).toFixed(4));
    siteStore.set({ side: nextSide, yRatio: nextRatio, margin: SNAP_EDGE_MARGIN });
    syncTargets();
    onAnnounce?.(nextSide === 'left' ? 'docked left' : 'docked right');
  };

  return {
    getCoord: () => siteStore.get(),
    syncTargets,
    applyPreset(preset: SnapPresetName) {
      const next = PRESET_COORDS[preset];
      siteStore.set(next);
      syncTargets();
      onAnnounce?.(`moved ${preset}`);
    },
    bindDragHandle(handleEl, floatingTargets, onClickWithoutDrag) {
      trackedTargets = floatingTargets;
      handleEl.style.touchAction = 'none';
      handleEl.style.cursor = 'grab';
      handleEl.style.setProperty('-webkit-user-select', 'none');
      handleEl.style.userSelect = 'none';

      if (handleEl.tagName !== 'BUTTON' && !handleEl.hasAttribute('tabindex')) {
        handleEl.tabIndex = 0;
        handleEl.setAttribute('role', 'button');
      }

      handleEl.addEventListener(
        'keydown',
        (ev) => {
          if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            nudgeByKeyboard(null, -KEYBOARD_STEP_PX);
          } else if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            nudgeByKeyboard(null, KEYBOARD_STEP_PX);
          } else if (ev.key === 'ArrowLeft') {
            ev.preventDefault();
            nudgeByKeyboard('left', 0);
          } else if (ev.key === 'ArrowRight') {
            ev.preventDefault();
            nudgeByKeyboard('right', 0);
          }
        },
        { signal }
      );

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

          try {
            handleEl.setPointerCapture(downEv.pointerId);
          } catch {}

          let moved = false;
          let rafId: number | null = null;
          let pendingLeft = initialLeft;
          let pendingTop = initialTop;

          const cleanupSession = () => {
            isDragging = false;
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

          let finished = false;
          const finishPointer = (upEv: PointerEvent) => {
            if (finished) return;
            finished = true;

            const wasMoved = moved;
            cleanupSession();

            if (!wasMoved) {
              onClickWithoutDrag?.(upEv);
              return;
            }

            const centerX = pendingLeft + boxW / 2;
            const side: SnapSide = centerX < window.innerWidth / 2 ? 'left' : 'right';
            const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - boxH - VIEWPORT_PADDING);
            const resolvedTop = resolveNonOverlappingTop(
              Math.round(pendingTop),
              Math.round(boxH),
              side,
              moduleId,
              maxTop
            );
            const yRatio = Number(
              Math.max(0.02, Math.min(0.92, resolvedTop / Math.max(1, window.innerHeight))).toFixed(
                4
              )
            );

            siteStore.set({ side, yRatio, margin: SNAP_EDGE_MARGIN });
            syncTargets();
            onAnnounce?.(side === 'left' ? 'docked left' : 'docked right');
          };

          window.addEventListener(
            'pointermove',
            (moveEv) => {
              if ((moveEv.buttons & 1) === 0) {
                finishPointer(moveEv);
                return;
              }

              const dx = moveEv.clientX - startX;
              const dy = moveEv.clientY - startY;

              if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
                moved = true;
                isDragging = true;
                handleEl.style.cursor = 'grabbing';
                activeBox.style.transition = 'none';
              }

              if (moved) {
                pendingLeft = Math.max(8, Math.min(window.innerWidth - boxW - 8, initialLeft + dx));
                pendingTop = Math.max(8, Math.min(window.innerHeight - boxH - 8, initialTop + dy));

                if (rafId === null) {
                  rafId = requestAnimationFrame(() => {
                    rafId = null;
                    activeBox.style.inset = `${Math.round(pendingTop)}px auto auto ${Math.round(pendingLeft)}px`;
                  });
                }
              }
            },
            { signal: dragSignal, passive: true, capture: true }
          );

          window.addEventListener('pointerup', finishPointer, {
            signal: dragSignal,
            capture: true,
          });
          window.addEventListener('pointercancel', finishPointer, {
            signal: dragSignal,
            capture: true,
          });
        },
        { signal }
      );
    },
  };
}
