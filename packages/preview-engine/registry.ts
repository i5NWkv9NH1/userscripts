import type { LensExtractor, ResolvedMedia } from './types.ts';

export class ExtractorRegistry {
  readonly #extractors: LensExtractor[] = [];
  readonly #cache = new WeakMap<Element, Map<string, ResolvedMedia>>();
  #cachedKey = '';
  #activeExtractors: LensExtractor[] | null = null;

  register(...items: LensExtractor[]): this {
    this.#extractors.push(...items);
    this.#activeExtractors = null;
    this.#cachedKey = '';
    return this;
  }

  getActiveExtractors(currentUrl = new URL(location.href)): LensExtractor[] {
    const key = currentUrl.hostname + currentUrl.pathname;
    if (this.#activeExtractors && this.#cachedKey === key) {
      return this.#activeExtractors;
    }
    this.#cachedKey = key;
    this.#activeExtractors = this.#extractors
      .filter((ext) =>
        typeof ext.match === 'function'
          ? ext.match(currentUrl)
          : ext.match.test(currentUrl.hostname)
      )
      .sort((a, b) => Number(Boolean(a.isFallback)) - Number(Boolean(b.isFallback)));
    return this.#activeExtractors;
  }

  async resolveElement(
    matchedEl: HTMLElement,
    extractor: LensExtractor,
    currentUrl = new URL(location.href),
    isGalleryScan = false
  ): Promise<ResolvedMedia | null> {
    let elMap = this.#cache.get(matchedEl);
    const cached = elMap?.get(extractor.id);
    if (cached) return cached;

    const resolved = await extractor.resolve(matchedEl, {
      url: currentUrl,
      target: matchedEl,
      isGalleryScan,
    });

    if (resolved) {
      if (!elMap) {
        elMap = new Map();
        this.#cache.set(matchedEl, elMap);
      }
      elMap.set(extractor.id, resolved);
    }
    return resolved;
  }

  async resolveFromHoverTarget(
    rawTarget: EventTarget | null
  ): Promise<{ anchorEl: HTMLElement; media: ResolvedMedia; extractor: LensExtractor } | null> {
    if (!(rawTarget instanceof Element)) return null;

    const currentUrl = new URL(location.href);
    const active = this.getActiveExtractors(currentUrl);

    for (const extractor of active) {
      const matchedEl = rawTarget.closest<HTMLElement>(extractor.selector);
      if (!matchedEl) continue;

      const media = await this.resolveElement(matchedEl, extractor, currentUrl, false);
      if (media) {
        return { anchorEl: matchedEl, media, extractor };
      }
    }

    return null;
  }

  async collectPageGallery(currentMedia: ResolvedMedia): Promise<{
    items: ResolvedMedia[];
    index: number;
  }> {
    const currentUrl = new URL(location.href);
    const active = this.getActiveExtractors(currentUrl);
    const seenUrls = new Set<string>();
    const items: ResolvedMedia[] = [];

    for (const extractor of active) {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>(extractor.selector));
      const resolvedList = await Promise.all(
        nodes.map((node) => this.resolveElement(node, extractor, currentUrl, true))
      );
      for (const media of resolvedList) {
        if (media && !seenUrls.has(media.originalUrl)) {
          seenUrls.add(media.originalUrl);
          items.push(media);
        }
      }
      if (items.length > 0 && !extractor.isFallback) break;
    }

    if (!seenUrls.has(currentMedia.originalUrl)) {
      items.unshift(currentMedia);
    }

    const index = Math.max(
      0,
      items.findIndex((m) => m.originalUrl === currentMedia.originalUrl)
    );
    return { items, index };
  }
}
