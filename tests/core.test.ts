import { describe, expect, test } from 'bun:test';
import {
  formatComboLabel,
  getAltKeyDisplayName,
  isMac,
} from '../packages/core/composables/use-hotkey.ts';
import { formatMessage } from '../packages/core/composables/use-i18n.ts';
import { BaseComponent, defineComponent } from '../packages/core/dom/base-component.ts';
import {
  extractOriginalFileParts,
  formatDownloadFilename,
} from '../packages/preview-engine/filename.ts';
import { minifyCssString, minifyTaggedTemplatesInTs } from '../scripts/meta.ts';
import {
  isContentImageElement,
  normalizeMarkdownHref,
} from '../sites/aistudio/features/chat-exporter.ts';

describe('filename formatting', () => {
  test('extracts X image name and format query param', () => {
    const parts = extractOriginalFileParts(
      'https://pbs.twimg.com/media/HX9az8QbkAEcFn5?format=jpg&name=orig'
    );
    expect(parts).toEqual({ name: 'HX9az8QbkAEcFn5', ext: 'jpg' });
  });

  test('defaults to original filename when template is empty or {original}', () => {
    const url = 'https://pbs.twimg.com/media/HX9az8QbkAEcFn5?format=png&name=orig';
    expect(formatDownloadFilename('{original}', url, 1920, 1080, 'png', 'x.com')).toBe(
      'HX9az8QbkAEcFn5.png'
    );
    expect(formatDownloadFilename('', url, 1920, 1080, 'png', 'x.com')).toBe('HX9az8QbkAEcFn5.png');
  });

  test('supports custom filename template placeholders', () => {
    const url = 'https://video.twimg.com/tweet_video/AbCdEf123.mp4';
    expect(formatDownloadFilename('{site}-{name}-{w}x{h}', url, 640, 480, 'mp4', 'www.x.com')).toBe(
      'x.com-AbCdEf123-640x480.mp4'
    );
  });
});

describe('css minifier', () => {
  test('preserves spaces inside calc() expressions', () => {
    const out = minifyCssString('.box { width: calc(100% - 20px); height: calc(50vh + 10px); }');
    expect(out).toContain('calc(100% - 20px)');
    expect(out).toContain('calc(50vh + 10px)');
  });

  test('minifies css and html tagged templates in ts while keeping expressions', () => {
    const sample = `
      const s = css\`
        /* comment */
        .box {
          width: calc(100% - 12px);
          color: red;
        }
      \`;
      const tpl = html\`
        <div class="wrap">
          <!-- hidden -->
          <button
            id="btn"
            @click=\${() => html\`<span>\${ok}</span>\`}
          >
            Go
          </button>
        </div>
      \`;
    `;
    const out = minifyTaggedTemplatesInTs(sample);
    const expectedHtml = [
      'html`<div class="wrap"><button id="btn" @click=$',
      '{() => html`<span>$',
      '{ok}</span>`}> Go </button></div>`',
    ].join('');
    expect(out).toContain('css`.box{width:calc(100% - 12px);color:red;}`');
    expect(out).toContain(expectedHtml);
  });
});

describe('i18n message formatter', () => {
  test('replaces template placeholders', () => {
    expect(formatMessage('Visible {visible} turns', { visible: 12 })).toBe('Visible 12 turns');
  });
});

describe('hotkey platform display', () => {
  test('formats Alt and Meta labels according to current OS', () => {
    expect(getAltKeyDisplayName()).toBe(isMac ? 'Option (⌥)' : 'Alt');
    expect(formatComboLabel('Alt+KeyP')).toBe(isMac ? 'Option (⌥) + P' : 'Alt + P');
  });
});

describe('aistudio chat exporter markdown & image filtering', () => {
  test('encodes spaces and quotes in Google Search Suggestions URLs and resolves relative hrefs', () => {
    const searchUrl = normalizeMarkdownHref(
      'https://www.google.com/search?q="小米售后" "刷机" 免费&client=app-vertex-grounding'
    );
    expect(searchUrl).not.toContain(' ');
    expect(searchUrl).not.toContain('"');
    expect(searchUrl).toContain('%22%E5%B0%8F%E7%B1%B3%E5%94%AE%E5%90%8E%22%20');

    const learnMoreUrl = normalizeMarkdownHref('/docs/grounding/search-suggestions');
    expect(learnMoreUrl).toBe('https://aistudio.google.com/docs/grounding/search-suggestions');
  });

  test('excludes Thinking icon and UI chrome images while keeping real content images', () => {
    const makeMockImg = (opts: {
      alt?: string;
      src: string;
      inThought?: boolean;
    }): HTMLImageElement =>
      ({
        alt: opts.alt ?? '',
        src: opts.src,
        currentSrc: opts.src,
        closest: (selector: string) =>
          opts.inThought && selector.includes('ms-thought-chunk') ? ({} as Element) : null,
      }) as unknown as HTMLImageElement;

    expect(
      isContentImageElement(
        makeMockImg({ alt: 'Thinking', src: 'https://www.gstatic.com/aistudio/thinking.png' })
      )
    ).toBe(false);
    expect(
      isContentImageElement(
        makeMockImg({ alt: 'Diagram', src: 'https://example.com/a.png', inThought: true })
      )
    ).toBe(false);
    expect(
      isContentImageElement(
        makeMockImg({ alt: 'image.png', src: 'https://lh3.googleusercontent.com/real-photo' })
      )
    ).toBe(true);
  });
});

describe('content-world customElements=null compatibility', () => {
  test('defineComponent does not throw when customElements is null', () => {
    const prev = (globalThis as Record<string, unknown>).customElements;
    (globalThis as Record<string, unknown>).customElements = null;
    try {
      class DummyComp extends BaseComponent {
        static readonly tagName = 's-test-dummy';
        protected readonly stylesheet = '';
        protected render(): DocumentFragment {
          return {} as DocumentFragment;
        }
      }
      expect(() => defineComponent('s-test-dummy', DummyComp)).not.toThrow();
    } finally {
      (globalThis as Record<string, unknown>).customElements = prev;
    }
  });
});
