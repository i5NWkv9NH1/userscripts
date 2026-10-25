import type { LensExtractor } from '@preview';

function parseBestSrcset(srcset: string): string | null {
  const candidates = srcset
    .split(',')
    .map((part) => {
      const [url, desc] = part.trim().split(/\s+/);
      const weight = desc ? parseFloat(desc) : 1;
      return { url, weight: Number.isNaN(weight) ? 1 : weight };
    })
    .filter((c) => Boolean(c.url))
    .sort((a, b) => b.weight - a.weight);

  return candidates[0]?.url ?? null;
}

export const universalExtractor: LensExtractor = {
  id: 'universal-hd',
  name: '通用全网高清图提取器',
  match: () => true,
  selector: 'img',
  resolve(el) {
    if (!(el instanceof HTMLImageElement)) return null;
    if (el.naturalWidth > 0 && el.naturalWidth < 140 && el.naturalHeight < 140) {
      return null;
    }

    const parentLink = el.closest<HTMLAnchorElement>('a[href]');
    if (
      parentLink &&
      /\.(jpe?g|png|webp|avif|gif)(\?.*)?$/i.test(parentLink.href)
    ) {
      return {
        originalUrl: parentLink.href,
        previewUrl: el.currentSrc || el.src,
        tag: 'LINK · HD',
      };
    }

    const dataOriginal =
      el.dataset.original ||
      el.dataset.src ||
      el.dataset.highres ||
      el.dataset.zoomSrc;
    if (dataOriginal) {
      return {
        originalUrl: new URL(dataOriginal, location.href).href,
        previewUrl: el.currentSrc || el.src,
        tag: 'DATA · ORIG',
      };
    }

    if (el.srcset) {
      const best = parseBestSrcset(el.srcset);
      if (best) {
        return {
          originalUrl: new URL(best, location.href).href,
          previewUrl: el.currentSrc || el.src,
          tag: 'SRCSET · MAX',
        };
      }
    }

    const src = el.currentSrc || el.src;
    if (!src) return null;

    return {
      originalUrl: src,
      previewUrl: src,
      tag: 'IMG · RAW',
    };
  },
};
