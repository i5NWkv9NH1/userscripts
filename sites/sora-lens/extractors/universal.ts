// sites/sora-lens/extractors/universal.ts
import type { LensExtractor } from '@preview';

function parseBestSrcset(srcset: string): string | null {
  const candidates = srcset
    .split(',')
    .map((part) => {
      const [url, desc] = part.trim().split(/\s+/);
      const weight = desc ? Number.parseFloat(desc) : 1;
      return { url, weight: Number.isNaN(weight) ? 1 : weight };
    })
    .filter((c) => Boolean(c.url))
    .sort((a, b) => b.weight - a.weight);

  return candidates[0]?.url ?? null;
}

function upgradeSocialMediaUrl(
  rawSrc: string
): { url: string; tag: string; isAvatar?: boolean } | null {
  try {
    const u = new URL(rawSrc, location.href);

    // GitHub 头像与资产原图还原 (?s=48 -> ?s=460)
    if (u.hostname.includes('avatars.githubusercontent.com')) {
      u.searchParams.set('s', '460');
      return { url: u.href, tag: 'GH · AVATAR HD', isAvatar: true };
    }

    // 知乎图片与头像原图还原 (_l.jpg / _is.jpg / _im.jpg / _720w.jpg -> _r.jpg)
    if (u.hostname.includes('zhimg.com')) {
      const isAvatar =
        u.pathname.includes('_is.') || u.pathname.includes('_im.') || u.pathname.includes('_l.');
      const hdPath = u.pathname.replace(/_(l|is|im|xs|s|m|b|hd|720w|1440w)(\.[a-z0-9]+)$/i, '_r$2');
      return {
        url: `${u.origin}${hdPath}`,
        tag: isAvatar ? 'ZHIHU · AVATAR' : 'ZHIHU · RAW',
        isAvatar,
      };
    }

    // Reddit 预览图转无损源图 (preview.redd.it -> i.redd.it)
    if (u.hostname === 'preview.redd.it') {
      return {
        url: `https://i.redd.it${u.pathname}`,
        tag: 'REDDIT · ORIG',
      };
    }
  } catch {}
  return null;
}

export const universalExtractor: LensExtractor = {
  id: 'universal-hd',
  name: '全网高清图与社媒头像提取器',
  match: () => true,
  selector: 'img',
  resolve(el) {
    if (!(el instanceof HTMLImageElement)) return null;
    const rect = el.getBoundingClientRect();
    // if (rect.width < 22 || rect.height < 22) return null;
    if (rect.width < 16 || rect.height < 16) return null;

    const src = el.currentSrc || el.src;
    if (!src) return null;

    const socialUpgraded = upgradeSocialMediaUrl(src);
    if (socialUpgraded) {
      return {
        originalUrl: socialUpgraded.url,
        previewUrl: src,
        tag: socialUpgraded.tag,
        isAvatar: socialUpgraded.isAvatar,
      };
    }

    const parentLink = el.closest<HTMLAnchorElement>('a[href]');
    if (parentLink && /\.(jpe?g|png|webp|avif|gif)(\?.*)?$/i.test(parentLink.href)) {
      return {
        originalUrl: parentLink.href,
        previewUrl: src,
        tag: 'LINK · HD',
      };
    }

    const dataOriginal =
      el.dataset.original || el.dataset.src || el.dataset.highres || el.dataset.zoomSrc;
    if (dataOriginal) {
      return {
        originalUrl: new URL(dataOriginal, location.href).href,
        previewUrl: src,
        tag: 'DATA · ORIG',
      };
    }

    if (el.srcset) {
      const best = parseBestSrcset(el.srcset);
      if (best) {
        return {
          originalUrl: new URL(best, location.href).href,
          previewUrl: src,
          tag: 'SRCSET · MAX',
        };
      }
    }

    if (el.naturalWidth > 0 && el.naturalWidth < 48 && el.naturalHeight < 48) {
      return null;
    }

    return {
      originalUrl: src,
      previewUrl: src,
      tag: 'IMG · RAW',
    };
  },
};
