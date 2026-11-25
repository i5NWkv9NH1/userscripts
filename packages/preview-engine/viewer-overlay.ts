import {
  BaseComponent,
  createLogger,
  css,
  customElement,
  html,
  resolveLocale,
  useHotkey,
  useI18n,
} from '@core';
import { closeTopLayerPopover, Icons, showTopLayerPopover, svgIcon } from '@ui';
import { formatDownloadFilename } from './filename.ts';
import { GestureController } from './gesture-controller.ts';
import { convertMp4BlobToGif } from './gif-encoder.ts';
import type { GifSaveFormat, ResolvedMedia, SearchEngineId } from './types.ts';

declare function GM_xmlhttpRequest(details: {
  method: 'GET' | 'HEAD';
  url: string;
  responseType?: 'blob' | 'text' | 'arraybuffer';
  headers?: Record<string, string>;
  onload?: (res: { status: number; response: unknown; responseHeaders?: string }) => void;
  onerror?: (err: unknown) => void;
  onabort?: () => void;
}): { abort?: () => void };

declare function GM_download(details: {
  url: string;
  name: string;
  onload?: () => void;
  onerror?: (err: unknown) => void;
}): void;

const logger = createLogger('PeekViewer');

const SEARCH_ENGINE_URLS: Record<SearchEngineId, (encodedUrl: string) => string> = {
  yandex: (u) => `https://yandex.com/images/search?rpt=imageview&url=${u}`,
  google: (u) => `https://lens.google.com/uploadbyurl?url=${u}`,
  bing: (u) => `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${u}`,
  saucenao: (u) => `https://saucenao.com/search.php?url=${u}`,
};

const VIEWER_DICT = {
  'zh-CN': {
    close: '关闭 (Esc)',
    prevTitle: '上一张 (← 或 ↑)',
    nextTitle: '下一张 (→ 或 ↓)',
    zoomIn: '放大',
    zoomOut: '缩小',
    rotateLeft: '逆时针旋转 90°',
    rotateRight: '顺时针旋转 90°',
    flipH: '水平翻转',
    reset: '恢复默认大小',
    copyUrl: '复制原文件链接',
    copyBtn: '复制链接',
    copied: '已复制原文件链接',
    searchTitle: '用所选搜图引擎以图搜图',
    searchBtn: '以图搜图',
    saveBtn: '保存原文件',
    savingBtn: '保存中...',
    convertingGif: '转 GIF 中 {pct}%...',
    gifFormatMp4: '保存为 MP4',
    gifFormatGif: '转为 GIF (.gif)',
    loading: '加载中...',
    calculatingSize: '读取大小...',
    unknownSize: '未知大小',
    loadFailed: '加载失败',
    savedPrefix: '已保存：',
    blobDownloadNotice: '这是分段视频流（blob），无法直接在这里保存',
    origBadge: '原图',
  },
  en: {
    close: 'Close (Esc)',
    prevTitle: 'Previous (← or ↑)',
    nextTitle: 'Next (→ or ↓)',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    rotateLeft: 'Rotate left 90°',
    rotateRight: 'Rotate right 90°',
    flipH: 'Flip horizontal',
    reset: 'Reset view',
    copyUrl: 'Copy original URL',
    copyBtn: 'Copy URL',
    copied: 'Original URL copied',
    searchTitle: 'Reverse image search',
    searchBtn: 'Search',
    saveBtn: 'Save file',
    savingBtn: 'Saving...',
    convertingGif: 'Converting GIF {pct}%...',
    gifFormatMp4: 'Save MP4',
    gifFormatGif: 'Convert to GIF',
    loading: 'Loading...',
    calculatingSize: 'Checking size...',
    unknownSize: 'Unknown size',
    loadFailed: 'Failed to load',
    savedPrefix: 'Saved: ',
    blobDownloadNotice: 'Streaming video (blob) cannot be saved directly here',
    origBadge: 'ORIG',
  },
} as const;

function parseContentLengthFromHeaders(headersText: string | undefined): number {
  if (!headersText) return 0;
  const match = headersText.match(/^content-length:\s*(\d+)/im);
  return match?.[1] ? Number(match[1]) : 0;
}

