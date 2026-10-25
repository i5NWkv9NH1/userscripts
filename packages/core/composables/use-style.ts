export function css(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += String(values[i] ?? '');
    }
  }
  return result;
}

const ATOMIC_THEME_CSS = css`
  :host {
    color-scheme: light dark;
    --s-bg: light-dark(rgba(255, 255, 255, 0.86), rgba(20, 20, 26, 0.86));
    --s-surface: light-dark(rgba(244, 244, 248, 0.9), rgba(34, 34, 44, 0.85));
    --s-surface-hover: light-dark(rgba(228, 228, 235, 0.95), rgba(48, 48, 62, 0.95));
    --s-text: light-dark(#18181b, #f4f4f6);
    --s-text-muted: light-dark(#71717a, #a1a1aa);
    --s-border: light-dark(rgba(0, 0, 0, 0.09), rgba(255, 255, 255, 0.12));
    --s-accent: light-dark(#4f46e5, #6366f1);
    --s-accent-hover: light-dark(#4338ca, #818cf8);
    --s-danger: light-dark(#dc2626, #f87171);
    --s-danger-bg: light-dark(rgba(220, 38, 38, 0.1), rgba(239, 68, 68, 0.16));
    --s-shadow: light-dark(
      0 18px 40px -10px rgba(0, 0, 0, 0.14),
      0 20px 45px -10px rgba(0, 0, 0, 0.55)
    );
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
    color: var(--s-text);
    box-sizing: border-box;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .flex { display: flex; }
  .inline-flex { display: inline-flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .justify-center { justify-content: center; }
  .gap-1 { gap: 4px; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .gap-4 { gap: 16px; }
  .flex-1 { flex: 1 1 0%; }
  .w-full { width: 100%; }
  .text-xs { font-size: 11px; line-height: 1.4; }
  .text-sm { font-size: 13px; line-height: 1.5; }
  .font-medium { font-weight: 500; }
  .font-semibold { font-weight: 600; }
  .font-mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
  .text-muted { color: var(--s-text-muted); }
  .select-none { user-select: none; }

  .s-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--s-border);
    background: var(--s-surface);
    color: var(--s-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;

    &:hover {
      background: var(--s-surface-hover);
    }

    &:active {
      transform: scale(0.97);
    }
  }

  .s-btn-primary {
    background: var(--s-accent);
    border-color: transparent;
    color: #ffffff;

    &:hover {
      background: var(--s-accent-hover);
    }
  }

  .s-btn-danger {
    background: var(--s-danger-bg);
    border-color: color-mix(in oklch, var(--s-danger) 35%, transparent);
    color: var(--s-danger);

    &:hover {
      background: color-mix(in oklch, var(--s-danger) 24%, transparent);
    }
  }

  .s-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: color-mix(in oklch, var(--s-accent) 18%, transparent);
    color: var(--s-accent);
  }
`;

let sharedAtomicSheet: CSSStyleSheet | null = null;

export function getAtomicThemeSheet(): CSSStyleSheet {
  if (!sharedAtomicSheet) {
    sharedAtomicSheet = new CSSStyleSheet();
    sharedAtomicSheet.replaceSync(ATOMIC_THEME_CSS);
  }
  return sharedAtomicSheet;
}
