export type ChipPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type ChipStyle = 'icon-only' | 'compact' | 'full';

export interface LensPreferences {
  readonly chipPosition: ChipPosition;
  readonly chipStyle: ChipStyle;
  readonly filenameTemplate: string;
  readonly includeAvatars: boolean;
}

export interface ResolvedMedia {
  readonly originalUrl: string;
  readonly previewUrl: string;
  readonly title?: string;
  readonly tag?: string;
  readonly isAvatar?: boolean;
}

export interface ExtractorContext {
  readonly url: URL;
  readonly target: HTMLElement;
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
