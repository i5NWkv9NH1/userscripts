import type { LensExtractor, ResolvedMedia } from './types.ts';

export class ExtractorRegistry {
  readonly #extractors: LensExtractor[] = [];
  readonly #cache = new WeakMap<Element, ResolvedMedia>();
  #activeExtractors: LensExtractor[] | null = null;

  register(...items: LensExtractor[]): this {
    this.#extractors.push(...items);
    this.#activeExtractors = null;
    return this;
  }

  getActiveExtractors(currentUrl = new URL(location.href)): LensExtractor[] {
    if (this.#activeExtractors) return this.#activeExtractors;
    this.#activeExtractors = this.#extractors.filter((ext) =>
      typeof ext.match === 'function'
        ? ext.match(currentUrl)
        : ext.match.test(currentUrl.hostname)
    );
    return this.#activeExtractors;
  }

  async resolveElement(
    matchedEl: HTMLElement,
    extractor: LensExtractor,
    currentUrl = new URL(location.href)
  ): Promise<ResolvedMedia | null> {
    const cached = this.#cache.get(matchedEl);
    if (cached) return cached;

    const resolved = await extractor.resolve(matchedEl, {
      url: currentUrl,
      target: matchedEl,
    });

    if (resolved) {
      this.#cache.set(matchedEl, resolved);
    }
    return resolved;
  }

  async resolveFromHoverTarget(
    rawTarget: EventTarget | null
  ): Promise<{ anchorEl: HTMLElement; media: ResolvedMedia; extractor: LensExtractor } | null> {
    if (!(rawTarget instanceof HTMLElement)) return null;

    const currentUrl = new URL(location.href);
    const active = this.getActiveExtractors(currentUrl);

    for (const extractor of active) {
      const matchedEl = rawTarget.closest<HTMLElement>(extractor.selector);
      if (!matchedEl) continue;

      const media = await this.resolveElement(matchedEl, extractor, currentUrl);
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
      const nodes = document.querySelectorAll<HTMLElement>(extractor.selector);
      for (const node of nodes) {
        const media = await this.resolveElement(node, extractor, currentUrl);
        if (media && !seenUrls.has(media.originalUrl)) {
          seenUrls.add(media.originalUrl);
          items.push(media);
        }
      }
      if (items.length > 0 && extractor.id !== 'universal-hd') break;
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
