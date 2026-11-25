// packages/ui/icons/index.ts
import { setTemplateHTML } from '@core';

const iconTemplateCache = new Map<string, HTMLTemplateElement>();

export const Icons = {
  lens: `<svg aria-hidden='true' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='4'><animate attributeName='r' values='3.5;4.5;3.5' dur='2.4s' repeatCount='indefinite'/></circle><path d='M12 3v2M12 19v2M3 12h2M19 12h2'/></svg>`,
  sparkles: `<svg aria-hidden='true' width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z'><animateTransform attributeName='transform' type='rotate' values='0 12 12;8 12 12;0 12 12' dur='3s' repeatCount='indefinite'/></path></svg>`,
  chevronLeft: `<svg aria-hidden='true' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M15 18l-6-6 6-6'/></svg>`,
  chevronRight: `<svg aria-hidden='true' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 18l6-6-6-6'/></svg>`,
  zoomIn: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><path d='M21 21l-4.35-4.35M11 8v6M8 11h6'/></svg>`,
  zoomOut: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><path d='M21 21l-4.35-4.35M8 11h6'/></svg>`,
  rotateLeft: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'/><path d='M3 3v5h5'/></svg>`,
  rotateRight: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/></svg>`,
  flipH: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M12 20v2M12 14v2M12 8v2M12 2v2'/></svg>`,
  reset: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 8'/><path d='M21 3v5h-5M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64L3 16'/><path d='M3 21v-5h5'/></svg>`,
  download: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'/></svg>`,
  copy: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='9' y='9' width='13' height='13' rx='2' ry='2'/><path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'/></svg>`,
  search: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/></svg>`,
  externalLink: `<svg aria-hidden='true' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3'/></svg>`,
  minimize: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'><path d='M5 12h14'/></svg>`,
  close: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round'><path d='M18 6L6 18M6 6l12 12'/></svg>`,
  trash: `<svg aria-hidden='true' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/></svg>`,
  keyboard: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect width='20' height='16' x='2' y='4' rx='2'/><path d='M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10'/></svg>`,
  globe: `<svg aria-hidden='true' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/></svg>`,
  video: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='23 7 16 12 23 17 23 7'/><rect x='1' y='5' width='15' height='14' rx='2' ry='2'/></svg>`,
  collapseCode: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m7 4 5 5 5-5M7 20l5-5 5 5'/></svg>`,
  expandCode: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m7 15 5 5 5-5M7 9l5-5 5 5'/></svg>`,
  arrowDown: `<svg aria-hidden='true' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 5v14M19 12l-7 7-7-7'/></svg>`,
} as const;

export function svgIcon(svgString: string): DocumentFragment {
  let tpl = iconTemplateCache.get(svgString);
  if (!tpl) {
    tpl = document.createElement('template');
    setTemplateHTML(tpl, svgString);
    iconTemplateCache.set(svgString, tpl);
  }
  return tpl.content.cloneNode(true) as DocumentFragment;
}