@customElement('s-peek-viewer')
export class PeekViewer extends BaseComponent {
  static readonly tagName = 's-peek-viewer' as const;
  #gesture: GestureController | null = null;
  #currentMedia: ResolvedMedia | null = null;
  #gallery: ResolvedMedia[] = [];
  #currentIndex = 0;
  #filenameTemplate = '{original}';
  #searchEngine: SearchEngineId = 'yandex';
  #gifSaveFormat: GifSaveFormat = 'gif';
  #naturalW = 0;
  #naturalH = 0;
  #probeAbort: AbortController | null = null;
  #statusTimer: ReturnType<typeof setTimeout> | null = null;
  #onSearchEngineChange?: (engine: SearchEngineId) => void;
  #onGifFormatChange?: (fmt: GifSaveFormat) => void;

  protected readonly stylesheet = css`
    :host {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 0;
      border: none;
      background: light-dark(rgba(244, 244, 250, 0.92), rgba(10, 10, 14, 0.92));
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      opacity: 0;
      transition-property: opacity, display, overlay;
      transition-duration: 0.2s;
      transition-timing-function: ease;
      transition-behavior: allow-discrete;
    }

    :host(:popover-open) {
      opacity: 1;

      @starting-style {
        opacity: 0;
      }
    }

    :host([data-closing]) {
      opacity: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        transition-duration: 0.1s;
      }
    }

    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      -webkit-user-select: none;
      user-select: none;
    }

    .canvas-img,
    .canvas-video {
      max-width: 86vw;
      max-height: 82vh;
      object-fit: contain;
      border-radius: 10px;
      box-shadow: var(--s-shadow);
      will-change: transform;
      transition: opacity 0.18s ease;
    }

    .canvas-img {
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
    }

    .canvas-video {
      background: #000000;
      outline: none;
    }

    .hud-top {
      position: absolute;
      top: 20px;
      left: 24px;
      right: 24px;
      pointer-events: none;
      z-index: 2;
    }

    .hud-pill {
      pointer-events: auto;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      box-shadow: var(--s-shadow);
    }

    .nav-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      color: var(--s-text);
      box-shadow: var(--s-shadow);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      transition: background 0.15s ease, opacity 0.15s ease;

      &:hover:not(:disabled) {
        background: var(--s-surface-hover);
      }

      &:disabled {
        opacity: 0.25;
        cursor: not-allowed;
        pointer-events: none;
      }
    }

    .nav-prev {
      left: 24px;
    }
    .nav-next {
      right: 24px;
    }

    .dock {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 12px;
      border-radius: 14px;
      border: 1px solid var(--s-border);
      background: var(--s-bg);
      box-shadow: var(--s-shadow);
      z-index: 2;
      flex-wrap: wrap;
      max-width: 94vw;
    }

    .dock-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .dock-select {
      height: 28px;
      padding: 0 6px;
      border-radius: 7px;
      border: 1px solid var(--s-border);
      background: var(--s-surface);
      color: var(--s-text);
      font-size: 11px;
      outline: none;
      cursor: pointer;

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }
  `;

  setPreferences(prefs: {
    filenameTemplate?: string;
    searchEngine?: SearchEngineId;
    gifSaveFormat?: GifSaveFormat;
    onSearchEngineChange?: (engine: SearchEngineId) => void;
    onGifFormatChange?: (fmt: GifSaveFormat) => void;
  }): void {
    if (prefs.filenameTemplate !== undefined) this.#filenameTemplate = prefs.filenameTemplate;
    if (prefs.searchEngine !== undefined) {
      this.#searchEngine = prefs.searchEngine;
      const sel = this.$<HTMLSelectElement>('#sel-search-engine');
      if (sel) sel.value = prefs.searchEngine;
    }
    if (prefs.gifSaveFormat !== undefined) {
      this.#gifSaveFormat = prefs.gifSaveFormat;
      const sel = this.$<HTMLSelectElement>('#sel-gif-format');
      if (sel) sel.value = prefs.gifSaveFormat;
    }
    if (prefs.onSearchEngineChange) this.#onSearchEngineChange = prefs.onSearchEngineChange;
    if (prefs.onGifFormatChange) this.#onGifFormatChange = prefs.onGifFormatChange;
  }

