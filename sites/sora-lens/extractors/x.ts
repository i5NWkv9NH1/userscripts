// sites/sora-lens/extractors/x.ts
import type { LensExtractor } from '@preview';

export const xExtractor: LensExtractor = {
  id: 'x-twitter',
  name: 'X (Twitter) 媒体无损原图提取器',
  match: /(^|\.)(x|twitter)\.com$/i,
  selector:
    '[data-testid="tweetPhoto"], article a[href*="/photo/"], [data-testid="card.wrapper"] img, img[src*="pbs.twimg.com/"]',
  resolve(el) {
    const img =
      el instanceof HTMLImageElement
        ? el
        : el.querySelector<HTMLImageElement>('img[src*="pbs.twimg.com/"], img');

    const rawSrc = img?.currentSrc || img?.src;
    if (!rawSrc) return null;

    const rawUrl = new URL(rawSrc);

    if (rawUrl.pathname.includes('/media/')) {
      const cleanPath = rawUrl.pathname.replace(/:[a-z0-9_]+$/i, '');
      const dotIdx = cleanPath.lastIndexOf('.');
      const basePath = dotIdx !== -1 ? cleanPath.slice(0, dotIdx) : cleanPath;
      const extFromPath = dotIdx !== -1 ? cleanPath.slice(dotIdx + 1) : null;
      const format = rawUrl.searchParams.get('format') || extFromPath || 'jpg';
      const originalUrl = `${rawUrl.origin}${basePath}?format=${format}&name=orig`;

      return {
        originalUrl,
        previewUrl: rawSrc,
        tag: `X · ${format.toUpperCase()} ORIG`,
      };
    }

    if (rawUrl.pathname.includes('/profile_images/')) {
      const originalUrl = rawSrc.replace(
        /_(normal|bigger|mini|400x400|200x200)(\.[a-z0-9]+)$/i,
        '$2'
      );
      return {
        originalUrl,
        previewUrl: rawSrc,
        tag: 'X · AVATAR RAW',
      };
    }

    return {
      originalUrl: rawSrc,
      previewUrl: rawSrc,
      tag: 'X · MEDIA',
    };
  },
};
