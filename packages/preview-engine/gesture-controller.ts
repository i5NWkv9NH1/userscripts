import { Scope } from '@core';

export interface TransformState {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  flipX: 1 | -1;
}

export class GestureController implements Disposable {
  readonly #scope = new Scope();
  readonly #stage: HTMLElement;
  readonly #target: HTMLElement;
  readonly #onChange?: (state: Readonly<TransformState>) => void;

  #state: TransformState = { x: 0, y: 0, scale: 1, rotate: 0, flipX: 1 };
  #dragging = false;
  #startX = 0;
  #startY = 0;
  #rafId: number | null = null;

  constructor(
    stage: HTMLElement,
    target: HTMLElement,
    onChange?: (state: Readonly<TransformState>) => void
  ) {
    this.#stage = stage;
    this.#target = target;
    this.#onChange = onChange;
    this.#bindEvents();
  }

  get state(): Readonly<TransformState> {
    return this.#state;
  }

  reset(): void {
    this.#state = { x: 0, y: 0, scale: 1, rotate: 0, flipX: 1 };
    this.#scheduleRender();
  }

  zoomBy(factor: number): void {
    const next = Math.min(20, Math.max(0.15, this.#state.scale * factor));
    this.#state.scale = Number(next.toFixed(3));
    this.#scheduleRender();
  }

  rotateBy(deg: number): void {
    this.#state.rotate += deg;
    this.#scheduleRender();
  }

  toggleFlipX(): void {
    this.#state.flipX = this.#state.flipX === 1 ? -1 : 1;
    this.#scheduleRender();
  }

  #bindEvents(): void {
    this.#scope.on(
      this.#stage,
      'wheel',
      (ev) => {
        ev.preventDefault();
        const delta = ev.deltaY < 0 ? 1.15 : 0.87;
        const prevScale = this.#state.scale;
        const nextScale = Math.min(20, Math.max(0.15, prevScale * delta));
        const ratio = nextScale / prevScale;

        const rect = this.#stage.getBoundingClientRect();
        const cx = ev.clientX - (rect.left + rect.width / 2);
        const cy = ev.clientY - (rect.top + rect.height / 2);

        this.#state.x = cx - (cx - this.#state.x) * ratio;
        this.#state.y = cy - (cy - this.#state.y) * ratio;
        this.#state.scale = Number(nextScale.toFixed(3));
        this.#scheduleRender();
      },
      { passive: false }
    );

    this.#scope.on(this.#target, 'pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      this.#dragging = true;
      this.#startX = ev.clientX - this.#state.x;
      this.#startY = ev.clientY - this.#state.y;
      this.#target.setPointerCapture(ev.pointerId);
    });

    this.#scope.on(this.#target, 'pointermove', (ev) => {
      if (!this.#dragging) return;
      this.#state.x = ev.clientX - this.#startX;
      this.#state.y = ev.clientY - this.#startY;
      this.#scheduleRender();
    });

    const stopDrag = (ev: PointerEvent) => {
      if (!this.#dragging) return;
      this.#dragging = false;
      if (this.#target.hasPointerCapture(ev.pointerId)) {
        this.#target.releasePointerCapture(ev.pointerId);
      }
    };

    this.#scope.on(this.#target, 'pointerup', stopDrag);
    this.#scope.on(this.#target, 'pointercancel', stopDrag);
    this.#scope.on(this.#stage, 'dblclick', () => this.reset());
  }

  #scheduleRender(): void {
    if (this.#rafId !== null) return;
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = null;
      const { x, y, scale, rotate, flipX } = this.#state;
      this.#target.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale * flipX}, ${scale}) rotate(${rotate}deg)`;
      this.#onChange?.(this.#state);
    });
  }

  [Symbol.dispose](): void {
    if (this.#rafId !== null) cancelAnimationFrame(this.#rafId);
    this.#scope.dispose();
  }
}
