interface PendingEventBinding {
  el: Element;
  type: string;
  listener: EventListener;
}

const templateCache = new WeakMap<TemplateStringsArray, HTMLTemplateElement>();
const fragmentEvents = new WeakMap<DocumentFragment, PendingEventBinding[]>();

const SLOT_PREFIX = '__s_slot_';
const SLOT_SUFFIX = '__';
const EXACT_SLOT_RE = /^__s_slot_(\d+)__$/;

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'defs',
  'animate',
  'animatetransform',
]);
const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source']);

let trustedPolicy: { createHTML: (s: string) => unknown } | null | undefined;

function getTrustedPolicy() {
  if (trustedPolicy !== undefined) return trustedPolicy;
  trustedPolicy = null;
  const tt = (globalThis as Record<string, any>).trustedTypes;
  if (tt && typeof tt.createPolicy === 'function') {
    for (const name of ['sora#html', 'default', 'dompurify']) {
      try {
        trustedPolicy = tt.createPolicy(name, { createHTML: (s: string) => s });
        break;
      } catch {}
    }
  }
  return trustedPolicy;
}

function parseHtmlWithoutInnerHTML(rawHtml: string, root: DocumentFragment): void {
  const stack: Node[] = [root];
  let inSvg = 0;

  const tokenRe =
    /<!--([\s\S]*?)-->|<\/([a-zA-Z0-9_-]+)\s*>|<([a-zA-Z0-9_-]+)([^>]*?)(\/?)>|([^<]+)/g;
  const attrRe = /([a-zA-Z0-9_@?-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  for (const match of rawHtml.matchAll(tokenRe)) {
    const parent = stack[stack.length - 1] ?? root;
    const [, commentText, closeTag, openTag, attrStr, selfClose, textNode] = match;

    if (commentText !== undefined) {
      parent.appendChild(document.createComment(commentText));
    } else if (closeTag !== undefined) {
      const lower = closeTag.toLowerCase();
      if (lower === 'svg' && inSvg > 0) inSvg--;
      if (stack.length > 1) stack.pop();
    } else if (openTag !== undefined) {
      const lower = openTag.toLowerCase();
      if (lower === 'svg') inSvg++;
      const isSvg = inSvg > 0 || SVG_TAGS.has(lower);
      const el = isSvg
        ? document.createElementNS(
            SVG_NS,
            lower === 'animatetransform' ? 'animateTransform' : lower
          )
        : document.createElement(lower);

      if (attrStr) {
        for (const attrMatch of attrStr.matchAll(attrRe)) {
          const attrName = attrMatch[1];
          if (!attrName) continue;
          const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
          el.setAttribute(attrName, attrVal);
        }
      }

      parent.appendChild(el);
      if (!selfClose && !VOID_TAGS.has(lower)) {
        stack.push(el);
      } else if (lower === 'svg' && inSvg > 0) {
        inSvg--;
      }
    } else if (textNode !== undefined) {
      parent.appendChild(document.createTextNode(textNode));
    }
  }
}

export function setTemplateHTML(tpl: HTMLTemplateElement, rawHtml: string): void {
  try {
    const policy = getTrustedPolicy();
    if (policy) {
      tpl.innerHTML = policy.createHTML(rawHtml) as unknown as string;
      return;
    }
    tpl.innerHTML = rawHtml;
  } catch {
    tpl.content.replaceChildren();
    parseHtmlWithoutInnerHTML(rawHtml, tpl.content);
  }
}

function buildTemplateElement(strings: TemplateStringsArray): HTMLTemplateElement {
  let acc = '';
  for (let i = 0; i < strings.length; i++) {
    acc += strings[i];
    if (i < strings.length - 1) {
      const lastOpen = acc.lastIndexOf('<');
      const lastClose = acc.lastIndexOf('>');
      const insideTag = lastOpen > lastClose;
      const token = `${SLOT_PREFIX}${i}${SLOT_SUFFIX}`;

      if (insideTag) {
        const trimmed = acc.trimEnd();
        if (trimmed.endsWith('=')) {
          acc += `"${token}"`;
        } else {
          acc += token;
        }
      } else {
        acc += `<!--${token}-->`;
      }
    }
  }

  const tpl = document.createElement('template');
  setTemplateHTML(tpl, acc);
  return tpl;
}

function valueToNode(val: unknown, collectedEvents: PendingEventBinding[]): Node {
  if (val === null || val === undefined || typeof val === 'boolean') {
    return document.createTextNode('');
  }
  if (val instanceof DocumentFragment) {
    const childEvents = fragmentEvents.get(val);
    if (childEvents) {
      collectedEvents.push(...childEvents);
      fragmentEvents.delete(val);
    }
    return val;
  }
  if (val instanceof Node) {
    return val;
  }
  if (Array.isArray(val)) {
    const subFrag = document.createDocumentFragment();
    for (const item of val) {
      subFrag.appendChild(valueToNode(item, collectedEvents));
    }
    return subFrag;
  }
  return document.createTextNode(String(val));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): DocumentFragment {
  let tpl = templateCache.get(strings);
  if (!tpl) {
    tpl = buildTemplateElement(strings);
    templateCache.set(strings, tpl);
  }

  const fragment = tpl.content.cloneNode(true) as DocumentFragment;
  if (values.length === 0) return fragment;

  const elements: Element[] = [];
  const comments: Comment[] = [];

  const walker = document.createTreeWalker(
    fragment,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      elements.push(current as Element);
    } else if (current.nodeType === Node.COMMENT_NODE) {
      comments.push(current as Comment);
    }
    current = walker.nextNode();
  }

  const pendingEvents: PendingEventBinding[] = [];

  for (const el of elements) {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const match = attr.value.match(EXACT_SLOT_RE);
      if (!match) continue;

      const idx = Number(match[1]);
      const val = values[idx];

      if (attr.name.startsWith('@')) {
        const eventType = attr.name.slice(1);
        el.removeAttribute(attr.name);
        if (typeof val === 'function') {
          pendingEvents.push({
            el,
            type: eventType,
            listener: val as EventListener,
          });
        }
      } else if (attr.name.startsWith('?')) {
        const boolAttr = attr.name.slice(1);
        el.removeAttribute(attr.name);
        el.toggleAttribute(boolAttr, Boolean(val));
      } else {
        if (typeof val === 'boolean') {
          el.toggleAttribute(attr.name, val);
        } else if (val === null || val === undefined) {
          el.removeAttribute(attr.name);
        } else {
          el.setAttribute(attr.name, String(val));
        }
      }
    }
  }

  for (const comment of comments) {
    const match = comment.data.match(EXACT_SLOT_RE);
    if (!match) continue;
    const idx = Number(match[1]);
    const replacement = valueToNode(values[idx], pendingEvents);
    comment.replaceWith(replacement);
  }

  if (pendingEvents.length > 0) {
    fragmentEvents.set(fragment, pendingEvents);
  }

  return fragment;
}

export function bindFragmentEvents(fragment: DocumentFragment, signal: AbortSignal): void {
  const bindings = fragmentEvents.get(fragment);
  if (!bindings) return;
  for (const { el, type, listener } of bindings) {
    el.addEventListener(type, listener, { signal });
  }
  fragmentEvents.delete(fragment);
}
