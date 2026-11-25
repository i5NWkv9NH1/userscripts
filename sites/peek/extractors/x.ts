import type { LensExtractor } from '@preview';

declare function GM_xmlhttpRequest(details: {
  method: 'GET';
  url: string;
  responseType?: 'json' | 'text';
  onload?: (res: { status: number; responseText: string }) => void;
  onerror?: () => void;
}): void;

interface SyndicationVariant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}

interface SyndicationMedia {
  type?: string;
  media_url_https?: string;
  video_info?: {
    variants?: SyndicationVariant[];
  };
}

interface SyndicationTweet {
  mediaDetails?: SyndicationMedia[];
}

const syndicationVideoCache = new Map<string, Promise<string | null>>();

function getTweetIdFromElement(el: HTMLElement): string | null {
  const article = el.closest('article');
  if (article) {
    const link =
      article.querySelector<HTMLAnchorElement>('a[href*="/status/"] time')?.closest('a') ??
      article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
    const href = link?.getAttribute('href') ?? '';
    const match = href.match(/\/status\/(\d+)/);
    if (match?.[1]) return match[1];
  }
  const pathMatch = location.pathname.match(/\/status\/(\d+)/);
  return pathMatch?.[1] ?? null;
}

function makeSyndicationToken(tweetId: string): string {
  return ((Number(tweetId) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

function fetchXSyndicationMp4(tweetId: string, posterUrl: string): Promise<string | null> {
  const cacheKey = `${tweetId}:${posterUrl}`;
  const existing = syndicationVideoCache.get(cacheKey);
  if (existing) return existing;

  const task = new Promise<string | null>((resolve) => {
    if (typeof GM_xmlhttpRequest !== 'function') {
      resolve(null);
      return;
    }

    const token = makeSyndicationToken(tweetId);
    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`;

    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'text',
      onload: (res) => {
        if (res.status < 200 || res.status >= 300 || !res.responseText) {
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(res.responseText) as SyndicationTweet;
          const details = data.mediaDetails ?? [];
          const posterId = posterUrl.match(/\/amplify_video_thumb\/(\d+)\//)?.[1] ?? '';
          const matchedMedia =
            details.find(
              (m) =>
                m.video_info?.variants?.length &&
                (!posterId ||
                  m.media_url_https?.includes(posterId) ||
                  JSON.stringify(m).includes(posterId))
            ) ?? details.find((m) => m.video_info?.variants?.length);

          // * 按码率降序排列，默认挑最高清晰度的 MP4
          const mp4Variants = (matchedMedia?.video_info?.variants ?? [])
            .filter((v) => v.content_type === 'video/mp4' && typeof v.url === 'string')
            .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

          resolve(mp4Variants[0]?.url ?? null);
        } catch {
          resolve(null);
        }
      },
      onerror: () => resolve(null),
    });
  });

  syndicationVideoCache.set(cacheKey, task);
  return task;
}

async function resolveTweetVideoFromEl(
  el: HTMLElement,
  isGalleryScan: boolean
): Promise<{
  videoUrl: string;
  posterUrl: string;
  isGif: boolean;
} | null> {
  const video = el instanceof HTMLVideoElement ? el : el.querySelector<HTMLVideoElement>('video');
  if (!video) return null;

  const poster = video.poster || '';
  const sourceEl = video.querySelector<HTMLSourceElement>('source[src]');
  const src = video.currentSrc || video.src || sourceEl?.src || '';

  if (src.includes('video.twimg.com/tweet_video/')) {
    return { videoUrl: src, posterUrl: poster, isGif: true };
  }

  const thumbMatch = poster.match(/\/tweet_video_thumb\/([^.?/]+)/);
  if (thumbMatch?.[1]) {
    return {
      videoUrl: `https://video.twimg.com/tweet_video/${thumbMatch[1]}.mp4`,
      posterUrl: poster,
      isGif: true,
    };
  }

  if (src && !src.startsWith('blob:')) {
    return { videoUrl: src, posterUrl: poster, isGif: false };
  }

  if (
    src.startsWith('blob:') ||
    poster.includes('amplify_video_thumb') ||
    poster.includes('ext_tw_video_thumb')
  ) {
    if (!isGalleryScan) {
      const tweetId = getTweetIdFromElement(el);
      if (tweetId) {
        const directMp4 = await fetchXSyndicationMp4(tweetId, poster);
        if (directMp4) {
          return { videoUrl: directMp4, posterUrl: poster, isGif: false };
        }
      }
    }
    if (src) {
      return { videoUrl: src, posterUrl: poster, isGif: false };
    }
  }

  return null;
}

export const xExtractor: LensExtractor = {
  id: 'x-twitter',
  name: 'X (Twitter) 原图、GIF 与视频',
  match: /(^|\.)(x|twitter)\.com$/i,
  selector:
    '[data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="tweetPhoto"], [data-testid^="UserAvatar-Container"], article a[href*="/photo/"], [data-testid="card.wrapper"] img, img[src*="pbs.twimg.com/"]',
  async resolve(el, ctx) {
    const videoData = await resolveTweetVideoFromEl(el, Boolean(ctx.isGalleryScan));
    if (videoData) {
      const isDirectMp4 = !videoData.videoUrl.startsWith('blob:');
      return {
        originalUrl: videoData.videoUrl,
        previewUrl: videoData.posterUrl || videoData.videoUrl,
        posterUrl: videoData.posterUrl || undefined,
        mediaType: videoData.isGif ? 'gif' : 'video',
        tag: videoData.isGif ? 'X · GIF' : isDirectMp4 ? 'X · MP4' : 'X · STREAM',
      };
    }

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
        mediaType: 'image',
        tag: `X · ${format.toUpperCase()}`,
      };
    }

    if (rawUrl.pathname.includes('/profile_images/')) {
      const originalUrl = rawSrc.replace(
        /_(normal|bigger|mini|x96|400x400|200x200)(\.[a-z0-9]+)$/i,
        '$2'
      );
      return {
        originalUrl,
        previewUrl: rawSrc,
        mediaType: 'image',
        tag: 'X · AVATAR',
        isAvatar: true,
      };
    }

    if (rawUrl.pathname.includes('/profile_banners/')) {
      const originalUrl = rawSrc.replace(/\/\d+x\d+$/, '/1500x500');
      return {
        originalUrl,
        previewUrl: rawSrc,
        mediaType: 'image',
        tag: 'X · BANNER',
      };
    }

    return {
      originalUrl: rawSrc,
      previewUrl: rawSrc,
      mediaType: 'image',
      tag: 'X · MEDIA',
    };
  },
};
