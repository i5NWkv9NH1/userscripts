export type ChipPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type ChipStyle = 'icon-only' | 'compact' | 'full';
export type MediaKind = 'image' | 'video' | 'gif';
export type SearchEngineId = 'yandex' | 'google' | 'bing' | 'saucenao';
export type GifSaveFormat = 'mp4' | 'gif';

export interface PeekPreferences {
  readonly chipPosition: ChipPosition;
  readonly chipStyle: ChipStyle;
  readonly filenameTemplate: string;
  readonly searchEngine: SearchEngineId;
  readonly gifSaveFormat: GifSaveFormat;
  readonly includeAvatars: boolean;
}

export type LensPreferences = PeekPreferences;

export interface ResolvedMedia {
  readonly originalUrl: string;
  readonly previewUrl: string;
  readonly mediaType?: MediaKind;
  readonly posterUrl?: string;
  readonly title?: string;
  readonly tag?: string;
  readonly isAvatar?: boolean;
}

export interface ExtractorContext {
  readonly url: URL;
  readonly target: HTMLElement;
  readonly isGalleryScan?: boolean;
}

export interface LensExtractor {
  readonly id: string;
  readonly name: string;
  readonly match: RegExp | ((url: URL) => boolean);
  readonly selector: string;
  readonly isFallback?: boolean;
  resolve(
    element: HTMLElement,
    ctx: ExtractorContext
  ): ResolvedMedia | null | Promise<ResolvedMedia | null>;
}