  setFilenameTemplate(tpl: string): void {
    this.#filenameTemplate = tpl;
  }

  open(media: ResolvedMedia, gallery: ResolvedMedia[] = [media], index = 0): void {
    this.#gallery = gallery.length > 0 ? gallery : [media];
    this.#currentIndex = Math.min(Math.max(0, index), this.#gallery.length - 1);
    if (!this.isConnected) {
      this.mountTo(document.documentElement);
    }
    this.#loadCurrentIndex();
    showTopLayerPopover(this.host);
  }

  close(): void {
    const video = this.$<HTMLVideoElement>('#main-video');
    if (video) {
      video.pause();
    }
    void closeTopLayerPopover(this.host);
  }

  navigate(step: 1 | -1): void {
    if (this.#gallery.length <= 1) return;
    this.#currentIndex = (this.#currentIndex + step + this.#gallery.length) % this.#gallery.length;
    this.#loadCurrentIndex();
  }

  #showStatus(msg: string, durationMs = 1800): void {
    const dimEl = this.$<HTMLElement>('#media-dim');
    if (!dimEl) return;
    if (this.#statusTimer !== null) clearTimeout(this.#statusTimer);
    dimEl.textContent = msg;
    if (durationMs > 0) {
      this.#statusTimer = setTimeout(() => {
        this.#statusTimer = null;
        if (this.#naturalW > 0) {
          dimEl.textContent = `${this.#naturalW} × ${this.#naturalH} px`;
        }
      }, durationMs);
    }
  }

  #syncToolbarForMedia(media: ResolvedMedia): void {
    const isVideo = media.mediaType === 'video' || media.mediaType === 'gif';
    const isGif = media.mediaType === 'gif';
    const canNav = this.#gallery.length > 1;
    const canSearch = !isVideo && /^https?:/i.test(media.originalUrl);

    for (const sel of ['#btn-prev', '#btn-next', '#btn-dock-prev', '#btn-dock-next']) {
      const btn = this.$<HTMLButtonElement>(sel);
      if (btn) btn.disabled = !canNav;
    }

    // * 看视频或动图时隐藏缩放、旋转、翻转等只对静态图片有用的按钮
    for (const sel of [
      '#btn-zoom-in',
      '#btn-zoom-out',
      '#btn-rot-left',
      '#btn-rot-right',
      '#btn-flip',
      '#btn-reset',
      '#zoom-val',
    ]) {
      const el = this.$<HTMLElement>(sel);
      if (el) el.hidden = isVideo;
    }

    const searchGroup = this.$<HTMLElement>('#search-group');
    const searchBtn = this.$<HTMLButtonElement>('#btn-search');
    const searchSel = this.$<HTMLSelectElement>('#sel-search-engine');
    if (searchGroup) searchGroup.hidden = isVideo;
    if (searchBtn) searchBtn.disabled = !canSearch;
    if (searchSel) searchSel.disabled = !canSearch;

    const gifFormatSel = this.$<HTMLSelectElement>('#sel-gif-format');
    if (gifFormatSel) {
      gifFormatSel.hidden = !isGif;
      gifFormatSel.value = this.#gifSaveFormat;
    }

    const saveBtn = this.$<HTMLButtonElement>('#btn-save');
    if (saveBtn) {
      saveBtn.disabled = media.originalUrl.startsWith('blob:');
    }
  }

  #loadCurrentIndex(): void {
    const media = this.#gallery[this.#currentIndex];
    if (!media) return;
    this.#currentMedia = media;
    this.#naturalW = 0;
    this.#naturalH = 0;

    const t = VIEWER_DICT[resolveLocale()];
    const img = this.$<HTMLImageElement>('#main-img');
    const video = this.$<HTMLVideoElement>('#main-video');
    const tagEl = this.$<HTMLElement>('#media-tag');
    const dimEl = this.$<HTMLElement>('#media-dim');
    const idxEl = this.$<HTMLElement>('#gallery-idx');

    const isVideo = media.mediaType === 'video' || media.mediaType === 'gif';
    const isGif = media.mediaType === 'gif';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (img && video) {
      if (isVideo) {
        img.hidden = true;
        img.removeAttribute('src');
        video.hidden = false;
        video.loop = isGif;
        video.muted = isGif;
        video.autoplay = isGif && !reduceMotion;
        video.poster = media.posterUrl ?? media.previewUrl ?? '';
        video.src = media.originalUrl;
        if (video.autoplay) {
          void video.play().catch(() => {});
        }
      } else {
        video.pause();
        video.hidden = true;
        video.removeAttribute('src');
        img.hidden = false;
        img.style.opacity = '0.35';
        img.src = media.originalUrl;
      }
    }

    this.#syncToolbarForMedia(media);
    if (tagEl) tagEl.textContent = media.tag ?? t.origBadge;
    if (dimEl) dimEl.textContent = t.loading;
    if (idxEl) {
      idxEl.textContent = `${this.#currentIndex + 1} / ${this.#gallery.length}`;
    }

    void this.#probeFileSize(media.originalUrl);
    this.#gesture?.reset();
  }

  // * 只发 HEAD 请求查询大小，拿不到就直接显示未知大小，绝不为了测体积去下载整张大图
  async #probeFileSize(url: string): Promise<void> {
    this.#probeAbort?.abort();
    const controller = new AbortController();
    this.#probeAbort = controller;
    const { signal } = controller;

    const sizeEl = this.$<HTMLElement>('#media-size');
    const t = VIEWER_DICT[resolveLocale()];
    if (!sizeEl) return;
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      sizeEl.textContent = t.unknownSize;
      return;
    }

    sizeEl.textContent = t.calculatingSize;

    const formatBytes = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    if (typeof GM_xmlhttpRequest === 'function') {
      const gmBytes = await new Promise<number>((resolve) => {
        let settled = false;
        const req = GM_xmlhttpRequest({
          method: 'HEAD',
          url,
          onload(res) {
            if (settled) return;
            settled = true;
            resolve(parseContentLengthFromHeaders(res.responseHeaders));
          },
          onerror() {
            if (!settled) {
              settled = true;
              resolve(0);
            }
          },
        });
        signal.addEventListener(
          'abort',
          () => {
            if (!settled) {
              settled = true;
              req.abort?.();
              resolve(0);
            }
          },
          { once: true }
        );
      });
      if (signal.aborted) return;
      if (gmBytes > 0) {
        sizeEl.textContent = formatBytes(gmBytes);
        return;
      }
    }

    try {
      const res = await fetch(url, { method: 'HEAD', signal });
      if (signal.aborted) return;
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > 0) {
        sizeEl.textContent = formatBytes(len);
        return;
      }
    } catch {}

    if (!signal.aborted) {
      sizeEl.textContent = t.unknownSize;
    }
  }

  #fetchBlobViaGM(url: string): Promise<Blob | null> {
    if (typeof GM_xmlhttpRequest !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        onload(res) {
          if (res.status >= 200 && res.status < 300 && res.response instanceof Blob) {
            resolve(res.response);
          } else {
            resolve(null);
          }
        },
        onerror() {
          resolve(null);
        },
      });
    });
  }

  async #downloadOriginal(): Promise<void> {
    if (!this.#currentMedia) return;
    const url = this.#currentMedia.originalUrl;
    const t = VIEWER_DICT[resolveLocale()];

    if (url.startsWith('blob:')) {
      this.#showStatus(t.blobDownloadNotice);
      return;
    }

    const saveBtn = this.$<HTMLButtonElement>('#btn-save');
    const saveText = this.$<HTMLElement>('#btn-save-text');
    if (saveBtn) saveBtn.disabled = true;
    if (saveText) saveText.textContent = t.savingBtn;

    let objectUrl: string | null = null;
    try {
      let blob = await this.#fetchBlobViaGM(url);
      if (!blob) {
        const res = await fetch(url);
        blob = await res.blob();
      }

      let finalExt = blob.type.split('/')[1]?.split(';')[0];
      if (this.#currentMedia.mediaType === 'gif' && this.#gifSaveFormat === 'gif') {
        blob = await convertMp4BlobToGif(blob, (pct) => {
          this.#showStatus(t.convertingGif.replace('{pct}', String(pct)), 0);
        });
        finalExt = 'gif';
      }

      const fallbackExt =
        this.#currentMedia.mediaType === 'image' || !this.#currentMedia.mediaType ? 'jpg' : 'mp4';
      const filename = formatDownloadFilename(
        this.#filenameTemplate,
        url,
        this.#naturalW,
        this.#naturalH,
        finalExt || fallbackExt,
        location.hostname
      );

      objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.click();
      this.#showStatus(`${t.savedPrefix}${filename}`);
      logger.success(`已保存文件：${filename}`);
    } catch {
      const filename = formatDownloadFilename(
        this.#filenameTemplate,
        url,
        this.#naturalW,
        this.#naturalH,
        undefined,
        location.hostname
      );
      if (typeof GM_download === 'function') {
        GM_download({
          url,
          name: filename,
          onload: () => this.#showStatus(`${t.savedPrefix}${filename}`),
          onerror: () => window.open(url, '_blank', 'noopener,noreferrer'),
        });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (saveText) saveText.textContent = VIEWER_DICT[resolveLocale()].saveBtn;
      if (objectUrl) {
        const toRevoke = objectUrl;
        setTimeout(() => URL.revokeObjectURL(toRevoke), 1500);
      }
    }
  }

  async #copyOriginalUrl(): Promise<void> {
    if (!this.#currentMedia) return;
    const t = VIEWER_DICT[resolveLocale()];
    try {
      await navigator.clipboard.writeText(this.#currentMedia.originalUrl);
      this.#showStatus(t.copied);
    } catch {}
  }

  #searchImage(): void {
    if (!this.#currentMedia) return;
    const targetUrl = this.#currentMedia.originalUrl;
    if (!/^https?:/i.test(targetUrl)) return;
    const builder = SEARCH_ENGINE_URLS[this.#searchEngine] ?? SEARCH_ENGINE_URLS.yandex;
    window.open(builder(encodeURIComponent(targetUrl)), '_blank', 'noopener,noreferrer');
  }

  #syncLocaleTexts(): void {
    const t = VIEWER_DICT[resolveLocale()];
    const setText = (sel: string, txt: string) => {
      const el = this.$<HTMLElement>(sel);
      if (el) el.textContent = txt;
    };
    const setTitle = (sel: string, txt: string) => {
      const el = this.$<HTMLElement>(sel);
      if (el) el.title = txt;
    };

    setText('#btn-close-text', t.close);
    setTitle('#btn-prev', t.prevTitle);
    setTitle('#btn-next', t.nextTitle);
    setTitle('#btn-dock-prev', t.prevTitle);
    setTitle('#btn-dock-next', t.nextTitle);
    setTitle('#btn-zoom-in', t.zoomIn);
    setTitle('#btn-zoom-out', t.zoomOut);
    setTitle('#btn-rot-left', t.rotateLeft);
    setTitle('#btn-rot-right', t.rotateRight);
    setTitle('#btn-flip', t.flipH);
    setTitle('#btn-reset', t.reset);
    setTitle('#btn-copy', t.copyUrl);
    setText('#btn-copy-text', t.copyBtn);
    setTitle('#btn-search', t.searchTitle);
    setText('#btn-search-text', t.searchBtn);
    setText('#btn-save-text', t.saveBtn);
    setText('#opt-gif-mp4', t.gifFormatMp4);
    setText('#opt-gif-gif', t.gifFormatGif);
  }

  protected render(): DocumentFragment {
    const t = VIEWER_DICT[resolveLocale()];

    return html`
      <div
        id="stage"
        class="stage"
        @click=${(e: MouseEvent) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div class="hud-top flex items-center justify-between">
          <div class="hud-pill flex items-center gap-2 text-xs">
            <span id="media-tag" class="s-badge">${t.origBadge}</span>
            <span id="gallery-idx" class="font-mono font-semibold">1 / 1</span>
            <span id="media-dim" class="font-mono text-muted">0 × 0</span>
            <span id="media-size" class="font-mono text-muted">-- KB</span>
            <span id="zoom-val" class="font-mono">100%</span>
          </div>
          <button
            type="button"
            class="s-btn hud-pill"
            @click=${() => this.close()}
          >
            ${svgIcon(Icons.close)}
            <span id="btn-close-text">${t.close}</span>
          </button>
        </div>

        <button
          id="btn-prev"
          type="button"
          class="nav-arrow nav-prev"
          title=${t.prevTitle}
          @click=${() => this.navigate(-1)}
        >
          ${svgIcon(Icons.chevronLeft)}
        </button>

        <img
          id="main-img"
          class="canvas-img"
          alt="Media Preview"
          @load=${(e: Event) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.opacity = '1';
            this.#naturalW = img.naturalWidth;
            this.#naturalH = img.naturalHeight;
            const dimEl = this.$<HTMLElement>('#media-dim');
            if (dimEl) {
              dimEl.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
            }
          }}
          @error=${(e: Event) => {
            const img = e.currentTarget as HTMLImageElement;
            if (
              this.#currentMedia &&
              img.src !== this.#currentMedia.previewUrl &&
              this.#currentMedia.previewUrl
            ) {
              img.src = this.#currentMedia.previewUrl;
            } else {
              img.style.opacity = '1';
              this.#showStatus(VIEWER_DICT[resolveLocale()].loadFailed);
            }
          }}
        />

        <video
          id="main-video"
          class="canvas-video"
          controls
          playsinline
          preload="metadata"
          hidden
          @loadedmetadata=${(e: Event) => {
            const vid = e.currentTarget as HTMLVideoElement;
            this.#naturalW = vid.videoWidth;
            this.#naturalH = vid.videoHeight;
            const dimEl = this.$<HTMLElement>('#media-dim');
            if (dimEl && vid.videoWidth > 0) {
              dimEl.textContent = `${vid.videoWidth} × ${vid.videoHeight} px`;
            }
          }}
          @error=${() => {
            this.#showStatus(VIEWER_DICT[resolveLocale()].loadFailed);
          }}
        ></video>

        <button
          id="btn-next"
          type="button"
          class="nav-arrow nav-next"
          title=${t.nextTitle}
          @click=${() => this.navigate(1)}
        >
          ${svgIcon(Icons.chevronRight)}
        </button>

        <div class="dock flex items-center gap-2">
          <button
            id="btn-dock-prev"
            type="button"
            class="s-btn"
            title=${t.prevTitle}
            @click=${() => this.navigate(-1)}
          >
            ${svgIcon(Icons.chevronLeft)}
          </button>
          <button
            id="btn-dock-next"
            type="button"
            class="s-btn"
            title=${t.nextTitle}
            @click=${() => this.navigate(1)}
          >
            ${svgIcon(Icons.chevronRight)}
          </button>
          <button
            id="btn-zoom-in"
            type="button"
            class="s-btn"
            title=${t.zoomIn}
            @click=${() => this.#gesture?.zoomBy(1.25)}
          >
            ${svgIcon(Icons.zoomIn)}
          </button>
          <button
            id="btn-zoom-out"
            type="button"
            class="s-btn"
            title=${t.zoomOut}
            @click=${() => this.#gesture?.zoomBy(0.8)}
          >
            ${svgIcon(Icons.zoomOut)}
          </button>
          <button
            id="btn-rot-left"
            type="button"
            class="s-btn"
            title=${t.rotateLeft}
            @click=${() => this.#gesture?.rotateBy(-90)}
          >
            ${svgIcon(Icons.rotateLeft)}
          </button>
          <button
            id="btn-rot-right"
            type="button"
            class="s-btn"
            title=${t.rotateRight}
            @click=${() => this.#gesture?.rotateBy(90)}
          >
            ${svgIcon(Icons.rotateRight)}
          </button>
          <button
            id="btn-flip"
            type="button"
            class="s-btn"
            title=${t.flipH}
            @click=${() => this.#gesture?.toggleFlipX()}
          >
            ${svgIcon(Icons.flipH)}
          </button>
          <button
            id="btn-reset"
            type="button"
            class="s-btn"
            title=${t.reset}
            @click=${() => this.#gesture?.reset()}
          >
            ${svgIcon(Icons.reset)}
          </button>
          <button
            id="btn-copy"
            type="button"
            class="s-btn"
            title=${t.copyUrl}
            @click=${() => this.#copyOriginalUrl()}
          >
            ${svgIcon(Icons.copy)}
            <span id="btn-copy-text">${t.copyBtn}</span>
          </button>

          <div id="search-group" class="dock-group">
            <select
              id="sel-search-engine"
              class="dock-select"
              @change=${(e: Event) => {
                const val = (e.currentTarget as HTMLSelectElement).value as SearchEngineId;
                this.#searchEngine = val;
                this.#onSearchEngineChange?.(val);
              }}
            >
              <option value="yandex">Yandex</option>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
              <option value="saucenao">SauceNAO</option>
            </select>
            <button
              id="btn-search"
              type="button"
              class="s-btn"
              title=${t.searchTitle}
              @click=${() => this.#searchImage()}
            >
              ${svgIcon(Icons.search)}
              <span id="btn-search-text">${t.searchBtn}</span>
            </button>
          </div>

          <select
            id="sel-gif-format"
            class="dock-select"
            hidden
            @change=${(e: Event) => {
              const val = (e.currentTarget as HTMLSelectElement).value as GifSaveFormat;
              this.#gifSaveFormat = val;
              this.#onGifFormatChange?.(val);
            }}
          >
            <option id="opt-gif-mp4" value="mp4">${t.gifFormatMp4}</option>
            <option id="opt-gif-gif" value="gif">${t.gifFormatGif}</option>
          </select>

          <button
            id="btn-save"
            type="button"
            class="s-btn s-btn-primary"
            @click=${() => this.#downloadOriginal()}
          >
            ${svgIcon(Icons.download)}
            <span id="btn-save-text">${t.saveBtn}</span>
          </button>
        </div>
      </div>
    `;
  }

  protected override onMount(): void {
    this.setAttribute('popover', 'manual');
    const selEngine = this.$<HTMLSelectElement>('#sel-search-engine');
    const selGif = this.$<HTMLSelectElement>('#sel-gif-format');
    if (selEngine) selEngine.value = this.#searchEngine;
    if (selGif) selGif.value = this.#gifSaveFormat;
    this.#syncLocaleTexts();
  }

  protected override onConnect(): void {
    const stage = this.$<HTMLElement>('#stage');
    const img = this.$<HTMLElement>('#main-img');
    const zoomEl = this.$<HTMLElement>('#zoom-val');

    useI18n(VIEWER_DICT, this.scope.signal, () => this.#syncLocaleTexts());

    if (stage && img) {
      this.#gesture?.[Symbol.dispose]();
      this.#gesture = new GestureController(stage, img, (st) => {
        if (zoomEl) zoomEl.textContent = `${Math.round(st.scale * 100)}%`;
      });
    }

    useHotkey(
      {
        Escape: (e) => {
          if (!this.matches(':popover-open')) return false;
          e.preventDefault();
          e.stopImmediatePropagation();
          this.close();
          return true;
        },
        ArrowLeft: (e) => {
          if (!this.matches(':popover-open')) return false;
          e.preventDefault();
          e.stopImmediatePropagation();
          this.navigate(-1);
          return true;
        },
        ArrowUp: (e) => {
          if (!this.matches(':popover-open')) return false;
          e.preventDefault();
          e.stopImmediatePropagation();
          this.navigate(-1);
          return true;
        },
        ArrowRight: (e) => {
          if (!this.matches(':popover-open')) return false;
          e.preventDefault();
          e.stopImmediatePropagation();
          this.navigate(1);
          return true;
        },
        ArrowDown: (e) => {
          if (!this.matches(':popover-open')) return false;
          e.preventDefault();
          e.stopImmediatePropagation();
          this.navigate(1);
          return true;
        },
      },
      this.scope.signal,
      { capture: true }
    );
  }

  protected override onDisconnect(): void {
    const video = this.$<HTMLVideoElement>('#main-video');
    if (video) {
      video.pause();
    }
    this.#gesture?.[Symbol.dispose]();
    this.#gesture = null;
  }

  protected override onDestroy(): void {
    this.#probeAbort?.abort();
    if (this.#statusTimer !== null) clearTimeout(this.#statusTimer);
  }
}

export type LensViewer = PeekViewer;
export const LensViewer = PeekViewer;
