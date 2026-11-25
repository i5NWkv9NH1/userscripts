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

    // * GitHub 头像原图参数放大
    if (u.hostname.includes('avatars.githubusercontent.com')) {
      u.searchParams.set('s', '460');
      return { url: u.href, tag: 'GH · AVATAR', isAvatar: true };
    }

    // * 知乎图片与头像替换为原图后缀 _r
    if (u.hostname.includes('zhimg.com')) {
      const isAvatar =
        u.pathname.includes('_is.') || u.pathname.includes('_im.') || u.pathname.includes('_l.');
      const hdPath = u.pathname.replace(/_(l|is|im|xs|s|m|b|hd|720w|1440w)(\.[a-z0-9]+)$/i, '_r$2');
      return {
        url: `${u.origin}${hdPath}`,
        tag: isAvatar ? 'ZHIHU · AVATAR' : 'ZHIHU · ORIG',
        isAvatar,
      };
    }

    // * Reddit 预览图转原图域名
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
  name: '全网图片与头像',
  isFallback: true,
  match: () => true,
  selector: 'img',
  resolve(el, ctx) {
    if (!(el instanceof HTMLImageElement)) return null;

    // * 批量收集图库时不调用 getBoundingClientRect()，改用图片固有尺寸避免页面卡顿
    if (ctx.isGalleryScan) {
      if (el.naturalWidth > 0 && el.naturalWidth < 48 && el.naturalHeight < 48) {
        return null;
      }
      const attrW = Number(el.getAttribute('width') || 0);
      const attrH = Number(el.getAttribute('height') || 0);
      if (attrW > 0 && attrH > 0 && attrW < 24 && attrH < 24) {
        return null;
      }
    } else {
      const rect = el.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) return null;
    }

    const src = el.currentSrc || el.src;
    if (!src) return null;

    const socialUpgraded = upgradeSocialMediaUrl(src);
    if (socialUpgraded) {
      return {
        originalUrl: socialUpgraded.url,
        previewUrl: src,
        mediaType: 'image',
        tag: socialUpgraded.tag,
        isAvatar: socialUpgraded.isAvatar,
      };
    }

    const parentLink = el.closest<HTMLAnchorElement>('a[href]');
    if (parentLink && /\.(jpe?g|png|webp|avif|gif)(\?.*)?$/i.test(parentLink.href)) {
      return {
        originalUrl: parentLink.href,
        previewUrl: src,
        mediaType: 'image',
        tag: 'LINK · ORIG',
      };
    }

    const dataOriginal =
      el.dataset.original || el.dataset.src || el.dataset.highres || el.dataset.zoomSrc;
    if (dataOriginal) {
      return {
        originalUrl: new URL(dataOriginal, location.href).href,
        previewUrl: src,
        mediaType: 'image',
        tag: 'DATA · ORIG',
      };
    }

    if (el.srcset) {
      const best = parseBestSrcset(el.srcset);
      if (best) {
        return {
          originalUrl: new URL(best, location.href).href,
          previewUrl: src,
          mediaType: 'image',
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
      mediaType: 'image',
      tag: 'IMG · ORIG',
    };
  },
};
