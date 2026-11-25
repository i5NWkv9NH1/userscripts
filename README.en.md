# sora-userscripts

[简体中文](README.md) | [English](README.en.md)

A modern browser userscript collection built with `Bun`, native Web Components, Top Layer `popover`, and `GM_*` APIs. Compatible with Chromium-based browsers (Chrome / Brave) and Gecko-based browsers (Firefox / Zen Browser) under `@inject-into content`.

## One-Click Install

With **Violentmonkey** or **Tampermonkey** installed in your browser, click any link below to install directly (automatically rebuilt on every GitHub push):

| Script                 | Description                                                                                                                           | Install (GitHub Raw)                                                                                                              |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------- |
| **`@sora/peek`**       | Universal hover media viewer, X original image/video/GIF resolver, X GIF to `.gif` export, Yandex/Google/Bing/SauceNAO reverse search | [Install `@sora/peek`](https://raw.githubusercontent.com/i5NWkv9NH1/userscripts/master/dist/@sora-peek.userscript.js)             |
| **`@sora/aistudio`**   | Google AI Studio long-chat lag prevention, collapse/expand code blocks, navigation guard, and full MD/JSON chat exporter              | [Install `@sora/aistudio`](https://raw.githubusercontent.com/i5NWkv9NH1/userscripts/master/dist/@sora-aistudio.userscript.js)     |
| **`@sora/playground`** | Sandbox script for testing shared UI shell, live i18n switching, shortcut conflict guards, and non-overlapping edge docking           | [Install `@sora/playground`](https://raw.githubusercontent.com/i5NWkv9NH1/userscripts/master/dist/@sora-playground.userscript.js) |

## Highlights

- **`@sora/peek`**
  - Hover trigger defaults to `top-left`, supports `Alt/Option + hover` quick preview, gallery navigation, and pan/zoom/rotate/flip gestures.
  - X (Twitter) support: resolves `?name=orig` images, picks the highest-bitrate MP4 video variant, and defaults to converting X GIFs into `.gif` (or `.mp4` on demand).
  - Adaptive viewer toolbar hides image-only controls on video/GIF and includes Yandex (default), Google, Bing, and SauceNAO reverse image search.
- **`@sora/aistudio`**
  - Trims old chat turns to prevent UI lag, with quickbar and panel buttons to collapse/expand visible code blocks and jump to the latest turn.
  - Full chat exporter auto-scrolls the conversation, supports thoughts, system instructions, and content images (excluding UI icons), with proper Markdown link encoding and ordered list numbering.
- **`@sora/playground`**
  - Demonstrates shared `@core` and `@ui` composables across multiple scripts on the same page.

## Repository Layout

- `packages/core`: Dual-mode component runtime (native Custom Elements + `@inject-into content` fallback), template engine, logger, and composables (storage, shortcuts, docking position, i18n, observers)
- `packages/ui`: Stateless shared UI components (`<s-dock-shell>`, `<s-setting-row>`, `<s-switch>`, `<s-popover>`, SVG icons)
- `packages/preview-engine`: Media viewer overlay, gesture controller, pure-TS GIF89a encoder, and extractor registry
- `sites/<site>/`: Separated by responsibility into `meta.ts`, `icon.svg`, `locales.ts`, `style.css`, `features/`, and `index.ts`
- `scripts/`: Dev watcher and production bundler (minifies JS, inline CSS/HTML templates, and SVGs with build timestamps)
- `.github/workflows/build.yml`: Runs typecheck, Biome checks, tests, and rebuilds `dist/` automatically on push

## Development

```bash
bun install
bun run dev
bun run build
bun test
bunx tsc --noEmit
bunx biome check --write .
```

To restore local agent skills from `skills-lock.json`:

```bash
bunx skills experimental_install
```

See [docs/README.md](./docs/README.md) for architecture and development guidelines.
