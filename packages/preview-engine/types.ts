export interface ResolvedMedia {
  readonly originalUrl: string;
  readonly previewUrl: string;
  readonly title?: string;
  readonly tag?: string;
  readonly sourcePage?: string;
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
  resolve(
    element: HTMLElement,
    ctx: ExtractorContext
  ): ResolvedMedia | null | Promise<ResolvedMedia | null>;
}
